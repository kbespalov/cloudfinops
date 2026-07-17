'use client';

import {Icon} from '@gravity-ui/uikit';
import {
  Cpu,
  Cube,
  Database,
  FaceRobot,
  Globe,
  Gpu,
  Layers3Diagonal,
  NodesRight,
} from '@gravity-ui/icons';
import type {CategoryFilter, CategoryKey} from '@/lib/catalog';
import styles from './CategoryIcon.module.css';

const CATEGORY_ICONS: Record<CategoryKey, typeof Cpu> = {
  compute: Cpu,
  gpu: Gpu,
  storage: Database,
  network: Globe,
  kubernetes: NodesRight,
  ai: FaceRobot,
  other: Cube,
};

const FILTER_ICONS: Record<CategoryFilter, typeof Cpu> = {
  all: Layers3Diagonal,
  compute: Cpu,
  gpu: Gpu,
  storage: Database,
  network: Globe,
  kubernetes: NodesRight,
  ai: FaceRobot,
};

export const CATEGORY_TONE: Record<CategoryKey, string> = {
  compute: 'info',
  gpu: 'warning',
  storage: 'success',
  network: 'utility',
  kubernetes: 'misc',
  ai: 'misc',
  other: 'unknown',
};

export const FILTER_TONE: Record<CategoryFilter, string> = {
  all: 'unknown',
  compute: 'info',
  gpu: 'warning',
  storage: 'success',
  network: 'utility',
  kubernetes: 'misc',
  ai: 'misc',
};

export function CategoryIcon({
  category,
  size = 16,
  withBackground = true,
}: {
  category: CategoryKey;
  size?: number;
  withBackground?: boolean;
}) {
  if (!withBackground) {
    return <Icon data={CATEGORY_ICONS[category]} size={size} />;
  }
  return (
    <span className={styles.wrap} data-tone={CATEGORY_TONE[category]}>
      <Icon data={CATEGORY_ICONS[category]} size={size} />
    </span>
  );
}

export function CategoryFilterIcon({filter, size = 14}: {filter: CategoryFilter; size?: number}) {
  return (
    <span className={styles.wrapSm} data-tone={FILTER_TONE[filter]}>
      <Icon data={FILTER_ICONS[filter]} size={size} />
    </span>
  );
}
