import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalog,
  extractKubernetesAvailability,
  gpuPriceBasisLabel,
  extractAiModelKey,
  meterMatchesAiFacet,
  meterMatchesAiFamilyFacet,
  meterMatchesAiModel,
  meterMatchesCategory,
  meterMatchesCdnFacet,
  meterMatchesCdnTrafficFacet,
  meterMatchesComputeFacet,
  meterMatchesDiskFacet,
  extractGpuCount,
  meterMatchesGpuFacet,
  meterMatchesGpuInterconnectFacet,
  meterMatchesNetworkFacet,
  meterMatchesStorageFacet,
  meterMatchesStorageKindFacet,
  meterMatchesVcpuPlatformFacet,
  meterMatchesVcpuShareFacet,
  type CatalogMeter,
} from '@/lib/catalog';
import {
  canFindSimilar,
  comparableFilterFromMeter,
  meterMatchesKubernetesSimilar,
  type ComparableCatalogFilter,
} from './find-similar';

/** Apply the find-similar plan the same way the catalog page does (facets + extras). */
function peersMatching(filter: ComparableCatalogFilter): CatalogMeter[] {
  return catalog.meters.filter((m) => {
    if (m.status !== 'available') return false;
    if (!meterMatchesCategory(m, filter.category)) return false;
    if (filter.category === 'compute' && !meterMatchesComputeFacet(m, filter.facet)) return false;
    if (
      filter.category === 'compute' &&
      filter.facet === 'disk' &&
      !meterMatchesDiskFacet(m, filter.diskFacet)
    ) {
      return false;
    }
    if (filter.category === 'compute' && filter.facet === 'disk' && filter.diskBillingKind) {
      const isIops = m.meter === 'storage.block.iops' || m.unitQuantity === 'IOPS';
      if (filter.diskBillingKind === 'iops' ? !isIops : isIops) return false;
    }
    if (
      filter.category === 'compute' &&
      filter.facet === 'vcpu' &&
      !meterMatchesVcpuShareFacet(m, filter.vcpuShareFacet)
    ) {
      return false;
    }
    if (
      filter.category === 'compute' &&
      filter.facet === 'vcpu' &&
      !meterMatchesVcpuPlatformFacet(m, filter.vcpuPlatformFacet)
    ) {
      return false;
    }
    if (filter.category === 'gpu' && !meterMatchesGpuFacet(m, filter.gpuFacet)) return false;
    if (
      filter.category === 'gpu' &&
      !meterMatchesGpuInterconnectFacet(m, filter.gpuInterconnectFacet)
    ) {
      return false;
    }
    if (filter.category === 'gpu' && filter.gpuPriceBasis) {
      if (gpuPriceBasisLabel(m) !== filter.gpuPriceBasis) return false;
    }
    if (filter.category === 'gpu' && filter.gpuCount != null) {
      if (extractGpuCount(m) !== filter.gpuCount) return false;
    }
    if (filter.category === 'storage' && !meterMatchesStorageKindFacet(m, filter.storageKindFacet)) {
      return false;
    }
    if (filter.category === 'storage' && !meterMatchesStorageFacet(m, filter.storageFacet)) {
      return false;
    }
    if (filter.category === 'storage' && filter.storageOperation) {
      if (String(m.dimensions.operation ?? '').trim().toUpperCase() !== filter.storageOperation) {
        return false;
      }
    }
    if (filter.category === 'network' && !meterMatchesNetworkFacet(m, filter.networkFacet)) {
      return false;
    }
    if (filter.category === 'cdn' && !meterMatchesCdnFacet(m, filter.cdnFacet)) return false;
    if (filter.category === 'cdn' && !meterMatchesCdnTrafficFacet(m, filter.cdnTrafficFacet)) {
      return false;
    }
    if (filter.category === 'kubernetes') {
      if (
        !meterMatchesKubernetesSimilar(m, {
          kubernetesAvailabilityFacet: filter.kubernetesAvailabilityFacet,
          kubernetesMasterVcpu: filter.kubernetesMasterVcpu,
          kubernetesMasterRamGiB: filter.kubernetesMasterRamGiB,
          kubernetesShapelessOnly: filter.kubernetesShapelessOnly,
          kubernetesMasterSize: filter.kubernetesMasterSize,
        })
      ) {
        return false;
      }
    }
    if (filter.category === 'ai' && !meterMatchesAiFacet(m, filter.aiFacet)) return false;
    if (filter.category === 'ai' && !meterMatchesAiFamilyFacet(m, filter.aiFamilyFacet)) {
      return false;
    }
    if (filter.category === 'ai' && !meterMatchesAiModel(m, filter.aiModelId)) return false;
    return true;
  });
}

