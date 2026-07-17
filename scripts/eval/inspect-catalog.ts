import {catalog, extractGpuModel, extractAiModelFamily, extractStorageClass, extractDiskMedia} from '../../src/lib/catalog';

const byCat = new Map<string, number>();
const gpuModels = new Map<string, Set<string>>();
const aiModels = new Map<string, Set<string>>();
const storageClasses = new Map<string, Set<string>>();
const diskMedia = new Map<string, Set<string>>();

function add(map: Map<string, Set<string>>, key: string | null, provider: string) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(provider);
}

for (const m of catalog.meters) {
  byCat.set(m.categoryKey, (byCat.get(m.categoryKey) ?? 0) + 1);
  if (m.categoryKey === 'gpu') add(gpuModels, extractGpuModel(m), m.provider);
  if (m.categoryKey === 'ai') add(aiModels, extractAiModelFamily(m), m.provider);
  if (m.categoryKey === 'storage') add(storageClasses, extractStorageClass(m), m.provider);
  if (m.meter.startsWith('storage.block')) add(diskMedia, extractDiskMedia(m), m.provider);
}

console.log('=== providers ===');
console.log(catalog.providers.map((p) => `${p.id} (${p.count})`).join('\n'));
console.log('\n=== categories ===');
console.log([...byCat.entries()].map(([k, v]) => `${k}: ${v}`).join('\n'));
console.log('\n=== GPU models (providers offering) ===');
console.log([...gpuModels.entries()].sort().map(([k, v]) => `${k}: ${[...v].join(', ')}`).join('\n'));
console.log('\n=== AI models (providers offering) ===');
console.log([...aiModels.entries()].sort().map(([k, v]) => `${k}: ${[...v].join(', ')}`).join('\n'));
console.log('\n=== Storage classes ===');
console.log([...storageClasses.entries()].sort().map(([k, v]) => `${k}: ${[...v].join(', ')}`).join('\n'));
console.log('\n=== Disk media ===');
console.log([...diskMedia.entries()].sort().map(([k, v]) => `${k}: ${[...v].join(', ')}`).join('\n'));
