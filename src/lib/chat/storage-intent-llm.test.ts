import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import type {ChatMessage, CompletionChoiceMessage} from '@/lib/chat/gigachat';
import {
  formatStorageIntentAddendum,
  needsLlmStorageIntent,
  parseStorageIntentLlmJson,
  resolveStorageIntent,
  storageIntentLlmModeFromEnv,
} from '@/lib/chat/storage-intent-llm';
import {applyStorageIntentToDomains, matchPlanningDomains} from '@/lib/chat/system-prompt';

describe('storageIntentLlmModeFromEnv', () => {
  it('defaults to on and accepts shadow/off', () => {
    assert.equal(storageIntentLlmModeFromEnv({}), 'on');
    assert.equal(storageIntentLlmModeFromEnv({CHAT_STORAGE_INTENT_LLM: 'shadow'}), 'shadow');
    assert.equal(storageIntentLlmModeFromEnv({CHAT_STORAGE_INTENT_LLM: 'OFF'}), 'off');
    assert.equal(storageIntentLlmModeFromEnv({CHAT_STORAGE_INTENT_LLM: 'weird'}), 'on');
  });
});

describe('needsLlmStorageIntent', () => {
  it('calls LLM only for ambiguous / storage-ish none', () => {
    assert.equal(needsLlmStorageIntent('both', 'сравни блочный и s3'), true);
    assert.equal(needsLlmStorageIntent('none', 'сколько стоит хранение 10 тб'), true);
    assert.equal(needsLlmStorageIntent('block', '100 ТБ блочный SSD'), false);
    assert.equal(needsLlmStorageIntent('object', 'объектное Standard 10 ТБ'), false);
    assert.equal(needsLlmStorageIntent('none', 'привет как дела'), false);
  });
});

describe('parseStorageIntentLlmJson', () => {
  it('parses strict and messy JSON', () => {
    const ok = parseStorageIntentLlmJson(
      '{"storage":"block","volumeGiB":102400,"confidence":0.91,"reason":"блочный диск"}',
    );
    assert.equal(ok?.storage, 'block');
    assert.equal(ok?.volumeGiB, 102400);
    assert.equal(ok?.confidence, 0.91);

    const messy = parseStorageIntentLlmJson(
      'Sure.\n```json\n{"storage":"both","volumeGiB":null,"confidence":0.8,"reason":"compare"}\n```',
    );
    assert.equal(messy?.storage, 'both');
    assert.equal(messy?.volumeGiB, null);

    assert.equal(parseStorageIntentLlmJson('not json'), null);
    assert.equal(parseStorageIntentLlmJson('{"storage":"tape"}'), null);
  });
});

