'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {Icon, Text} from '@gravity-ui/uikit';
import {Sparkles} from '@gravity-ui/icons';
import type {
  ChatStatus,
  ChatType,
  TChatMessage,
  TSubmitData,
} from '@gravity-ui/aikit/types';

// aikit's ChatContainer pulls in @diplodoc/transform (markdown) which references
// Node built-ins; load it client-only so it never evaluates during SSR/prerender.
const ChatContainer = dynamic(
  () => import('@gravity-ui/aikit').then((m) => ({default: m.ChatContainer})),
  {ssr: false},
);
import {AppHeader} from '@/components/AppHeader';
import {CHAT_SUGGESTIONS} from './suggestions';
import styles from './ChatPage.module.css';

const STORAGE_KEY = 'cf-chat-v1';

type StoredState = {
  chats: ChatType[];
  activeChatId: string | null;
  messagesByChat: Record<string, TChatMessage[]>;
};

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistantText(content: TChatMessage['content']): string {
  return typeof content === 'string' ? content : '';
}

export function ChatPage() {
  const [chats, setChats] = useState<ChatType[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, TChatMessage[]>>({});
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);

  const hydrated = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted history (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        if (Array.isArray(parsed.chats)) setChats(parsed.chats);
        if (parsed.messagesByChat && typeof parsed.messagesByChat === 'object') {
          setMessagesByChat(parsed.messagesByChat);
        }
        if (typeof parsed.activeChatId === 'string') setActiveChatId(parsed.activeChatId);
      }
    } catch {
      // Corrupt storage — start fresh.
    }
    hydrated.current = true;
  }, []);

  // Persist on change (after hydration to avoid clobbering with empty state).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const state: StoredState = {chats, activeChatId, messagesByChat};
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / serialization errors.
    }
  }, [chats, activeChatId, messagesByChat]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChatId ? messagesByChat[activeChatId] ?? [] : [];

  const appendToAssistant = useCallback(
    (chatId: string, messageId: string, delta: string) => {
      setMessagesByChat((prev) => {
        const list = prev[chatId] ?? [];
        const next = list.map((m) =>
          m.id === messageId && m.role === 'assistant'
            ? {...m, content: assistantText(m.content) + delta}
            : m,
        );
        return {...prev, [chatId]: next};
      });
    },
    [],
  );

  const setAssistantError = useCallback((chatId: string, messageId: string, text: string) => {
    setMessagesByChat((prev) => {
      const list = prev[chatId] ?? [];
      const next = list.map((m) =>
        m.id === messageId && m.role === 'assistant' && !assistantText(m.content)
          ? {...m, content: text}
          : m,
      );
      return {...prev, [chatId]: next};
    });
  }, []);

  const onSendMessage = useCallback(
    async (data: TSubmitData) => {
      const content = data.content.trim();
      if (!content || status === 'streaming' || status === 'submitted') return;

      // Ensure an active chat exists.
      let chatId = activeChatId;
      if (!chatId) {
        chatId = genId();
        const title = content.length > 48 ? `${content.slice(0, 48)}…` : content;
        const chat: ChatType = {id: chatId, name: title, createTime: new Date().toISOString()};
        setChats((prev) => [chat, ...prev]);
        setActiveChatId(chatId);
      }

      const userMsg: TChatMessage = {id: genId(), role: 'user', content};
      const assistantId = genId();
      const assistantMsg: TChatMessage = {id: assistantId, role: 'assistant', content: ''};

      const priorMessages = messagesByChat[chatId] ?? [];
      const requestMessages = [...priorMessages, userMsg].map((m) => ({
        role: m.role,
        content: assistantText(m.content) || (m.role === 'user' ? m.content : ''),
      }));

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId as string]: [...(prev[chatId as string] ?? []), userMsg, assistantMsg],
      }));
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? {...c, lastMessage: content} : c)),
      );
      setError(null);
      setStatus('submitted');

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({messages: requestMessages}),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const payload = await res.json().catch(() => null);
          const msg = payload?.error || `Ошибка сервера (${res.status}).`;
          setAssistantError(chatId, assistantId, `⚠️ ${msg}`);
          setStatus('error');
          setError(new Error(msg));
          return;
        }

        setStatus('streaming');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, {stream: true});
          if (chunk) appendToAssistant(chatId, assistantId, chunk);
        }
        setStatus('ready');
      } catch (err) {
        if (abort.signal.aborted) {
          setStatus('ready');
          return;
        }
        const e = err instanceof Error ? err : new Error('Не удалось связаться с ассистентом.');
        setAssistantError(chatId, assistantId, `⚠️ ${e.message}`);
        setStatus('error');
        setError(e);
      } finally {
        abortRef.current = null;
      }
    },
    [activeChatId, messagesByChat, status, appendToAssistant, setAssistantError],
  );

  const onCancel = useCallback(async () => {
    abortRef.current?.abort();
    setStatus('ready');
  }, []);

  const onCreateChat = useCallback(() => {
    setActiveChatId(null);
    setError(null);
    setStatus('ready');
  }, []);

  const onSelectChat = useCallback((chat: ChatType) => {
    setActiveChatId(chat.id);
    setError(null);
    setStatus('ready');
  }, []);

  const onDeleteChat = useCallback(
    async (chat: ChatType) => {
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
      setMessagesByChat((prev) => {
        const next = {...prev};
        delete next[chat.id];
        return next;
      });
      setActiveChatId((prev) => (prev === chat.id ? null : prev));
    },
    [],
  );

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.heroTitle}>
            <Icon data={Sparkles} size={18} className={styles.heroIcon} />
            <Text as="h1" variant="subheader-2">
              ИИ-ассистент FinOps
            </Text>
          </div>
          <Text as="p" variant="body-short-1" color="secondary" className={styles.heroLead}>
            Спросите про ВМ, GPU, S3, трафик или AI-модели — ответ таблицей, цены с НДС.
          </Text>
        </div>

        <div className={styles.chatShell}>
          <ChatContainer
            chats={chats}
            activeChat={activeChat}
            messages={messages}
            status={status}
            error={error}
            onSendMessage={onSendMessage}
            onCancel={onCancel}
            onCreateChat={onCreateChat}
            onSelectChat={onSelectChat}
            onDeleteChat={onDeleteChat}
            showHistory
            showNewChat
            hideTitleOnEmptyChat
            shouldParseIncompleteMarkdown
            openMarkdownLinksInNewTab
            welcomeConfig={{
              suggestions: CHAT_SUGGESTIONS,
              layout: 'grid',
              wrapText: true,
            }}
            texts={{
              headerTitle: 'Новый чат',
              emptyStateTitle: 'С чего начнём?',
              emptyStateDescription: 'Выберите пример или спросите своими словами.',
              emptyStateSuggestionsTitle: 'Примеры',
              promptPlaceholder: 'Спросите про цены облаков…',
              errorText: 'Не удалось получить ответ. Попробуйте ещё раз.',
              disclaimerText: 'Ассистент может ошибаться — проверяйте важные цифры.',
            }}
          />
        </div>
      </main>
    </>
  );
}
