import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  aiModelMatchesNeedle,
  compactAiModelId,
  detectAiModelNeedle,
  detectStorageClass,
  searchPricesDetailed,
} from './search';
import {catalog} from '@/lib/catalog';

describe('detectStorageClass', () => {
  it('maps RU/EN aliases when a single class is intended', () => {
    assert.equal(detectStorageClass('стандартный класс S3'), 'standard');
    assert.equal(detectStorageClass('Hotbox'), 'standard');
    assert.equal(detectStorageClass('холодное хранилище'), 'cold');
    assert.equal(detectStorageClass('Icebox'), 'cold');
    assert.equal(detectStorageClass('класс Ice'), 'ice');
    assert.equal(detectStorageClass('Warm'), 'warm');
  });

  it('ignores classes mentioned only in disclaimers', () => {
    assert.equal(
      detectStorageClass(
        'Сравни объектное хранилище стандартного класса. Не смешивай с Cold/Ice.',
      ),
      'standard',
    );
    assert.equal(
      detectStorageClass('Есть ли Standard у Cloud.ru? Не путай с Ice.'),
      'standard',
    );
  });

  it('returns null when several classes are positively mentioned', () => {
    assert.equal(detectStorageClass('Сравни Standard и Ice по цене'), null);
  });

  it('does not treat CPU Ice Lake as S3 Ice storage class', () => {
    assert.equal(detectStorageClass('Intel Ice Lake, 100% preemptible vCPU'), null);
    assert.equal(detectStorageClass('Сравни Ice Lake preemptible vCPU'), null);
    assert.equal(detectStorageClass('yc.compute.ice-lake-100.preemptible-vcpu'), null);
    // Real S3 Ice still detected.
    assert.equal(detectStorageClass('объектное хранилище класс Ice'), 'ice');
  });
});

describe('searchPricesDetailed compute platforms', () => {
  it('finds Ice Lake preemptible vCPU without collapsing to S3 Ice', () => {
    const r = searchPricesDetailed({
      query: 'Intel Ice Lake, 100% preemptible vCPU',
      category: 'compute',
      limit: 20,
    });
    assert.ok(r.totalMatches > 0, 'expected compute Ice Lake hits');
    assert.ok(r.providers.length >= 1);
    assert.ok(
      r.rows.some((row) => /ice\s*lake/i.test(row.name) && /preemptible|прерыв/i.test(`${row.name} ${row.config}`)),
    );
    assert.ok(!r.rows.every((row) => /объектн|object\s*storage|s3/i.test(row.name)));
    // Cheapest-per-provider must stay on vCPU unit meters, not disks/images/RAM.
    for (const p of r.providers) {
      assert.match(
        `${p.cheapest.name} ${p.cheapest.config} ${p.cheapest.unit}`,
        /vcpu|ядро|preemptible/i,
      );
      assert.doesNotMatch(p.cheapest.name, /образ|диск|nvme|ram/i);
    }
    const yandex = r.providers.find((p) => p.provider === 'yandex-cloud');
    assert.ok(yandex);
    assert.match(yandex!.cheapest.name, /Ice Lake/i);
    assert.ok((yandex!.cheapest.month ?? 0) > 200); // 100% Ice Lake preemptible ≈ 244.8, not 5% Cascade
  });

  it('SKU compare prompt stays cross-provider (ignores «у Yandex» and storageClass=ice)', () => {
    const prompt =
      'Сравни с другими провайдерами: «Intel Ice Lake, 100% preemptible vCPU» (yc.compute.ice-lake-100.preemptible-vcpu) у Yandex Cloud. Категория: Compute. Конфигурация: vCPU · 100% · Intel Ice Lake · preemptible.';
    const r = searchPricesDetailed({
      query: prompt,
      category: 'compute',
      storageClass: 'ice',
      limit: 20,
    });
    assert.ok(r.providers.length >= 3, `expected analogs, got ${r.providers.length}`);
    assert.ok(r.applied);
    assert.equal(r.applied.storageClass, null);
    const yandex = r.providers.find((p) => p.provider === 'yandex-cloud');
    assert.ok(yandex);
    assert.match(yandex!.cheapest.name, /Ice Lake/i);
    assert.ok(r.providers.some((p) => p.provider !== 'yandex-cloud'));
  });

  it('short «Intel Ice Lake, 100%» stays on vCPU meters (not disks/images/RAM)', () => {
    const r = searchPricesDetailed({
      query: 'Intel Ice Lake, 100%',
      category: 'compute',
      limit: 20,
    });
    assert.ok(r.providers.length >= 2);
    for (const p of r.providers) {
      assert.match(
        `${p.cheapest.name} ${p.cheapest.config} ${p.cheapest.unit}`,
        /vcpu|ядро|preemptible/i,
      );
      assert.doesNotMatch(p.cheapest.name, /образ|диск|nvme/i);
    }
    const yandex = r.providers.find((p) => p.provider === 'yandex-cloud');
    assert.ok(yandex);
    assert.match(yandex!.cheapest.name, /Ice Lake/i);
  });
});

