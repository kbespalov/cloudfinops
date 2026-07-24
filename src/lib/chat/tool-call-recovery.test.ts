import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  CHAT_TOOL_NAMES,
  createAnswerStreamSanitizer,
  extractJsonObjects,
  looksLikeToolCallLeak,
  recoverToolCallsFromContent,
  resolveToolCalls,
  sanitizeUserFacingAnswer,
} from './tool-call-recovery';

const LEAK_FROM_SCREENSHOT = `We will call search_prices. We need to actually call the tool. We need to use the tool. Let's call search_prices. We need to actually produce a tool call. Now call. Now actual call: Let's call search_prices with query "Kubernetes". We need to produce JSON tool call. Okay. Now actual. Let's do it. Now. Okay, I'm going to call:

Now call. We need to output tool call JSON. Okay. Now: Let's do it. Now final. Okay, I will produce the tool call. Now. We need to output:

{
"query": "Kubernetes",
"category": null,
"filters": null,
"page": null,
"pageSize": null
}`;

const TOOL_NAME_LEAK_RE = new RegExp(`\\b(?:${CHAT_TOOL_NAMES.join('|')})\\b`);

const PAD =
  ' Хвост для сдвига holdback: abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP.';

function runStreamSanitizer(source: string, chunkSize: number): {parts: string[]; out: string} {
  const sanitizer = createAnswerStreamSanitizer();
  const parts: string[] = [];
  for (let i = 0; i < source.length; i += chunkSize) {
    const piece = sanitizer.push(source.slice(i, i + chunkSize));
    if (piece) parts.push(piece);
  }
  const tail = sanitizer.flush();
  if (tail) parts.push(tail);
  return {parts, out: parts.join('')};
}

describe('tool-call-recovery', () => {
  it('sanitizes tool names in methodology footnotes', () => {
    const raw =
      '* **ВМ** – цены из `get_quote`. * **IP** – из search_prices. Среднее — compare_unit_price.';
    const clean = sanitizeUserFacingAnswer(raw);
    assert.equal(TOOL_NAME_LEAK_RE.test(clean), false);
    assert.match(clean, /калькулятора конфигурации/);
    assert.match(clean, /прайс-листа/);
    assert.match(clean, /кросс-провайдерной аналитики/);
  });

  it('sanitizes every registered tool name to a Russian label', () => {
    for (const name of CHAT_TOOL_NAMES) {
      const clean = sanitizeUserFacingAnswer(`Источник: ${name} и \`${name}\`, из ${name}.`);
      assert.equal(new RegExp(`\\b${name}\\b`).test(clean), false, name);
      assert.equal(clean.includes('`'), false, `backticks left for ${name}`);
      assert.match(clean, /[а-яА-ЯёЁ]{4,}/);
    }
  });

  it('detects gpt-oss English tool-planning leak', () => {
    assert.equal(looksLikeToolCallLeak(LEAK_FROM_SCREENSHOT), true);
  });

  it('does not flag a normal Russian answer', () => {
    const answer =
      'В каталоге Kubernetes у российских провайдеров тарифицируется отдельно от ВМ. Уточните, нужен managed K8s или worker-ноды.';
    assert.equal(looksLikeToolCallLeak(answer), false);
  });

  it('extracts JSON objects and strips null/unknown keys', () => {
    const objects = extractJsonObjects(LEAK_FROM_SCREENSHOT);
    assert.equal(objects.length, 1);
    const recovered = recoverToolCallsFromContent(LEAK_FROM_SCREENSHOT);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].function.name, 'search_prices');
    assert.deepEqual(JSON.parse(recovered[0].function.arguments), {query: 'Kubernetes'});
  });

  it('recovers query from prose when JSON is missing', () => {
    const text =
      'We need to call search_prices with query "H100". Now produce tool call JSON.';
    const recovered = recoverToolCallsFromContent(text);
    assert.equal(recovered.length, 1);
    assert.deepEqual(JSON.parse(recovered[0].function.arguments), {query: 'H100'});
  });

  it('resolveToolCalls prefers native tool_calls', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: 'We will call search_prices',
      tool_calls: [
        {
          id: '1',
          type: 'function',
          function: {name: 'search_prices', arguments: '{"query":"K8s"}'},
        },
      ],
    });
    assert.equal(resolved.kind, 'tools');
    if (resolved.kind === 'tools') {
      assert.equal(resolved.recoveredFromLeak, false);
      assert.equal(resolved.toolCalls[0].function.arguments, '{"query":"K8s"}');
    }
  });

  it('resolveToolCalls recovers leak into tools', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: LEAK_FROM_SCREENSHOT,
    });
    assert.equal(resolved.kind, 'tools');
    if (resolved.kind === 'tools') {
      assert.equal(resolved.recoveredFromLeak, true);
      assert.equal(resolved.toolCalls[0].function.name, 'search_prices');
    }
  });

  it('resolveToolCalls marks unrecoverable leak', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: 'We need to actually call the tool. Let us produce a tool call now. Final call.',
    });
    assert.equal(resolved.kind, 'leak_unrecoverable');
  });
});