function requireFilter(meter: CatalogMeter | undefined): ComparableCatalogFilter {
  assert.ok(meter, 'expected seed meter in catalog');
  const f = comparableFilterFromMeter(meter);
  assert.ok(f, `expected comparable filter for ${meter!.sku}`);
  return f;
}

describe('comparableFilterFromMeter', () => {
  it('filters object storage capacity by class + kind across providers', () => {
    const m = catalog.meters.find(
      (x) =>
        x.categoryKey === 'storage' &&
        x.dimensions.storageClass === 'standard' &&
        x.meter === 'storage.object.capacity',
    );
    const f = requireFilter(m);
    assert.equal(f.category, 'storage');
    assert.equal(f.storageFacet, 'standard');
    assert.equal(f.storageKindFacet, 'capacity');
    assert.equal(f.storageOperation, null);
    assert.match(f.summary, /Standard/i);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 2);
    assert.ok(new Set(peers.map((p) => p.provider)).size >= 2);
    for (const p of peers) {
      assert.equal(p.dimensions.storageClass, 'standard');
      assert.notEqual(p.meter, 'storage.object.requests');
    }
  });

  it('filters storage request SKUs by class + operation verb (GET≠PUT)', () => {
    const m = catalog.meters.find(
      (x) =>
        x.categoryKey === 'storage' &&
        x.dimensions.storageClass === 'standard' &&
        x.dimensions.operation === 'GET',
    );
    const f = requireFilter(m);
    assert.equal(f.storageKindFacet, 'operations');
    assert.equal(f.storageOperation, 'GET');
    assert.match(f.summary, /GET/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 2);
    for (const p of peers) {
      assert.equal(String(p.dimensions.operation).toUpperCase(), 'GET');
      assert.equal(p.dimensions.storageClass, 'standard');
    }
    assert.equal(
      peers.some((p) => String(p.dimensions.operation).toUpperCase() === 'PUT'),
      false,
    );
  });

  it('PUT find-similar does not pull GET peers', () => {
    const m = catalog.meters.find(
      (x) =>
        x.categoryKey === 'storage' &&
        x.dimensions.storageClass === 'standard' &&
        x.dimensions.operation === 'PUT',
    );
    const f = requireFilter(m);
    assert.equal(f.storageOperation, 'PUT');
    const peers = peersMatching(f);
    assert.ok(peers.every((p) => String(p.dimensions.operation).toUpperCase() === 'PUT'));
  });

  it('filters GPU by family and keeps card-only out of full-host flavors', () => {
    const card = catalog.meters.find(
      (x) =>
        x.categoryKey === 'gpu' &&
        x.meter === 'compute.gpu' &&
        /H200/i.test(`${x.name} ${x.sku}`),
    );
    const f = requireFilter(card);
    assert.equal(f.category, 'gpu');
    assert.equal(f.gpuFacet, 'h200');
    assert.equal(f.gpuPriceBasis, 'только GPU');
    assert.equal(f.gpuInterconnectFacet, 'all');
    assert.match(f.summary, /только GPU/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    for (const p of peers) {
      assert.equal(gpuPriceBasisLabel(p), 'только GPU');
      assert.match(`${p.name} ${p.sku}`, /H200/i);
    }
  });

  it('filters full GPU hosts separately from card-only', () => {
    const host = catalog.meters.find(
      (x) =>
        x.categoryKey === 'gpu' &&
        (x.pricingMode === 'bundle' ||
          x.unitQuantity === 'flavor' ||
          x.meter === 'compute.flavor') &&
        /H200/i.test(`${x.name} ${x.sku}`),
    );
    const f = requireFilter(host);
    assert.equal(f.gpuPriceBasis, 'целиком');
    assert.match(f.summary, /целиком/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    for (const p of peers) {
      assert.equal(gpuPriceBasisLabel(p), 'целиком');
    }
    assert.equal(
      peers.some((p) => gpuPriceBasisLabel(p) === 'только GPU'),
      false,
    );
  });

  it('filters GPU peers by exact card count (×N)', () => {
    const host = catalog.meters.find(
      (x) =>
        x.categoryKey === 'gpu' &&
        x.provider === 'cloud-ru' &&
        extractGpuCount(x) === 5 &&
        /H100/i.test(`${x.name} ${x.sku}`) &&
        gpuPriceBasisLabel(x) === 'целиком',
    );
    const f = requireFilter(host);
    assert.equal(f.gpuCount, 5);
    assert.match(f.summary, /×5/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    for (const p of peers) {
      assert.equal(extractGpuCount(p), 5, p.sku);
      assert.equal(gpuPriceBasisLabel(p), 'целиком');
    }
    assert.equal(
      peers.some((p) => extractGpuCount(p) === 1 || extractGpuCount(p) === 8),
      false,
    );
  });

  it('filters k8s HA Small tier across providers (not exact 2/4 only)', () => {
    const m = catalog.meters.find((x) => x.sku === 'cloudru.kubernetes.master-ha-2-4.synthetic');
    const f = requireFilter(m);
    assert.equal(f.kubernetesAvailabilityFacet, 'regional');
    assert.equal(f.kubernetesMasterSize, 'small');
    assert.equal(f.kubernetesMasterVcpu, null);
    assert.match(f.summary, /\bHA\b/);
    assert.match(f.summary, /Small/i);

    const peers = peersMatching(f);
    assert.ok(new Set(peers.map((p) => p.provider)).size >= 3);
    for (const p of peers) {
      assert.equal(extractKubernetesAvailability(p), 'regional');
      assert.notEqual(p.comparableTier, 'fixed-component');
    }
    assert.ok(peers.some((p) => p.sku === 'vk.kubernetes.master-ha-2-6.synthetic'));
    assert.ok(peers.some((p) => p.sku === 'selectel.kubernetes.master-ha'));
    assert.equal(
      peers.some((p) => /master-ha-4-8|master-ha-medium|master-ha-8-16/i.test(p.sku)),
      false,
    );
  });

  it('filters k8s basic Small tier (2/x + fixed + T1 Small)', () => {
    const m = catalog.meters.find((x) => x.sku === 'yc.kubernetes.master-basic-2-8.synthetic');
    const f = requireFilter(m);
    assert.equal(f.kubernetesAvailabilityFacet, 'zonal');
    assert.equal(f.kubernetesMasterSize, 'small');
    assert.match(f.summary, /Small/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 4);
    for (const p of peers) {
      assert.equal(extractKubernetesAvailability(p), 'zonal');
      assert.notEqual(p.comparableTier, 'fixed-component');
    }
    assert.ok(peers.some((p) => p.sku === 'cloudru.kubernetes.master-zonal-2-4'));
    assert.ok(peers.some((p) => p.sku === 'vk.kubernetes.master-basic-2-6.synthetic'));
    assert.ok(peers.some((p) => p.sku === 'mws.kubernetes.master-basic'));
    assert.equal(
      peers.some((p) => extractKubernetesAvailability(p) === 'regional'),
      false,
    );
    assert.equal(
      peers.some((p) => p.sku === 'yc.kubernetes.master-basic-4-8.synthetic'),
      false,
    );
  });

  it('T1 Medium find-similar calibrates against other Medium masters', () => {
    const seed = catalog.meters.find((x) => x.sku === 't1.kubernetes.master-medium');
    const f = requireFilter(seed);
    assert.equal(f.kubernetesMasterSize, 'medium');
    assert.match(f.summary, /Medium/);

    const peers = peersMatching(f);
    const providers = new Set(peers.map((p) => p.provider));
    assert.ok(providers.has('t1-cloud'));
    assert.ok(providers.has('cloud-ru'), 'Cloud.ru 4/8 is Medium');
    assert.ok(providers.has('yandex-cloud'), 'Yandex 4/8 · 4/16 are Medium');
    assert.ok(peers.length >= 4, `expected broad Medium set, got ${peers.length}`);
    assert.ok(peers.every((p) => p.dimensions.masterSize === 'medium' || Number(p.dimensions.vcpu) === 4));
    assert.equal(peers.some((p) => p.sku === 't1.kubernetes.master-small'), false);
    assert.equal(peers.some((p) => p.sku === 'mws.kubernetes.master-basic'), false);
    assert.equal(peers.some((p) => p.sku === 'yc.kubernetes.master-basic-8-16.synthetic'), false);
  });

  it('shapeless MWS is Small tier with VK/Yandex/Cloud.ru entry shapes', () => {
    const seed = catalog.meters.find((x) => x.sku === 'mws.kubernetes.master-basic');
    const f = requireFilter(seed);
    assert.equal(f.kubernetesMasterSize, 'small');
    assert.equal(f.kubernetesShapelessOnly, false);
    assert.match(f.summary, /Small/i);

    const peers = peersMatching(f);
    assert.ok(peers.some((p) => p.sku === 'mws.kubernetes.master-basic'));
    assert.ok(peers.some((p) => p.sku === 'selectel.kubernetes.master-basic'));
    assert.ok(peers.some((p) => p.sku === 't1.kubernetes.master-small'));
    assert.ok(peers.some((p) => p.sku === 'vk.kubernetes.master-basic-2-6.synthetic'));
    assert.ok(peers.some((p) => p.sku === 'yc.kubernetes.master-basic-2-8.synthetic'));
    assert.ok(peers.some((p) => p.sku === 'cloudru.kubernetes.master-zonal-2-4'));
    assert.equal(
      peers.some((p) => p.sku === 't1.kubernetes.master-medium' || p.sku === 't1.kubernetes.master-large'),
      false,
    );
    assert.equal(
      peers.some((p) => p.sku === 'yc.kubernetes.master-basic-4-8.synthetic'),
      false,
    );
    assert.equal(
      peers.some((p) => p.comparableTier === 'fixed-component' || p.sku === 'yc.kubernetes.master-zonal'),
      false,
    );
  });

  it('Yandex 0₽ fixed-component cannot seed find-similar', () => {
    const fee = catalog.meters.find((x) => x.sku === 'yc.kubernetes.master-zonal');
    assert.ok(fee);
    assert.equal(comparableFilterFromMeter(fee!), null);
    assert.equal(canFindSimilar(fee!), false);
  });

  it('filters network public IP separately from egress', () => {
    const ip = catalog.meters.find(
      (x) => x.categoryKey === 'network' && x.meter.startsWith('network.ipv4.'),
    );
    const f = requireFilter(ip);
    assert.equal(f.networkFacet, 'public-ip');

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    for (const p of peers) {
      assert.match(p.meter, /^network\.ipv4\./);
    }
    assert.equal(
      peers.some((p) => p.meter === 'network.traffic.egress'),
      false,
    );
  });

  it('filters network egress separately from public IP', () => {
    const egress = catalog.meters.find(
      (x) => x.categoryKey === 'network' && x.meter === 'network.traffic.egress',
    );
    const f = requireFilter(egress);
    assert.equal(f.networkFacet, 'egress');
    const peers = peersMatching(f);
    assert.ok(peers.every((p) => p.meter === 'network.traffic.egress'));
  });

  it('filters CDN traffic kind', () => {
    const m = catalog.meters.find(
      (x) => x.categoryKey === 'cdn' && x.meter.startsWith('cdn.traffic.'),
    );
    const f = requireFilter(m);
    assert.equal(f.category, 'cdn');
    assert.equal(f.cdnFacet, 'traffic');
    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    assert.ok(peers.every((p) => p.meter.startsWith('cdn.traffic.')));
  });

  it('filters compute disk by media (NVMe ≠ SSD)', () => {
    const nvme = catalog.meters.find(
      (x) =>
        x.categoryKey === 'compute' &&
        x.meter === 'storage.block.capacity' &&
        String(x.dimensions.diskMedia ?? x.dimensions.media ?? '').toLowerCase() === 'nvme',
    );
    // Fall back via extract path used in product code.
    const seed =
      nvme ??
      catalog.meters.find(
        (x) => x.categoryKey === 'compute' && /nvme/i.test(`${x.name} ${x.sku}`),
      );
    const f = requireFilter(seed);
    assert.equal(f.category, 'compute');
    assert.equal(f.facet, 'disk');
    if (f.diskFacet === 'nvme') {
      const peers = peersMatching(f);
      assert.ok(peers.length >= 1);
      assert.ok(peers.every((p) => meterMatchesDiskFacet(p, 'nvme')));
    }
  });

  it('keeps disk capacity peers out of IOPS add-on finds', () => {
    const iops = catalog.meters.find(
      (x) => x.categoryKey === 'compute' && x.meter === 'storage.block.iops',
    );
    const f = requireFilter(iops);
    assert.equal(f.diskBillingKind, 'iops');
    assert.match(f.summary, /IOPS/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    assert.ok(peers.every((p) => p.meter === 'storage.block.iops'));
    assert.equal(
      peers.some((p) => p.meter === 'storage.block.capacity'),
      false,
    );
  });

  it('keeps disk IOPS peers out of capacity finds', () => {
    const capacity = catalog.meters.find(
      (x) =>
        x.categoryKey === 'compute' &&
        x.meter === 'storage.block.capacity' &&
        meterMatchesDiskFacet(x, 'nvme'),
    );
    const f = requireFilter(capacity);
    assert.equal(f.diskBillingKind, 'capacity');
    assert.match(f.summary, /ёмкость/);

    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    assert.ok(peers.every((p) => p.meter === 'storage.block.capacity'));
    assert.equal(
      peers.some((p) => p.meter === 'storage.block.iops'),
      false,
    );
  });

  it('filters compute vCPU with share/platform when present', () => {
    const m = catalog.meters.find(
      (x) => x.categoryKey === 'compute' && x.meter === 'compute.vcpu',
    );
    const f = requireFilter(m);
    assert.equal(f.facet, 'vcpu');
    assert.match(f.summary, /Ядра/);
    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    assert.ok(peers.every((p) => p.meter === 'compute.vcpu' || /vcpu/i.test(p.meter)));
  });

  it('filters AI tokens by exact modelId / direction (not coarse family chip)', () => {
    const m = catalog.meters.find(
      (x) =>
        x.categoryKey === 'ai' &&
        (x.meter.includes('token') || x.unitQuantity === '1M-token') &&
        extractAiModelKey(x),
    );
    if (!m) return;
    const f = comparableFilterFromMeter(m);
    if (!f) return;
    assert.equal(f.category, 'ai');
    assert.ok(f.aiModelId);
    const peers = peersMatching(f);
    assert.ok(peers.length >= 1);
    assert.ok(peers.every((p) => p.categoryKey === 'ai'));
    assert.ok(peers.every((p) => extractAiModelKey(p) === f.aiModelId));
  });

  it('gpt-oss-120b find-similar excludes gpt-oss-20b', () => {
    const seed = catalog.meters.find(
      (x) => x.sku === 'mws.ai.gpt-oss-120b.output' || x.sku === 'yc.ai.gpt-oss-120b.output',
    );
    const f = requireFilter(seed);
    assert.equal(f.aiModelId, 'gpt-oss-120b');
    assert.equal(f.aiFacet, 'output');
    assert.match(f.summary, /gpt-oss-120b/i);
    const peers = peersMatching(f);
    assert.ok(peers.length >= 2, 'expect multi-provider 120b output peers');
    assert.ok(peers.every((p) => extractAiModelKey(p) === 'gpt-oss-120b'));
    assert.equal(
      peers.some((p) => extractAiModelKey(p) === 'gpt-oss-20b'),
      false,
    );
  });

  it('glm-5.2 find-similar excludes glm-4.7', () => {
    const seed = catalog.meters.find((x) => x.sku === 'mws.ai.glm-5.2.output');
    const f = requireFilter(seed);
    assert.equal(f.aiModelId, 'glm-5.2');
    const peers = peersMatching(f);
    assert.ok(peers.every((p) => extractAiModelKey(p) === 'glm-5.2'));
    assert.equal(
      peers.some((p) => (extractAiModelKey(p) || '').includes('glm-4.7')),
      false,
    );
  });

  it('returns null when storage has no known class', () => {
    const m = catalog.meters.find(
      (x) =>
        x.categoryKey === 'storage' &&
        typeof x.dimensions.storageClass === 'string' &&
        !['standard', 'warm', 'cold', 'ice'].includes(String(x.dimensions.storageClass)),
    );
    if (!m) return; // catalog may only have the four classes
    assert.equal(comparableFilterFromMeter(m), null);
    assert.equal(canFindSimilar(m), false);
  });

  it('canFindSimilar covers a healthy share of available meters', () => {
    const available = catalog.meters.filter((m) => m.status === 'available');
    const ok = available.filter((m) => canFindSimilar(m));
    // Most billable SKUs should be comparable; leave headroom for exotic rows.
    assert.ok(ok.length / available.length > 0.5, `${ok.length}/${available.length}`);
  });

  it('canFindSimilar is true for typical seeds across categories', () => {
    const seeds = [
      catalog.meters.find(
        (x) =>
          x.categoryKey === 'storage' &&
          x.dimensions.storageClass === 'ice' &&
          x.meter === 'storage.object.capacity',
      ),
      catalog.meters.find(
        (x) => x.categoryKey === 'gpu' && x.meter === 'compute.gpu' && /T4/i.test(x.name + x.sku),
      ),
      catalog.meters.find(
        (x) => x.categoryKey === 'kubernetes' && x.comparableTier === 'ha',
      ),
      catalog.meters.find((x) => x.meter === 'network.traffic.egress'),
    ];
    for (const seed of seeds) {
      assert.ok(seed, 'missing seed');
      assert.equal(canFindSimilar(seed!), true, seed!.sku);
    }
  });
});