describe('searchPricesDetailed object storage', () => {
  it('filters by SKU dimensions.storageClass, not display-name heuristics', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище',
      category: 'storage',
      storageClass: 'standard',
      meterKind: 'capacity',
      limit: 30,
    });
    assert.ok(r.providers.length >= 4);
    assert.ok(r.providers.every((p) => p.cheapest.storageClass === 'standard'));
    assert.ok(r.rows.every((row) => row.storageClass === 'standard'));
  });

  it('does not pick Ice or free PUT as cheapest Standard', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище standard',
      category: 'storage',
      limit: 30,
    });
    assert.equal(r.applied?.storageClass, 'standard');
    assert.equal(r.applied?.meterKind, 'capacity');
    const byName = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest]));
    assert.match(byName['cloud-ru']?.name ?? '', /Standard/i);
    assert.doesNotMatch(byName['cloud-ru']?.name ?? '', /Ice/i);
    assert.equal(byName['vk-cloud']?.meterKind, 'capacity');
    assert.ok((byName['vk-cloud']?.month ?? 0) > 0);
    assert.match(byName['selectel']?.name ?? '', /Standard/i);
    assert.equal(r.providers[0]?.provider, 'cloud-ru');
  });

  it('hard-filters Ice so T1/MWS Standard do not appear', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище ice',
      category: 'storage',
      storageClass: 'ice',
      meterKind: 'capacity',
      limit: 20,
    });
    const ids = r.providers.map((p) => p.provider);
    assert.ok(ids.includes('cloud-ru'));
    assert.ok(ids.includes('yandex-cloud'));
    assert.ok(ids.includes('selectel'));
    assert.ok(!ids.includes('t1-cloud'));
    assert.ok(!ids.includes('mws-cloud'));
    assert.ok(r.providers.every((p) => p.cheapest.storageClass === 'ice'));
  });

  it('detects Russian request wording as meterKind=requests', () => {
    const r = searchPricesDetailed({
      query: 'Сколько стоят операции в объектном хранилище за 10 000 запросов?',
      category: 'storage',
      limit: 20,
    });
    assert.equal(r.applied?.meterKind, 'requests');
    assert.ok(r.rows.length > 0);
    assert.ok(r.rows.every((row) => row.meterKind === 'requests'));
  });

  it('returns volumeEstimates for DWH-sized capacity', () => {
    const volumeGiB = 50 * 1024;
    const r = searchPricesDetailed({
      query: 'объектное хранилище standard',
      category: 'storage',
      storageClass: 'standard',
      meterKind: 'capacity',
      volumeGiB,
      limit: 30,
    });
    assert.ok((r.volumeEstimates?.length ?? 0) >= 4);
    const best = r.volumeEstimates![0];
    assert.equal(best.provider, 'cloud-ru');
    assert.ok(Math.abs(best.totalMonth - best.rateGiBMonth * volumeGiB) < 1);
  });

  it('defaults volume capacity without class to Standard (not Ice)', () => {
    const volumeGiB = 55 * 1024;
    const r = searchPricesDetailed({
      query: 'объектное хранилище',
      category: 'storage',
      volumeGiB,
      limit: 30,
    });
    assert.equal(r.applied?.storageClass, 'standard');
    assert.ok((r.volumeEstimates?.length ?? 0) >= 4);
    assert.ok(r.volumeEstimates!.every((v) => v.storageClass === 'standard'));
    const cloud = r.volumeEstimates!.find((v) => v.provider === 'cloud-ru');
    assert.ok(cloud);
    assert.ok(cloud.rateGiBMonth > 1, 'Standard Cloud.ru is ~1.84, not Ice 0.49');
  });
});

