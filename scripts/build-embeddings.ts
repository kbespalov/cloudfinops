/**
 * Precompute Cloud.ru embeddings for every catalog meter.
 *
 * Usage:
 *   npm run data:build && npm run data:embeddings
 *
 * Requires CLOUDRU_FM_API_KEY (.env.local). Writes
 * src/data/catalog-embeddings.generated.json (commit so prod hybrid works
 * without re-embedding).
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import {catalog} from '../src/lib/catalog';
import {meterToEmbedText} from '../src/lib/chat/embed-docs';
import {
  EMBEDDING_MODEL,
  embedTexts,
  encodeVector,
  type CatalogEmbeddingsFile,
} from '../src/lib/chat/embeddings';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/data/catalog-embeddings.generated.json');
const BATCH = 32;

async function main() {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    console.error('CLOUDRU_FM_API_KEY missing — cannot build embeddings.');
    process.exit(1);
  }
  if (!catalog.meters.length) {
    console.error('Catalog is empty — run npm run data:build first.');
    process.exit(1);
  }

  const docs = catalog.meters.map((m) => ({
    id: m.id,
    sku: m.sku,
    text: meterToEmbedText(m),
  }));

  console.log(`Embedding ${docs.length} meters with ${EMBEDDING_MODEL} (batch=${BATCH})…`);
  const items: CatalogEmbeddingsFile['items'] = [];
  let dims = 0;

  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    const vectors = await embedTexts(chunk.map((d) => d.text));
    if (!dims) dims = vectors[0].length;
    for (let j = 0; j < chunk.length; j++) {
      items.push({
        id: chunk[j].id,
        sku: chunk[j].sku,
        vector: encodeVector(vectors[j]),
      });
    }
    console.log(`  …${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }

  const out: CatalogEmbeddingsFile = {
    model: EMBEDDING_MODEL,
    dims,
    generatedAt: new Date().toISOString(),
    catalogAsOf: catalog.asOf,
    items,
  };

  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(out));
  const mb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${items.length} vectors (${dims}-d) → ${path.relative(ROOT, OUT)} (${mb} MiB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