describe('createAnswerStreamSanitizer', () => {
  it('returns empty strings for empty push/flush', () => {
    const sanitizer = createAnswerStreamSanitizer();
    assert.equal(sanitizer.push(''), '');
    assert.equal(sanitizer.flush(), '');
    assert.equal(sanitizer.flush(), '');
  });

  it('holds short text until flush', () => {
    const sanitizer = createAnswerStreamSanitizer();
    assert.equal(sanitizer.push('Привет'), '');
    assert.equal(sanitizer.push(', мир'), '');
    assert.equal(sanitizer.flush(), 'Привет, мир');
  });

  it('never emits a raw tool name across chunk boundaries', () => {
    const source =
      'Цены из `get_quote`. Также search_prices и recommend_inference_infra в сноске.' + PAD;

    for (const chunkSize of [1, 2, 3, 7, 11, 32]) {
      const {parts, out} = runStreamSanitizer(source, chunkSize);
      for (const piece of parts) {
        assert.equal(
          TOOL_NAME_LEAK_RE.test(piece),
          false,
          `raw tool name in push (chunkSize=${chunkSize}): ${piece}`,
        );
      }
      assert.equal(TOOL_NAME_LEAK_RE.test(out), false, `after flush chunkSize=${chunkSize}`);
      assert.match(out, /калькулятора конфигурации/);
      assert.match(out, /прайс-листа/);
      assert.match(out, /подбора GPU под инференс/);
    }
  });

  it('matches one-shot sanitize for clean prose without tool names', () => {
    const source =
      'H100 в российских облаках обычно считают по GPU-час. ' +
      'Сверьте on-demand и reserved, если нагрузка стабильная.' +
      PAD;

    for (const chunkSize of [1, 5, 17]) {
      const {out} = runStreamSanitizer(source, chunkSize);
      assert.equal(out, sanitizeUserFacingAnswer(source));
    }
  });

  it('matches one-shot sanitize when tool names sit mid-answer', () => {
    const source =
      'Методика: ВМ из get_quote, диск из search_prices, среднее — compare_unit_price, ' +
      'бюджет — fit_budget, GPU — recommend_inference_infra.' +
      PAD;

    for (const chunkSize of [1, 4, 13, 29]) {
      const {parts, out} = runStreamSanitizer(source, chunkSize);
      for (const piece of parts) {
        assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
      }
      assert.equal(out, sanitizeUserFacingAnswer(source));
    }
  });

  it('rewrites tool name at the very start and end of the stream', () => {
    const source = `get_quote в начале.${PAD} хвост search_prices`;
    const {parts, out} = runStreamSanitizer(source, 1);
    for (const piece of parts) {
      assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
    }
    assert.equal(TOOL_NAME_LEAK_RE.test(out), false);
    assert.match(out, /^калькулятора конфигурации/);
    assert.match(out, /прайс-листа$/);
  });

  it('keeps «из `name`» together when cut would land on the prefix', () => {
    // Prefix + name near the holdback window is the brittle case.
    const source = `${'x'.repeat(40)}из \`fit_budget\` далее текст.${PAD}`;
    const {parts, out} = runStreamSanitizer(source, 1);
    for (const piece of parts) {
      assert.equal(/\bfit_budget\b/.test(piece), false);
    }
    assert.equal(out, sanitizeUserFacingAnswer(source));
    assert.match(out, /из подбора под бюджет/);
    assert.equal(/из\s*`/.test(out), false);
  });

  it('does not rewrite lookalike fragments that are not tool names', () => {
    const source = `Это search_price без s и getquote слитно.${PAD}`;
    const {out} = runStreamSanitizer(source, 3);
    assert.equal(out, sanitizeUserFacingAnswer(source));
    assert.match(out, /search_price/);
    assert.match(out, /getquote/);
  });

  it('sanitizes uppercase «из NAME» footnotes mid-stream', () => {
    // Bare GET_QUOTE is case-sensitive in sanitize; «из …» uses the /gi path.
    const source = `Сноска: из GET_QUOTE и из SEARCH_PRICES.${PAD}`;
    const {parts, out} = runStreamSanitizer(source, 2);
    for (const piece of parts) {
      assert.equal(/\bGET_QUOTE\b|\bSEARCH_PRICES\b/.test(piece), false);
    }
    assert.equal(out, sanitizeUserFacingAnswer(source));
    assert.match(out, /калькулятора конфигурации/);
    assert.match(out, /прайс-листа/);
  });

  it('handles irregular chunk sizes and empty deltas mixed in', () => {
    const source =
      'Таблица собрана из `compare_unit_price` и уточнена через get_quote.' + PAD;
    const chunks = ['Табл', '', 'ица собрана из `comp', 'are_unit_price` и ут', '', 'очнена через get_', 'quote.', PAD];
    const sanitizer = createAnswerStreamSanitizer();
    let out = '';
    for (const chunk of chunks) {
      const piece = sanitizer.push(chunk);
      assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
      out += piece;
    }
    out += sanitizer.flush();
    assert.equal(TOOL_NAME_LEAK_RE.test(out), false);
    assert.equal(out, sanitizeUserFacingAnswer(source));
  });

  it('emits progressively once text exceeds holdback', () => {
    const sanitizer = createAnswerStreamSanitizer();
    const first = sanitizer.push('A'.repeat(80));
    assert.ok(first.length > 0, 'expected an early emit after holdback window fills');
    assert.equal(TOOL_NAME_LEAK_RE.test(first), false);
    const rest = sanitizer.flush();
    assert.equal(first + rest, 'A'.repeat(80));
  });

  it('covers all tool names under single-char streaming', () => {
    const source =
      CHAT_TOOL_NAMES.map((name, i) => `${i + 1}. из \`${name}\``).join('. ') + '.' + PAD;
    const {parts, out} = runStreamSanitizer(source, 1);
    for (const piece of parts) {
      assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
    }
    assert.equal(out, sanitizeUserFacingAnswer(source));
    assert.match(out, /калькулятора конфигурации/);
    assert.match(out, /прайс-листа/);
    assert.match(out, /кросс-провайдерной аналитики/);
    assert.match(out, /подбора под бюджет/);
    assert.match(out, /подбора GPU под инференс/);
  });

  it('sanitizes markdown footnote rows without leaking tool ids', () => {
    const source = [
      '| Ресурс | Источник |',
      '| --- | --- |',
      '| ВМ | `get_quote` |',
      '| Диск | search_prices |',
      '| Среднее | compare_unit_price |',
      '',
      PAD,
    ].join('\n');

    for (const chunkSize of [1, 8, 24]) {
      const {parts, out} = runStreamSanitizer(source, chunkSize);
      for (const piece of parts) {
        assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
      }
      assert.equal(out, sanitizeUserFacingAnswer(source));
    }
  });

  it('flush after only held (unemitted) tool name still sanitizes', () => {
    const sanitizer = createAnswerStreamSanitizer();
    assert.equal(sanitizer.push('см. get_quote'), '');
    const out = sanitizer.flush();
    assert.equal(TOOL_NAME_LEAK_RE.test(out), false);
    assert.match(out, /калькулятора конфигурации/);
  });

  it('matches one-shot sanitize for random chunk cuts', () => {
    const source =
      'Итог из get_quote; детали — search_prices; бюджет — fit_budget.' + PAD;
    // Deterministic pseudo-random cuts (no Math.random in CI flake sense).
    const cuts = [1, 2, 2, 5, 1, 9, 4, 3, 7, 1, 12, 6, 8, 2, 15, 1, 10];
    const sanitizer = createAnswerStreamSanitizer();
    let offset = 0;
    let out = '';
    let cutIdx = 0;
    while (offset < source.length) {
      const size = cuts[cutIdx % cuts.length]!;
      cutIdx += 1;
      const piece = sanitizer.push(source.slice(offset, offset + size));
      assert.equal(TOOL_NAME_LEAK_RE.test(piece), false);
      out += piece;
      offset += size;
    }
    out += sanitizer.flush();
    assert.equal(out, sanitizeUserFacingAnswer(source));
  });

  it('two consecutive sanitizers do not share state', () => {
    const a = createAnswerStreamSanitizer();
    a.push('get_quote' + PAD);
    a.flush();

    const b = createAnswerStreamSanitizer();
    assert.equal(b.push('ok'), '');
    assert.equal(b.flush(), 'ok');
  });
});
