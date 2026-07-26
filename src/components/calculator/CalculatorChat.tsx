'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import type {
  ChatStatus,
  ChatType,
  TChatMessage,
  TSubmitData,
  SuggestionsItem,
} from '@gravity-ui/aikit/types';
import {
  CHAT_STATUS_THINKING,
  createChatStreamParser,
} from '@/lib/chat/stream-protocol';
import {
  sidebarConfigFromTool,
  type SidebarConfigPayload,
} from '@/lib/chat/sidebar-config';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import {PRICING_DISCLAIMER} from '@/lib/pricing-disclaimer';
import chatStyles from '@/components/chat/ChatPage.module.css';
import styles from './CalculatorChat.module.css';

const ChatContainer = dynamic(
  () => import('@gravity-ui/aikit').then((m) => ({default: m.ChatContainer})),
  {
    ssr: false,
    /* Outer .shell keeps height — avoid nested placeholder collapsing the column. */
    loading: () => null,
  },
);

const STORAGE_KEY = 'cf-calculator-chat-v1';

const AI_CALC_SUGGESTIONS: SuggestionsItem[] = [
  {id: 'vm-52', title: 'Хочу ВМ на 52 vCPU и 128 GiB RAM'},
  {id: 'vm-4-16', title: 'Сравни 4 vCPU / 16 GiB по провайдерам'},
  {id: 'gpu-h100', title: 'Сколько стоит 1× H100 в месяц?'},
  {id: 'lake-medium', title: 'Оцени lakehouse medium ~75 TiB'},
];

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