describe('resolveStorageIntent', () => {
  it('off mode never calls LLM', async () => {
    let called = 0;
    const r = await resolveStorageIntent('Сравни блочный SSD и S3 на 100 ТБ', {
      mode: 'off',
      hasKey: () => true,
      complete: async () => {
        called += 1;
        return {role: 'assistant', content: '{}'};
      },
    });
    assert.equal(called, 0);
    assert.equal(r.source, 'regex');
    assert.equal(r.storage, 'both');
    assert.equal(r.llmCalled, false);
  });

  it('shadow calls LLM on both but keeps regex storage', async () => {
    let called = 0;
    const r = await resolveStorageIntent('Сравни блочный SSD и объектное на 100 ТБ', {
      mode: 'shadow',
      hasKey: () => true,
      complete: async (_messages: ChatMessage[]) => {
        called += 1;
        return {
          role: 'assistant',
          content: '{"storage":"block","volumeGiB":102400,"confidence":0.99,"reason":"wrong on purpose"}',
        } satisfies CompletionChoiceMessage;
      },
    });
    assert.equal(called, 1);
    assert.equal(r.llmCalled, true);
    assert.equal(r.llmStorage, 'block');
    assert.equal(r.storage, 'both', 'shadow must not override planning');
    assert.equal(r.source, 'regex');
  });

  it('on mode overrides when confidence high', async () => {
    const q = 'Сравни блочный SSD и объектное хранилище на 50 ТБ — но по сути нужен только диск ВМ';
    const r = await resolveStorageIntent(q, {
      mode: 'on',
      hasKey: () => true,
      complete: async () => ({
        role: 'assistant',
        content:
          '{"storage":"block","volumeGiB":51200,"confidence":0.88,"reason":"нужен только диск"}',
      }),
    });
    assert.equal(r.regexStorage, 'both');
    assert.equal(r.llmCalled, true);
    assert.equal(r.storage, 'block');
    assert.equal(r.source, 'llm');
    assert.equal(r.volumeGiB, 51200);
  });

  it('on mode falls back on low confidence', async () => {
    const r = await resolveStorageIntent('Сравни блочный диск и S3 Standard', {
      mode: 'on',
      hasKey: () => true,
      confidenceThreshold: 0.7,
      complete: async () => ({
        role: 'assistant',
        content: '{"storage":"object","volumeGiB":null,"confidence":0.2,"reason":"guess"}',
      }),
    });
    assert.equal(r.llmCalled, true);
    assert.equal(r.source, 'llm-fallback-regex');
    assert.equal(r.storage, 'both');
  });

  it('skips LLM when regex is decisive block', async () => {
    let called = 0;
    const r = await resolveStorageIntent('100 ТБ блочный SSD диск', {
      mode: 'on',
      hasKey: () => true,
      complete: async () => {
        called += 1;
        return {role: 'assistant', content: '{}'};
      },
    });
    assert.equal(called, 0);
    assert.equal(r.storage, 'block');
    assert.equal(r.source, 'regex');
  });

  it('follow-up block after S3 history is regex block (not sticky both)', async () => {
    let called = 0;
    let llmUser = '';
    const r = await resolveStorageIntent('а теперь то же для блочного SSD', {
      historyText: 'Сколько стоит 100 ТБ объектного хранилища Standard?',
      mode: 'on',
      hasKey: () => true,
      complete: async (messages: ChatMessage[]) => {
        called += 1;
        llmUser = String(messages.find((m) => m.role === 'user')?.content ?? '');
        return {
          role: 'assistant',
          content: '{"storage":"block","volumeGiB":102400,"confidence":0.9,"reason":"follow-up block"}',
        };
      },
    });
    assert.equal(r.regexStorage, 'block');
    assert.equal(r.storage, 'block');
    assert.equal(r.source, 'regex');
    assert.equal(called, 0, 'decisive current-turn block must not call LLM');
    assert.equal(llmUser, '');

    // Domains: override drops S3 even if lexical haystack still saw object history.
    const lexical = matchPlanningDomains(
      'Сколько стоит 100 ТБ объектного хранилища Standard?\nа теперь то же для блочного SSD',
    );
    const gated = applyStorageIntentToDomains(
      lexical,
      r.storage,
      'а теперь то же для блочного SSD',
    );
    assert.ok(gated.includes('compute'));
    assert.ok(!gated.includes('s3'), `must drop S3 card: ${gated.join(',')}`);
  });

  it('passes history to LLM only as context when current turn is ambiguous', async () => {
    let llmUser = '';
    const r = await resolveStorageIntent('Сравни блочный SSD и объектное на 100 ТБ', {
      historyText: 'Ранее смотрели CDN',
      mode: 'shadow',
      hasKey: () => true,
      complete: async (messages: ChatMessage[]) => {
        llmUser = String(messages.find((m) => m.role === 'user')?.content ?? '');
        return {
          role: 'assistant',
          content: '{"storage":"both","volumeGiB":102400,"confidence":0.9,"reason":"compare"}',
        };
      },
    });
    assert.equal(r.llmCalled, true);
    assert.match(llmUser, /История \(user\):[\s\S]*CDN/);
    assert.match(llmUser, /Текущий вопрос:[\s\S]*блочный SSD/);
  });
});

describe('formatStorageIntentAddendum', () => {
  it('emits block/object/both machine hints', () => {
    assert.match(
      formatStorageIntentAddendum({
        storage: 'block',
        volumeGiB: 102400,
        confidence: 0.9,
        source: 'llm',
        regexStorage: 'both',
        llmStorage: 'block',
        reason: 'x',
        llmCalled: true,
      }),
      /storage=block.*volumeGiB=102400[\s\S]*ЗАПРЕЩЕНО category=storage/i,
    );
    assert.match(
      formatStorageIntentAddendum({
        storage: 'both',
        volumeGiB: null,
        confidence: 0.8,
        source: 'regex',
        regexStorage: 'both',
        llmStorage: null,
        reason: null,
        llmCalled: false,
      }),
      /Два search_prices/i,
    );
    assert.equal(
      formatStorageIntentAddendum({
        storage: 'none',
        volumeGiB: null,
        confidence: 0.4,
        source: 'regex',
        regexStorage: 'none',
        llmStorage: null,
        reason: null,
        llmCalled: false,
      }),
      '',
    );
  });
});

describe('applyStorageIntentToDomains', () => {
  it('block override drops s3 card; object drops compute when no VM cues', () => {
    const both = matchPlanningDomains(
      'Сравни блочный SSD и объектное хранилище Standard на 100 ТБ',
    );
    const asBlock = applyStorageIntentToDomains(both, 'block', 'блочный SSD 100 ТБ');
    assert.ok(asBlock.includes('compute'));
    assert.ok(!asBlock.includes('s3'));

    const asObject = applyStorageIntentToDomains(both, 'object', 'только Object Storage 100 ТБ');
    assert.ok(asObject.includes('s3'));
    assert.ok(!asObject.includes('compute'));
  });
});