describe('AI model matching', () => {
  it('compacts naming variants of Qwen 3.6', () => {
    assert.equal(compactAiModelId('Qwen 3.6'), 'qwen36');
    assert.equal(compactAiModelId('Qwen3.6-35B-A3B').startsWith('qwen36'), true);
    assert.equal(detectAiModelNeedle('Сравни цены Qwen 3.6 за 1M токенов'), 'qwen 3.6');
    assert.equal(detectAiModelNeedle('qwen3.6 у Cloud.ru'), 'qwen 3.6');
  });

  it('matches Yandex / Cloud.ru / MWS Qwen 3.6 SKUs to one needle', () => {
    const meters = catalog.meters.filter((m) =>
      /qwen.*3\.6|qwen3\.6/i.test(`${m.name} ${m.sku}`),
    );
    assert.ok(meters.length >= 6, `expected ≥6 Qwen 3.6 meters, got ${meters.length}`);
    for (const m of meters) {
      assert.ok(
        aiModelMatchesNeedle('Qwen 3.6', m, `${m.name} ${m.sku}`),
        `should match ${m.sku}`,
      );
    }
  });

  it('finds Qwen 3.6 on Yandex, Cloud.ru and MWS — not only Yandex', () => {
    const r = searchPricesDetailed({
      query: 'Сравни цены Qwen 3.6 по провайдерам за 1M токенов',
      category: 'ai',
      aiModel: 'Qwen 3.6',
      limit: 20,
    });
    const ids = r.providers.map((p) => p.provider).sort();
    assert.deepEqual(ids, ['cloud-ru', 'mws-cloud', 'yandex-cloud']);
    for (const p of r.providers) {
      assert.match(p.cheapest.name, /3\.6|3\.6/i);
      assert.doesNotMatch(p.cheapest.name, /Coder|3\.5|235/i);
    }
    const by = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest.hour]));
    assert.equal(by['yandex-cloud'], 200);
    assert.equal(by['cloud-ru'], 219.6);
    assert.equal(by['mws-cloud'], 70.76);
  });

  it('infers aiModel from query so Coder-Next is not cheapest Cloud.ru for Qwen 3.6', () => {
    const r = searchPricesDetailed({
      query: 'Qwen 3.6',
      category: 'ai',
      limit: 20,
    });
    const cloud = r.providers.find((p) => p.provider === 'cloud-ru');
    assert.ok(cloud);
    assert.match(cloud!.cheapest.name, /Qwen3\.6|3\.6/i);
    assert.doesNotMatch(cloud!.cheapest.name, /Coder/i);
  });
});

