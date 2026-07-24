import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  CHAT_STATUS_COMPOSING,
  CHAT_STATUS_THINKING,
  createChatStreamParser,
  encodeChatStreamEvent,
  parseChatStreamLine,
  statusLabelForTool,
} from './stream-protocol';
import {CHAT_TOOL_NAMES} from './tool-call-recovery';

const TOOL_NAME_LEAK_RE = new RegExp(`\\b(?:${CHAT_TOOL_NAMES.join('|')})\\b`);

describe('stream-protocol', () => {
  it('maps every registered tool to a Russian progress label', () => {
    for (const name of CHAT_TOOL_NAMES) {
      const label = statusLabelForTool(name);
      assert.match(label, /…$/);
      assert.equal(label.includes(name), false);
      assert.match(label, /[а-яА-ЯёЁ]/);
    }
  });

  it('falls back for unknown tools without leaking the raw name as the only text', () => {
    assert.equal(statusLabelForTool('secret_internal_tool'), 'Собираю данные…');
  });

  it('round-trips status and delta events', () => {
    const status = encodeChatStreamEvent({type: 'status', text: CHAT_STATUS_THINKING});
    const delta = encodeChatStreamEvent({type: 'delta', text: 'Привет'});
    assert.deepEqual(parseChatStreamLine(status), {type: 'status', text: CHAT_STATUS_THINKING});
    assert.deepEqual(parseChatStreamLine(delta), {type: 'delta', text: 'Привет'});
    assert.equal(parseChatStreamLine(''), null);
    assert.equal(parseChatStreamLine('{not json'), null);
    assert.equal(parseChatStreamLine('{"type":"other","text":"x"}'), null);
  });

  it('parses events split across chunk boundaries', () => {
    const parser = createChatStreamParser();
    const wire =
      encodeChatStreamEvent({type: 'status', text: CHAT_STATUS_THINKING}) +
      encodeChatStreamEvent({type: 'status', text: statusLabelForTool('search_prices')}) +
      encodeChatStreamEvent({type: 'status', text: CHAT_STATUS_COMPOSING}) +
      encodeChatStreamEvent({type: 'delta', text: 'H100 '}) +
      encodeChatStreamEvent({type: 'delta', text: 'от 400 ₽'});

    const mid = Math.floor(wire.length / 2);
    const first = parser.push(wire.slice(0, mid));
    const second = parser.push(wire.slice(mid));
    const tail = parser.flush();
    const events = [...first, ...second, ...tail];

    assert.deepEqual(
      events.map((e) => e.type),
      ['status', 'status', 'status', 'delta', 'delta'],
    );
    assert.equal(events.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'H100 от 400 ₽');
  });

  it('ignores keep-alive empty lines and flushes a final complete line', () => {
    const parser = createChatStreamParser();
    assert.deepEqual(parser.push('\n\n'), []);
    assert.deepEqual(parser.push('{"type":"status","text":"Ищу цены в каталоге…"}'), []);
    assert.deepEqual(parser.push('\n'), [{type: 'status', text: 'Ищу цены в каталоге…'}]);
    assert.deepEqual(parser.flush(), []);
  });

  it('replays a realistic /api/chat progress → answer sequence', () => {
    const wire = [
      encodeChatStreamEvent({type: 'status', text: CHAT_STATUS_THINKING}),
      encodeChatStreamEvent({type: 'status', text: statusLabelForTool('search_prices')}),
      encodeChatStreamEvent({type: 'status', text: statusLabelForTool('get_quote')}),
      encodeChatStreamEvent({type: 'status', text: CHAT_STATUS_COMPOSING}),
      encodeChatStreamEvent({type: 'delta', text: '| Провайдер | ₽/мес |\n'}),
      encodeChatStreamEvent({type: 'delta', text: '| Yandex | 12 000 |\n'}),
    ].join('');

    const parser = createChatStreamParser();
    // Byte-ish chunks (3 chars) to stress the line buffer.
    const events: ReturnType<typeof parser.push> = [];
    for (let i = 0; i < wire.length; i += 3) {
      events.push(...parser.push(wire.slice(i, i + 3)));
    }
    events.push(...parser.flush());

    const statuses = events.filter((e) => e.type === 'status').map((e) => e.text);
    const answer = events
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('');

    assert.deepEqual(statuses, [
      CHAT_STATUS_THINKING,
      'Ищу цены в каталоге…',
      'Считаю конфигурацию…',
      CHAT_STATUS_COMPOSING,
    ]);
    assert.match(answer, /Yandex/);
    assert.equal(TOOL_NAME_LEAK_RE.test(answer), false);
  });

  it('rejects delta/status events with empty text', () => {
    assert.equal(parseChatStreamLine('{"type":"delta","text":""}'), null);
    assert.equal(parseChatStreamLine('{"type":"status","text":""}'), null);
    assert.equal(parseChatStreamLine('{"type":"delta"}'), null);
  });

  it('does not treat plain answer text as an event (legacy text/plain guard)', () => {
    const parser = createChatStreamParser();
    assert.deepEqual(parser.push('Просто текст ответа без JSON\n'), []);
    assert.deepEqual(parser.flush(), []);
  });
});