export function CalculatorChat({
  period,
  onSidebarConfig,
}: {
  period: PeriodMode;
  onSidebarConfig: (payload: SidebarConfigPayload | null) => void;
}) {
  const [chats, setChats] = useState<ChatType[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, TChatMessage[]>>({});
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [showingProgress, setShowingProgress] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const progressAssistantRef = useRef<{chatId: string; messageId: string} | null>(null);
  const periodRef = useRef(period);
  periodRef.current = period;
  const onSidebarConfigRef = useRef(onSidebarConfig);
  onSidebarConfigRef.current = onSidebarConfig;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      const state: StoredState = {chats, activeChatId, messagesByChat};
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / serialization errors.
    }
  }, [storageReady, chats, activeChatId, messagesByChat]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChatId ? messagesByChat[activeChatId] ?? [] : [];

  const setAssistantContent = useCallback((chatId: string, messageId: string, content: string) => {
    setMessagesByChat((prev) => {
      const list = prev[chatId] ?? [];
      const next = list.map((m) =>
        m.id === messageId && m.role === 'assistant' ? {...m, content} : m,
      );
      return {...prev, [chatId]: next};
    });
  }, []);

  const appendToAssistant = useCallback((chatId: string, messageId: string, delta: string) => {
    setMessagesByChat((prev) => {
      const list = prev[chatId] ?? [];
      const next = list.map((m) =>
        m.id === messageId && m.role === 'assistant'
          ? {...m, content: assistantText(m.content) + delta}
          : m,
      );
      return {...prev, [chatId]: next};
    });
  }, []);

  const clearProgressAssistant = useCallback(() => {
    const ref = progressAssistantRef.current;
    if (!ref) return;
    setMessagesByChat((prev) => {
      const list = prev[ref.chatId] ?? [];
      const next = list.map((m) =>
        m.id === ref.messageId && m.role === 'assistant' ? {...m, content: ''} : m,
      );
      return {...prev, [ref.chatId]: next};
    });
    progressAssistantRef.current = null;
    setShowingProgress(false);
  }, []);

  const onSendMessage = useCallback(
    async (data: TSubmitData) => {
      const content = data.content.trim();
      if (
        !content ||
        status === 'streaming' ||
        status === 'submitted' ||
        status === 'streaming_loading'
      ) {
        return;
      }

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
        [chatId as string]: [...priorMessages, userMsg, assistantMsg],
      }));
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? {...c, lastMessage: content} : c)),
      );
      setError(null);
      progressAssistantRef.current = {chatId, messageId: assistantId};
      setAssistantContent(chatId, assistantId, CHAT_STATUS_THINKING);
      setShowingProgress(true);
      setStatus('streaming_loading');

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({messages: requestMessages, surface: 'calculator'}),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const payload = await res.json().catch(() => null);
          const msg = payload?.error || `Ошибка сервера (${res.status}).`;
          setShowingProgress(false);
          progressAssistantRef.current = null;
          setAssistantContent(chatId, assistantId, `⚠️ ${msg}`);
          setStatus('error');
          setError(new Error(msg));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createChatStreamParser();
        let startedAnswer = false;

        const applyEvents = (events: ReturnType<typeof parser.push>) => {
          for (const event of events) {
            if (event.type === 'sidebar_config') {
              const mapped = sidebarConfigFromTool(
                event.tool,
                event.args,
                periodRef.current,
              );
              if (mapped) onSidebarConfigRef.current(mapped);
              continue;
            }
            if (event.type === 'status') {
              if (!startedAnswer) {
                setAssistantContent(chatId, assistantId, event.text);
                setShowingProgress(true);
              }
              continue;
            }
            if (!startedAnswer) {
              startedAnswer = true;
              setShowingProgress(false);
              progressAssistantRef.current = null;
              setStatus('streaming');
              setAssistantContent(chatId, assistantId, event.text);
              continue;
            }
            appendToAssistant(chatId, assistantId, event.text);
          }
        };

        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, {stream: true});
          if (chunk) applyEvents(parser.push(chunk));
        }
        applyEvents(parser.flush());

        setShowingProgress(false);
        progressAssistantRef.current = null;
        setStatus('ready');
      } catch (err) {
        if (abort.signal.aborted) {
          clearProgressAssistant();
          setStatus('ready');
          return;
        }
        const e = err instanceof Error ? err : new Error('Не удалось связаться с ассистентом.');
        setShowingProgress(false);
        progressAssistantRef.current = null;
        setAssistantContent(chatId, assistantId, `⚠️ ${e.message}`);
        setStatus('error');
        setError(e);
      } finally {
        abortRef.current = null;
      }
    },
    [
      activeChatId,
      messagesByChat,
      status,
      appendToAssistant,
      setAssistantContent,
      clearProgressAssistant,
    ],
  );

  const onCancel = useCallback(async () => {
    abortRef.current?.abort();
    clearProgressAssistant();
    setStatus('ready');
  }, [clearProgressAssistant]);

  const onCreateChat = useCallback(() => {
    setActiveChatId(null);
    setError(null);
    setShowingProgress(false);
    progressAssistantRef.current = null;
    setStatus('ready');
    onSidebarConfigRef.current(null);
  }, []);

  const onSelectChat = useCallback((chat: ChatType) => {
    setActiveChatId(chat.id);
    setError(null);
    setShowingProgress(false);
    progressAssistantRef.current = null;
    setStatus('ready');
  }, []);

  const onDeleteChat = useCallback(async (chat: ChatType) => {
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    setMessagesByChat((prev) => {
      const next = {...prev};
      delete next[chat.id];
      return next;
    });
    setActiveChatId((prev) => (prev === chat.id ? null : prev));
  }, []);

  return (
    <div
      className={`${chatStyles.chatShell} ${styles.shell}`}
      data-progress={showingProgress ? '1' : undefined}
    >
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
        showHistory={false}
        showNewChat
        hideTitleOnEmptyChat
        shouldParseIncompleteMarkdown
        openMarkdownLinksInNewTab
        messageListConfig={{
          loaderStatuses: [],
        }}
        promptInputProps={{
          bodyProps: {
            autoFocus: false,
            autoFocusOnNewChat: false,
            autoFocusOnChatSelect: false,
            maxRows: narrow ? 4 : 8,
          },
        }}
        welcomeConfig={{
          suggestions: AI_CALC_SUGGESTIONS,
          layout: 'list',
          wrapText: true,
        }}
        texts={{
          headerTitle: 'AI-конфигурация',
          emptyStateTitle: 'Опишите конфигурацию',
          emptyStateDescription:
            'Напишите текстом — справа появится минимальная цена и альтернативы.',
          emptyStateSuggestionsTitle: 'Примеры',
          promptPlaceholder: 'Например: хочу 52 ядра и 128 ГиБ…',
          errorText: 'Не удалось получить ответ. Попробуйте ещё раз.',
          disclaimerText: `${PRICING_DISCLAIMER} Цены справа — из калькулятора; ассистент может ошибаться в тексте.`,
        }}
      />
    </div>
  );
}
