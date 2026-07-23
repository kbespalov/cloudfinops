'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {useRouter, useSearchParams} from 'next/navigation';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chats, setChats] = useState<ChatType[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, TChatMessage[]>>({});
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  // Start false for SSR/hydration match; matchMedia updates after mount.
  const [narrow, setNarrow] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  const deeplinkHandled = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Lock document scroll so the composer stays in the viewport on mobile.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Pin chat shell to the *visual* viewport so the iOS keyboard does not cover Send.
  // Only shift offsetTop when the viewport is actually keyboard-shrunk — avoid fighting
  // accidental pinch-zoom (which also changes offsetTop and makes Send "disappear").
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const layoutH = window.innerHeight || vv.height;
        const height = vv.height;
        root.style.setProperty('--cf-vv-height', `${height}px`);
        const keyboardLikely = height < layoutH * 0.85 && vv.offsetTop > 0;
        root.style.setProperty(
          '--cf-vv-offset-top',
          keyboardLikely ? `${vv.offsetTop}px` : '0px',
        );
      });
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
      root.style.removeProperty('--cf-vv-height');
      root.style.removeProperty('--cf-vv-offset-top');
    };
  }, []);

  // Keep composer / Send in view when the soft keyboard opens on mobile.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest('.g-aikit-prompt-input')) return;

      const footer =
        target.closest('.g-aikit-chat-container__footer') ??
        document.querySelector('.g-aikit-chat-container__footer');
      if (!(footer instanceof HTMLElement)) return;

      // After keyboard animation; double-rAF + short timeout covers iOS.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          footer.scrollIntoView({block: 'end', behavior: 'smooth'});
        });
      });
      window.setTimeout(() => {
        footer.scrollIntoView({block: 'end', behavior: 'smooth'});
      }, 300);
    };

    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
    setStorageReady(true);
  }, []);

  // Persist on change only after storage was loaded — otherwise the first
  // empty render would clobber localStorage (and wipe a landing deep-link).
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
    async (data: TSubmitData, options?: {forceNew?: boolean}) => {
      const content = data.content.trim();
      if (!content || status === 'streaming' || status === 'submitted') return;

      // Ensure an active chat exists (landing deep-link always starts a fresh one).
      let chatId = options?.forceNew ? null : activeChatId;
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

      const priorMessages = options?.forceNew ? [] : (messagesByChat[chatId] ?? []);
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

  // Landing / shared links: /chat?q=… → new chat + auto-send, then strip query.
  useEffect(() => {
    if (!storageReady || deeplinkHandled.current) return;
    const q = searchParams.get('q')?.trim();
    if (!q) return;

    // Guard React Strict Mode remount + rapid re-entry with the same q.
    try {
      const raw = sessionStorage.getItem('cf-chat-deeplink');
      if (raw) {
        const prev = JSON.parse(raw) as {q?: string; at?: number};
        if (prev.q === q && typeof prev.at === 'number' && Date.now() - prev.at < 4000) {
          router.replace('/chat', {scroll: false});
          deeplinkHandled.current = true;
          return;
        }
      }
      sessionStorage.setItem('cf-chat-deeplink', JSON.stringify({q, at: Date.now()}));
    } catch {
      // sessionStorage unavailable — fall through with ref-only guard.
    }

    deeplinkHandled.current = true;
    router.replace('/chat', {scroll: false});
    void onSendMessage({content: q}, {forceNew: true});
  }, [storageReady, searchParams, router, onSendMessage]);

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
    <div className={styles.viewport}>
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.heroTitle}>
            <Icon data={Sparkles} size={18} className={styles.heroIcon} />
            <Text as="h1" variant="subheader-2">
              ИИ-ассистент FinOps
            </Text>
          </div>
          <Text as="p" variant="body-short" color="secondary" className={styles.heroLead}>
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
            promptInputProps={{
              bodyProps: {
                autoFocus: false,
                autoFocusOnNewChat: false,
                autoFocusOnChatSelect: false,
                maxRows: narrow ? 5 : 15,
              },
            }}
            welcomeConfig={{
              suggestions: narrow ? CHAT_SUGGESTIONS.slice(0, 4) : CHAT_SUGGESTIONS,
              layout: narrow ? 'list' : 'grid',
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
    </div>
  );
}
