import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {pickK8sMasterMeter} from '@/lib/calculator/lakehouse-quote';
import {CALCULATOR_PROVIDER_IDS} from '@/lib/calculator/quote-view';
import {catalog, extractAiModelKey, isAiTokenMeter} from '@/lib/catalog';
import {buildCatalogFactsAddendum} from './catalog-facts';

function assertNoMonthlyPrices(text: string): void {
  assert.ok(!/₽\s*\/\s*(?:мес|1M|млн)/i.test(text), `unexpected price unit: ${text}`);
  assert.ok(!/~\s*\d{2,}/.test(text), `unexpected ~N anecdote: ${text}`);
  // Allow the policy phrase «0₽ cluster fee», but no other ruble amounts.
  const withoutPolicy = text.replace(/0₽ cluster fee/g, '');
  assert.ok(!/\d[\d\s]*₽/.test(withoutPolicy), `unexpected ₽ amount: ${text}`);
}

describe('buildCatalogFactsAddendum', () => {
  it('returns null when domains do not need catalog facts', () => {
    assert.equal(buildCatalogFactsAddendum(['gpu', 'compute'], 'Самый дешёвый H100'), null);
    assert.equal(buildCatalogFactsAddendum(['s3', 'cdn'], 'S3 Standard 50 ТБ + CDN'), null);
    assert.equal(buildCatalogFactsAddendum([], 'привет'), null);
  });

  it('lists live K8s basic master defaults matching pickK8sMasterMeter for all providers', () => {
    const addendum = buildCatalogFactsAddendum(['k8s'], 'Сравни Managed Kubernetes');
    assert.ok(addendum);
    assert.match(addendum!, /CATALOG FACTS/);
    assert.match(addendum!, /K8s masters \(catalog defaults, basic\)/);
    assert.match(addendum!, /Workers ≠ master/);
    assert.match(addendum!, /native-fixed/);

    for (const id of CALCULATOR_PROVIDER_IDS) {
      const picked = pickK8sMasterMeter(id, 'basic');
      assert.ok(picked, `missing basic master for ${id}`);
      const short =
        id === 'yandex-cloud'
          ? 'yandex'
          : id === 'vk-cloud'
            ? 'vk'
            : id === 'cloud-ru'
              ? 'cloud.ru'
              : id === 't1-cloud'
                ? 't1'
                : id === 'mws-cloud'
                  ? 'mws'
                  : 'selectel';
      assert.match(addendum!, new RegExp(short.replace('.', '\\.')));
      const vcpu = Number(picked.meter.dimensions.vcpu);
      const ram = Number(picked.meter.dimensions.ramGiB ?? picked.meter.dimensions.ramGb);
      if (Number.isFinite(vcpu) && vcpu > 0 && Number.isFinite(ram) && ram > 0) {
        assert.match(addendum!, new RegExp(`${short.replace('.', '\\.')} ${vcpu}/${ram}`));
      } else {
        assert.match(addendum!, new RegExp(`${short.replace('.', '\\.')} native-fixed`));
      }
    }

    assertNoMonthlyPrices(addendum!);
    assert.ok(addendum!.length < 700, `k8s addendum too large: ${addendum!.length}`);
  });

  it('lists gpt-oss-120b hosted providers from catalog (no ₽)', () => {
    const addendum = buildCatalogFactsAddendum(
      ['ai'],
      'цена за 1 млн при паттерне 70/30 возьми gpt-oss-120b',
    );
    assert.ok(addendum);
    assert.match(addendum!, /AI hosted API «gpt-oss-120b»/);
    assert.match(addendum!, /yandex \(input\+output\)/);
    assert.match(addendum!, /mws \(input\+output\)/);
    assert.match(addendum!, /cloud\.ru \(input\+output\)/);
    assert.match(addendum!, /aiModel в tool = «gpt-oss-120b»/);
    assert.ok(!/selectel|vk |t1 /.test(addendum!), addendum!);
    assertNoMonthlyPrices(addendum!);
  });

  it('detects spaced gpt oss 120b the same as hyphenated id', () => {
    const addendum = buildCatalogFactsAddendum(
      ['ai'],
      'Сколько стоит gpt oss 120b за 1M токенов?',
    );
    assert.ok(addendum);
    assert.match(addendum!, /«gpt-oss-120b»/);
    assert.match(addendum!, /yandex \(input\+output\)/);
  });

  it('lists gpt-oss-20b only for providers that actually host it', () => {
    const addendum = buildCatalogFactsAddendum(['ai'], 'Сколько стоит gpt-oss-20b за 1M токенов?');
    assert.ok(addendum);
    assert.match(addendum!, /AI hosted API «gpt-oss-20b»/);
    assert.match(addendum!, /yandex \(input\+output\)/);
    // 20b is Yandex-only in the current price books — do not claim MWS/Cloud.ru.
    assert.ok(!/mws \(/.test(addendum!), addendum!);
    assert.ok(!/cloud\.ru \(/.test(addendum!), addendum!);
    // Must not accidentally pull 120b providers via substring match.
    const hosts120 = new Set(
      catalog.meters
        .filter(
          (m) =>
            m.categoryKey === 'ai' &&
            m.status === 'available' &&
            isAiTokenMeter(m) &&
            extractAiModelKey(m) === 'gpt-oss-120b',
        )
        .map((m) => m.provider),
    );
    for (const p of hosts120) {
      if (p === 'yandex-cloud') continue;
      const short = p === 'mws-cloud' ? 'mws' : p === 'cloud-ru' ? 'cloud.ru' : p;
      assert.ok(!new RegExp(`${short.replace('.', '\\.')} \\(`).test(addendum!), addendum!);
    }
  });

  it('does not confuse gpt-oss-20b with gpt-oss-120b availability', () => {
    const a20 = buildCatalogFactsAddendum(['ai'], 'gpt-oss-20b токены');
    const a120 = buildCatalogFactsAddendum(['ai'], 'gpt-oss-120b токены');
    assert.ok(a20 && a120);
    assert.match(a20!, /«gpt-oss-20b»/);
    assert.match(a120!, /«gpt-oss-120b»/);
    assert.notEqual(a20, a120);
    // 120b has more providers than 20b in the current catalog.
    assert.ok(
      (a120!.match(/\(input\+output\)/g) ?? []).length >
        (a20!.match(/\(input\+output\)/g) ?? []).length,
    );
  });

  it('lists GLM 5.2 when present in catalog', () => {
    const hasGlm = catalog.meters.some(
      (m) =>
        m.categoryKey === 'ai' &&
        m.status === 'available' &&
        isAiTokenMeter(m) &&
        (extractAiModelKey(m) || '').includes('glm-5.2'),
    );
    assert.ok(hasGlm, 'fixture expects GLM 5.2 in catalog');
    const addendum = buildCatalogFactsAddendum(['ai'], 'Сравни GLM 5.2 по провайдерам ₽/1M');
    assert.ok(addendum);
    assert.match(addendum!, /AI hosted API «glm 5\.2»/i);
    assert.match(addendum!, /input\+output|input|output/);
    assertNoMonthlyPrices(addendum!);
  });

  it('reports missing hosted API when model is absent from catalog', () => {
    const addendum = buildCatalogFactsAddendum(['ai'], 'Сколько стоит gpt-oss-999b за 1M?');
    assert.ok(addendum);
    assert.match(addendum!, /gpt-oss-999b/);
    assert.match(addendum!, /в каталоге нет/);
    assert.ok(!/yandex \(/.test(addendum!), addendum!);
  });

  it('skips AI line when ai domain has no detectable model name', () => {
    const addendum = buildCatalogFactsAddendum(['ai'], 'Сравни цены токенов AI API');
    assert.equal(addendum, null);
  });

  it('combines k8s + ai lines when both domains match', () => {
    const addendum = buildCatalogFactsAddendum(
      ['k8s', 'ai'],
      'Kubernetes и токены gpt-oss-120b',
    );
    assert.ok(addendum);
    assert.match(addendum!, /K8s masters/);
    assert.match(addendum!, /gpt-oss-120b/);
    assert.ok(addendum!.length < 900, `addendum too large: ${addendum!.length}`);
    assertNoMonthlyPrices(addendum!);
  });

  it('header states shapes/availability only and tools for prices', () => {
    const addendum = buildCatalogFactsAddendum(['k8s'], 'k8s');
    assert.ok(addendum);
    assert.match(
      addendum!,
      /## CATALOG FACTS \(live, shapes\/availability only — цены только из tools\)/,
    );
  });
});