describe('searchPricesDetailed kubernetes masters', () => {
  it('compares zonal masters, not 0₽ фикс or unit vCPU/RAM', () => {
    const r = searchPricesDetailed({
      query: 'Сравни Managed Kubernetes по провайдерам',
      category: 'kubernetes',
      limit: 20,
    });
    assert.equal(r.applied?.k8sTier, 'basic');
    assert.ok(r.providers.length >= 5, `expected ≥5 providers, got ${r.providers.length}`);

    const byId = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest]));
    assert.match(byId['vk-cloud']?.name ?? '', /Зональный мастер 2 vCPU/i);
    assert.ok((byId['vk-cloud']?.hour ?? 0) > 1);
    assert.match(byId['yandex-cloud']?.name ?? '', /Зональный мастер 2 vCPU/i);
    assert.ok((byId['yandex-cloud']?.hour ?? 0) > 1);
    assert.doesNotMatch(byId['yandex-cloud']?.name ?? '', /фикс/i);
    assert.match(byId['cloud-ru']?.name ?? '', /2 vCPU|2 vCPU/i);
    assert.ok(byId['selectel']?.k8sTier === 'basic');
    assert.ok((byId['selectel']?.hour ?? 0) > 1);

    for (const p of r.providers) {
      assert.equal(p.cheapest.k8sTier, 'basic');
      assert.notEqual(p.cheapest.k8sTier, 'fixed-component');
      assert.ok((p.cheapest.hour ?? 0) > 0, `${p.provider} hour must be > 0`);
    }
    assert.equal(r.providers[0]?.provider, 'vk-cloud');
  });

  it('prefers HA masters when query asks for отказоустойчивый', () => {
    const r = searchPricesDetailed({
      query: 'отказоустойчивый Managed Kubernetes HA',
      category: 'kubernetes',
      limit: 20,
    });
    assert.equal(r.applied?.k8sTier, 'ha');
    assert.ok(r.providers.length >= 2);
    assert.ok(r.providers.every((p) => p.cheapest.k8sTier === 'ha'));
  });
});

