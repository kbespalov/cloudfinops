import type {ComponentType, SVGProps} from 'react';
import {
  Bucket,
  Chart,
  Disk,
  Network,
  NoSearchResults,
  NotFound,
  Project,
  Snapshot,
  Template,
  VirtualMachine,
} from '@gravity-ui/illustrations';
import type {CategoryFilter, ComputeFacet} from '@/lib/catalog';

type Illustration = ComponentType<SVGProps<SVGSVGElement>>;

/** Catalog empty state: pick a Gravity illustration for the active tab/facet. */
export function catalogEmptyIllustration(
  category: CategoryFilter,
  facet: ComputeFacet,
  hasSearch: boolean,
): Illustration {
  if (hasSearch) return NoSearchResults;

  if (category === 'compute') {
    if (facet === 'disk') return Disk;
    if (facet === 'image') return Template;
    if (facet === 'snapshot') return Snapshot;
    return VirtualMachine;
  }

  switch (category) {
    case 'gpu':
      return VirtualMachine;
    case 'storage':
      return Bucket;
    case 'network':
      return Network;
    case 'kubernetes':
      return Project;
    case 'ai':
      return Chart;
    case 'all':
    default:
      return NoSearchResults;
  }
}

export const NEWS_EMPTY_ILLUSTRATION = NoSearchResults;
export const CALCULATOR_EMPTY_ILLUSTRATION = NotFound;
export const GPU_PRESET_EMPTY_ILLUSTRATION = VirtualMachine;
