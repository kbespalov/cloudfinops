import {catalog, type CatalogMeter} from '@/lib/catalog';
import {canFindSimilar} from '@/lib/catalog/find-similar';
import {selectPeersForCompare} from '@/lib/catalog/peer-match';
import {meterToProduct} from './product';
import type {ProductAlternative} from './types';

export function listAlternatives(seed: CatalogMeter, meters: readonly CatalogMeter[] = catalog.meters): ProductAlternative[] {
  if (!canFindSimilar(seed)) return [];
  const selection = selectPeersForCompare(seed, meters);
  const out: ProductAlternative[] = [];
  for (const row of selection.providerSelections) {
    const pick = row.exactPriceEligible ?? row.exactPriceIneligible ?? row.functional;
    if (!pick) continue;
    const diffs = [
      ...pick.classification.hardDiffs,
      ...pick.classification.softDiffs,
    ].map((d) => ({
      dimension: d.dimension,
      seed: d.seed.state === 'known' ? d.seed.value : d.seed.state,
      candidate: d.candidate.state === 'known' ? d.candidate.value : d.candidate.state,
    }));
    out.push({
      product: meterToProduct(pick.meter),
      mode: pick.classification.mode,
      priceComparable: pick.classification.priceEligible,
      differences: diffs,
      ineligibleReasons: pick.classification.priceIneligibleReasons,
    });
  }
  return out;
}
