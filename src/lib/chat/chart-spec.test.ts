import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {decorateAssistantContent, parseRub, wantsChart, type ChatChartSpec} from './chart-spec';

const PRICE_TABLE = [
  '**Сравнение ВМ за месяц**',
  '',
  '| Провайдер | Итого / мес | к минимуму |',
  '|---|---:|---|',
  '| MWS | 108\u00a0712 ₽ | min |',
  '| Yandex Cloud | 120\u00a0000 ₽ | +10% |',
  '| VK Cloud | 131 500 ₽ | +21% |',
].join('\n');

function chartsOf(content: string | {type: string; data: unknown}[]): ChatChartSpec[] {
  if (typeof content === 'string') return [];
  return content
    .filter((part) => part.type === 'chart')
    .map((part) => part.data as ChatChartSpec);
}

describe('parseRub', () => {
  it('reads ru-RU amounts and skips percents', () => {
    assert.equal(parseRub('108\u00a0712 ₽'), 108712);
    assert.equal(parseRub('1 234,5 ₽'), 1234.5);
    assert.equal(parseRub('+10%'), null);
    assert.equal(parseRub('min'), null);
    assert.equal(parseRub('—'), null);
  });
});

describe('decorateAssistantContent', () => {
  it('builds a bar chart from the price column and keeps the table', () => {
    const parts = decorateAssistantContent(PRICE_TABLE);
    assert.ok(Array.isArray(parts));
    const text = parts.find((part) => part.type === 'text');
    assert.ok(text && text.type === 'text' && text.data.text.includes('| MWS |'));
    const [chart] = chartsOf(parts);
    assert.ok(chart);
    assert.equal(chart.kind, 'bar');
    assert.deepEqual(chart.categories, ['MWS', 'Yandex Cloud', 'VK Cloud']);
    assert.deepEqual(chart.series[0]?.data, [108712, 120000, 131500]);
    assert.equal(chart.series[0]?.name, 'Итого / мес');
    assert.match(chart.title ?? '', /Сравнение ВМ/);
  });

  it('does not chart a percent-only table', () => {
    const md = ['| Провайдер | Покрытие |', '|---|---|', '| MWS | 80% |', '| VK | 60% |'].join(
      '\n',
    );
    assert.equal(decorateAssistantContent(md), md);
  });

  it('uses итого when unit price and total are both present', () => {
    const md = [
      '| Провайдер | ₽/GiB·мес | Итого / мес |',
      '|---|---:|---:|',
      '| MWS | 1,2 ₽ | 4 800 ₽ |',
      '| Selectel | 1,5 ₽ | 6 000 ₽ |',
    ].join('\n');
    const [chart] = chartsOf(decorateAssistantContent(md));
    assert.equal(chart?.series.length, 1);
    assert.deepEqual(chart?.series[0]?.data, [4800, 6000]);
  });

  it('renders an explicit chart fence and drops the duplicate table chart', () => {
    const fence = [
      '```chart',
      JSON.stringify({
        kind: 'pie',
        title: 'Доли',
        xField: 'Провайдер',
        categories: ['MWS', 'Yandex Cloud', 'VK Cloud'],
        series: [{name: 'Итого / мес', data: [108712, 120000, 131500]}],
      }),
      '```',
    ].join('\n');
    const parts = decorateAssistantContent(`${PRICE_TABLE}\n\n${fence}`);
    assert.ok(Array.isArray(parts));
    const charts = chartsOf(parts);
    assert.equal(charts.length, 1);
    assert.equal(charts[0]?.kind, 'pie');
    const text = parts.filter((part) => part.type === 'text').map((part) => part.data.text).join('');
    assert.doesNotMatch(text, /```chart/);
  });

  it('keeps an invalid fence as markdown', () => {
    const md = '```chart\nnot-json\n```';
    assert.equal(decorateAssistantContent(md), md);
  });

  it('skips an Итого row so the breakdown chart is not double-counted', () => {
    const md = [
      '| Позиция | ₽/мес |',
      '|---|---:|',
      '| CPU | 36 000 ₽ |',
      '| RAM | 60 000 ₽ |',
      '| **Итого** | **96 000 ₽** |',
    ].join('\n');
    const [chart] = chartsOf(decorateAssistantContent(md));
    assert.deepEqual(chart?.categories, ['CPU', 'RAM']);
    assert.deepEqual(chart?.series[0]?.data, [36000, 60000]);
  });

  it('skips table charts while the answer is still streaming', () => {
    assert.equal(decorateAssistantContent(PRICE_TABLE, {deriveFromTables: false}), PRICE_TABLE);
  });

  it('renders no chart when the user did not ask for one', () => {
    assert.equal(decorateAssistantContent(PRICE_TABLE, {requested: false}), PRICE_TABLE);
  });

  it('drops an unrequested chart fence instead of showing raw JSON', () => {
    const fence = [
      '```chart',
      JSON.stringify({
        kind: 'pie',
        categories: ['MWS', 'VK Cloud'],
        series: [{name: 'Итого', data: [1, 2]}],
      }),
      '```',
    ].join('\n');
    const out = decorateAssistantContent(`${PRICE_TABLE}\n\n${fence}`, {requested: false});
    assert.equal(typeof out, 'string');
    assert.match(out as string, /\| MWS \|/);
    assert.doesNotMatch(out as string, /```chart/);
  });
});

describe('wantsChart', () => {
  it('detects explicit chart requests', () => {
    assert.ok(wantsChart('Построй график цен на ВМ'));
    assert.ok(wantsChart('покажи круговую диаграмму по провайдерам'));
    assert.ok(wantsChart('Визуализируй сравнение S3'));
    assert.ok(wantsChart('нарисуй это'));
    assert.ok(wantsChart('Мне нужно построить график цен'));
    assert.ok(wantsChart('Мне нужна диаграмма по провайдерам'));
  });

  it('treats a work schedule as not a chart', () => {
    assert.equal(wantsChart('ВМ работает по графику 9-18, посчитай стоимость'), false);
    assert.equal(wantsChart('Сравни ВМ, график работы 8/5'), false);
  });

  it('ignores plain questions and refusals', () => {
    assert.equal(wantsChart('Сравни цены на 4 vCPU 16 ГБ'), false);
    assert.equal(wantsChart('Сравни S3, без графика'), false);
    assert.equal(wantsChart('таблицу, график не надо'), false);
    assert.equal(wantsChart('не нужно строить график'), false);
    assert.equal(wantsChart('график не нужен'), false);
    assert.equal(wantsChart(''), false);
  });
});
