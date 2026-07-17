import type {CategoryKey} from '@/lib/catalog';

export type LabelTheme =
  | 'normal'
  | 'info'
  | 'danger'
  | 'warning'
  | 'success'
  | 'utility'
  | 'unknown'
  | 'clear';

export function categoryLabelTheme(category: CategoryKey): LabelTheme {
  switch (category) {
    case 'compute':
      return 'info';
    case 'gpu':
      return 'warning';
    case 'storage':
      return 'success';
    case 'network':
      return 'utility';
    case 'kubernetes':
      return 'utility';
    case 'ai':
      return 'info';
    default:
      return 'unknown';
  }
}