describe('searchPricesDetailed GPU', () => {
  it('does not rank Cloud.ru ML Inference 1 GB GPU as cheapest whole H100', () => {
    const r = searchPricesDetailed({
      query: 'Самый дешёвый H100 в месяц',
      gpuModel: 'H100',
      limit: 20,
    });
    assert.ok(r.providers.length >= 2);
    for (const p of r.providers) {
      assert.doesNotMatch(p.cheapest.name, /1\s*GB\s*GPU/i);
      assert.doesNotMatch(p.cheapest.unit, /GB-GPU/i);
    }
    assert.doesNotMatch(r.providers[0]!.cheapest.name, /1\s*GB\s*GPU/i);
    // Real card / flavor rent is hundreds of thousands ₽/мес, not ~5k for 1 GB share.
    assert.ok(
      (r.providers[0]!.cheapest.month ?? 0) > 50_000,
      `expected whole-card month price, got ${r.providers[0]!.cheapest.month}`,
    );
  });

  it('keeps GB-GPU meters when query explicitly asks for per-GB share', () => {
    const r = searchPricesDetailed({
      query: 'Cloud.ru ML Inference цена за 1 GB GPU H100',
      gpuModel: 'H100',
      limit: 10,
    });
    assert.ok(r.rows.some((row) => /GB-GPU|1\s*GB\s*GPU/i.test(`${row.unit} ${row.name}`)));
  });

  it('VM flavor 4vCPU/32GB nearestAnalog never returns unit/GPU RAM as peers', () => {
    const prompt =
      'Сравни с другими провайдерами: «Виртуальная машина 4vCPU/32GB RAM» (cloudru.compute.4vcpu-32gb) у Cloud.ru. Категория: Compute. Конфигурация: 4 vCPU · 32 GiB RAM.';
    const r = searchPricesDetailed({
      query: prompt,
      category: 'compute',
      nearestAnalog: true,
      limit: 20,
    });
    // Catalog publishes few non-Cloud.ru compute.flavor rows — cross-provider VM
    // parity is get_quote's job. search_prices must still refuse unit/GPU RAM junk.
    assert.ok(r.providers.length >= 1);
    for (const p of r.providers) {
      assert.doesNotMatch(
        `${p.cheapest.name} ${p.cheapest.sku} ${p.cheapest.config}`,
        /GiB-RAM|preemptible RAM|gpu-v100|GPU V100/i,
        `${p.providerName} must not surface unit/GPU RAM as VM analog: ${p.cheapest.name}`,
      );
      assert.match(p.cheapest.config, /\d+\s*vCPU/i);
      assert.match(p.cheapest.config, /\d+\s*GiB/i);
    }
    const cloudRu = r.providers.find((p) => p.provider === 'cloud-ru');
    assert.ok(cloudRu);
    assert.match(cloudRu!.cheapest.sku, /4vcpu-32gb/i);
  });

  it('B300 ×8 SKU compare picks datacenter peers, not GTX 1080 / L4 / T4', () => {
    const prompt =
      'Сравни с другими провайдерами: «NVIDIA B300 288 ГБ · ×8» (selectel.dedicated.hgx-b300-8) у Selectel. Категория: GPU.';
    const r = searchPricesDetailed({
      query: prompt,
      category: 'gpu',
      gpuModel: 'B300',
      nearestAnalog: true,
      limit: 20,
    });
    assert.ok(r.providers.length >= 3, `expected cross-provider peers, got ${r.providers.length}`);
    const selectel = r.providers.find((p) => p.provider === 'selectel');
    assert.ok(selectel);
    assert.match(selectel!.cheapest.name, /B300/i);
    assert.match(selectel!.cheapest.sku, /hgx-b300-8/);
    for (const p of r.providers) {
      assert.doesNotMatch(
        p.cheapest.name,
        /GTX\s*1080|RTX\s*2080|A2000|\bT4\b|\bL4\b|A5000/i,
        `${p.provider} must not surface consumer/entry GPU as B300 analog`,
      );
      assert.match(
        p.cheapest.name,
        /B300|H200|H100/i,
        `${p.provider} peer should be flagship training GPU, got ${p.cheapest.name}`,
      );
    }
    assert.ok(
      r.providers.some((p) => p.provider !== 'selectel' && /H200|H100/i.test(p.cheapest.name)),
      'expected H200/H100 ×N peer outside Selectel',
    );
  });

  it('focused B300 dedicated query (fast-path args) still peers to H200/H100 ×8', () => {
    const r = searchPricesDetailed({
      query: 'NVIDIA B300 288 ГБ · ×8 selectel.dedicated.hgx-b300-8',
      category: 'gpu',
      gpuModel: 'B300',
      nearestAnalog: true,
      limit: 20,
    });
    const byProvider = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest]));
    assert.match(byProvider.selectel?.name ?? '', /B300/i);
    assert.ok(
      byProvider['vk-cloud'] && /H200/i.test(byProvider['vk-cloud'].name),
      `VK peer: ${byProvider['vk-cloud']?.name}`,
    );
    assert.ok(
      byProvider['cloud-ru'] && /H100/i.test(byProvider['cloud-ru'].name),
      `Cloud.ru peer: ${byProvider['cloud-ru']?.name}`,
    );
    assert.doesNotMatch(byProvider.selectel?.name ?? '', /GTX|1080/i);
  });
});

describe('searchPricesDetailed CDN volume', () => {
  it('volumeEstimates use egress traffic, not free ingress or request meters', () => {
    const r = searchPricesDetailed({
      query: 'исходящий трафик CDN',
      category: 'cdn',
      volumeGiB: 100 * 1024,
      limit: 30,
    });
    assert.ok((r.volumeEstimates?.length ?? 0) >= 4);
    for (const v of r.volumeEstimates!) {
      assert.ok(v.rateGiBMonth > 0, `${v.providerName} rate must be > 0`);
      assert.ok(v.totalMonth > 1000, `${v.providerName} total must reflect 100 ТБ`);
      assert.doesNotMatch(v.name, /входящ/i);
      assert.doesNotMatch(v.name, /запрос/i);
    }
    const yandex = r.volumeEstimates!.find((v) => v.provider === 'yandex-cloud');
    assert.ok(yandex);
    assert.ok((yandex!.rateGiBMonth ?? 0) >= 1);
  });
});
