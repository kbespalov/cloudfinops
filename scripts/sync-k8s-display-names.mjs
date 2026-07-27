/**
 * Sync Managed Kubernetes YAML dimensions + taxonomy display names.
 * Run: node scripts/sync-k8s-display-names.mjs && npm run data:build
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILES = [
  'prices/cloud-ru/paas/containers/managed-kubernetes.yaml',
  'prices/mws-cloud/paas/containers/managed-kubernetes.yaml',
  'prices/selectel/paas/containers/managed-kubernetes.yaml',
  'prices/t1-cloud/paas/containers/managed-kubernetes.yaml',
  'prices/vk-cloud/paas/containers/managed-kubernetes.yaml',
  'prices/yandex-cloud/paas/containers/managed-kubernetes.yaml',
];

function presetFamilyFromHost(host) {
  if (!host) return null;
  if (/^m-c\d/i.test(host)) return 'memory-optimized';
  if (/^c-c\d/i.test(host)) return 'cpu-optimized';
  if (/^s-c\d/i.test(host)) return 'standard';
  return null;
}

function familyTitle(family) {
  if (family === 'cpu-optimized') return 'CPU-optimized';
  if (family === 'memory-optimized') return 'Memory-optimized';
  if (family === 'standard') return 'Standard';
  return null;
}

function parseDims(dimBlock) {
  const dims = {};
  for (const line of dimBlock.split('\n')) {
    const kv = line.match(/^\s{6}([A-Za-z0-9_]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    if (raw === 'true') dims[key] = true;
    else if (raw === 'false') dims[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) dims[key] = Number(raw);
    else if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))
    ) {
      dims[key] = raw.slice(1, -1);
    } else dims[key] = raw;
  }
  return dims;
}

function upsertDim(dimBlock, key, value) {
  const rendered =
    typeof value === 'boolean' || typeof value === 'number' ? String(value) : String(value);
  const lineRe = new RegExp(`^(\\s{6}${key}:\\s*).+$`, 'm');
  if (lineRe.test(dimBlock)) return dimBlock.replace(lineRe, `$1${rendered}`);
  return `      ${key}: ${rendered}\n` + dimBlock;
}

function buildName(sku, dims, meter) {
  const unit =
    /\.(vcpu|ram)$/i.test(sku) ||
    /\.(vcpu|ram)$/i.test(meter || '') ||
    dims.sizingModel === 'resource-meter';
  if (unit) {
    if (/vcpu/i.test(sku) || /vcpu/i.test(meter || '')) return 'Ресурсы мастера · vCPU';
    if (/ram/i.test(sku) || /ram/i.test(meter || '')) return 'Ресурсы мастера · RAM';
  }

  const avail = dims.availability;
  const topo =
    avail === 'regional' || dims.faultTolerant === true || dims.comparableTier === 'ha'
      ? 'HA'
      : 'базовый';
  const parts = ['Мастер Kubernetes', topo];

  const vcpu = Number(dims.vcpu);
  const ram = Number(dims.ramGiB ?? dims.ramGb);
  const hasShape = Number.isFinite(vcpu) && vcpu > 0 && Number.isFinite(ram) && ram > 0;
  const masters = Number(dims.masterCount);
  const mc = Number.isFinite(masters) && masters > 0 ? masters : 1;
  const shape = hasShape
    ? mc > 1
      ? `${mc} × ${vcpu} vCPU / ${ram} ГиБ`
      : `${vcpu} vCPU / ${ram} ГиБ`
    : null;
  const family = dims.presetFamily || presetFamilyFromHost(dims.hostType);
  const share = typeof dims.guaranteedVcpuShare === 'string' ? dims.guaranteedVcpuShare : null;
  const sizeTier = dims.masterSize
    ? String(dims.masterSize).charAt(0).toUpperCase() +
      String(dims.masterSize).slice(1).toLowerCase()
    : null;
  const isClusterFee =
    dims.sizingModel === 'cluster-fee' ||
    dims.comparableTier === 'fixed-component' ||
    (!shape &&
      !sizeTier &&
      (dims.comparabilityClass === 'native-fixed' ||
        dims.comparabilityClass === 'fixed-component'));

  if (shape) {
    const ft = familyTitle(family);
    if (ft) parts.push(ft);
    parts.push(shape);
    if (share) parts.push(share.endsWith('%') ? `${share} vCPU` : share);
  } else if (sizeTier && (dims.sizingModel === 'marketing-tier' || !isClusterFee)) {
    parts.push(sizeTier);
  } else if (isClusterFee || !sizeTier) {
    parts.push('плата за кластер');
  } else {
    parts.push(sizeTier);
  }

  if (dims.synthetic === true || String(sku).includes('.synthetic')) parts.push('оценка');
  return parts.join(' · ');
}

function enrichDims(sku, meter, dims, dimBlock) {
  let next = dimBlock;
  const set = (k, v) => {
    dims[k] = v;
    next = upsertDim(next, k, v);
  };

  if (/\.(vcpu|ram)$/i.test(sku) || /\.(vcpu|ram)$/i.test(meter || '')) {
    set('sizingModel', 'resource-meter');
    return next;
  }
  if (sku.startsWith('cloudru.kubernetes.') && dims.vcpu != null) {
    set('guaranteedVcpuShare', dims.guaranteedVcpuShare || '100%');
    set('sizingModel', 'shape');
  }
  if (sku.startsWith('mws.kubernetes.') || sku.startsWith('selectel.kubernetes.')) {
    set('sizingModel', 'cluster-fee');
  }
  if (sku.startsWith('t1.kubernetes.')) {
    set('sizingModel', 'marketing-tier');
  }
  if (sku === 'yc.kubernetes.master-zonal' || sku === 'yc.kubernetes.master-regional') {
    set('sizingModel', 'cluster-fee');
    set('legacy', true);
    set('parityOnly', true);
  }
  if (sku.startsWith('yc.kubernetes.') && sku.includes('.synthetic')) {
    const family = presetFamilyFromHost(dims.hostType);
    if (family) {
      set('presetFamily', family);
      set('sizingModel', 'preset');
    }
  }
  if (sku.startsWith('vk.kubernetes.') && sku.includes('.synthetic')) {
    set('sizingModel', 'observed-flavor');
  }
  return next;
}

function syncFile(rel) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, 'utf8');
  const updated = text.replace(
    /(  - sku:\s*)(\S+)([\s\S]*?)(?=\n  - sku:|\n*$)/g,
    (full, skuPrefix, sku, rest) => {
      const meter = (rest.match(/\n    meter:\s*(\S+)/) || [])[1] || '';
      const dimMatch = rest.match(
        /(\n    dimensions:\n)([\s\S]*?)(?=\n    (?:pricing|notes|sourceRefs|priceProvenance):)/,
      );
      if (!dimMatch) {
        // Still rewrite name for unit SKUs without rich dims.
        const name = buildName(sku, {sizingModel: 'resource-meter'}, meter);
        return skuPrefix + sku + rest.replace(/\n    name:\s*.+/, `\n    name: ${name}`);
      }
      let dims = parseDims(dimMatch[2]);
      let dimBody = enrichDims(sku, meter, dims, dimMatch[2]);
      dims = parseDims(dimBody);
      const name = buildName(sku, dims, meter);
      let nextRest = rest.replace(dimMatch[0], dimMatch[1] + dimBody);
      nextRest = nextRest.replace(/\n    name:\s*.+/, `\n    name: ${name}`);
      return skuPrefix + sku + nextRest;
    },
  );
  fs.writeFileSync(file, updated);
  console.log('updated', rel);
}

for (const f of FILES) syncFile(f);
console.log('done');
