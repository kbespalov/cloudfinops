import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {matchLakehouseIntent} from './lakehouse-intent';
import {CHAT_TOOLS, CHAT_TOOLS_WITH_LAKEHOUSE, runToolSync} from './tools';

describe('matchLakehouseIntent', () => {
  it('matches lakehouse / лайкхаус wording', () => {
    assert.equal(matchLakehouseIntent('Сколько стоит lakehouse на 75 TiB?').matched, true);
    assert.equal(matchLakehouseIntent('Оцени лайкхаус для BI-команды').reason, 'lakehouse');
    assert.equal(matchLakehouseIntent('open lake house vs serverless SQL').matched, true);
  });

  it('matches data platform / DWH wording', () => {
    assert.equal(matchLakehouseIntent('Оцени платформу данных на Iceberg').matched, true);
    assert.equal(matchLakehouseIntent('Сравни data warehouse и lakehouse').matched, true);
  });

  it('matches analytics stack only with cost/architecture intent', () => {
    assert.equal(
      matchLakehouseIntent('Сколько будет стоить Trino + Airflow на K8s?').matched,
      true,
    );
    assert.equal(matchLakehouseIntent('Что такое Trino?').matched, false);
  });

  it('ignores ordinary S3 / VM price questions', () => {
    assert.equal(matchLakehouseIntent('Сколько стоит объектное хранилище 10 ТиБ?').matched, false);
    assert.equal(matchLakehouseIntent('Самый дешёвый H100 в месяц').matched, false);
    assert.equal(matchLakehouseIntent('ВМ 8 vCPU 32 GiB').matched, false);
  });
});

describe('get_lakehouse_quote tool', () => {
  it('is gated in CHAT_TOOLS_WITH_LAKEHOUSE only', () => {
    assert.equal(CHAT_TOOLS.length, 4);
    assert.ok(
      !(CHAT_TOOLS as readonly {function: {name: string}}[])
        .map((t) => t.function.name)
        .includes('get_lakehouse_quote'),
    );
    assert.equal(CHAT_TOOLS_WITH_LAKEHOUSE.length, 5);
    assert.ok(
      CHAT_TOOLS_WITH_LAKEHOUSE.map((t) => (t as {function: {name: string}}).function.name).includes(
        'get_lakehouse_quote',
      ),
    );
  });

  it('returns DIY quote with costShape and calculator link', () => {
    const raw = runToolSync(
      'get_lakehouse_quote',
      JSON.stringify({
        presetId: 'medium',
        lakeTiB: 75,
        hotPercent: 80,
        k8sTier: 'ha',
        etlHoursPerDay: 8,
        queryHoursPerDay: 12,
        period: 'month',
      }),
    );
    const data = JSON.parse(raw) as {
      model: string;
      best: {provider: string; total: number} | null;
      quotes: unknown[];
      costShape: {fixedApprox: number; variableApprox: number} | null;
      answerHint: {calculatorUrl: string};
    };
    assert.equal(data.model, 'open-lakehouse-diy');
    assert.ok(data.best);
    assert.ok(data.best.total > 0);
    assert.ok(data.quotes.length >= 2);
    assert.ok(data.costShape);
    assert.equal(data.answerHint.calculatorUrl, '/calculator/lakehouse');
  });
});
