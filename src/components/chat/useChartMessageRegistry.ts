'use client';

import {useEffect, useState} from 'react';
import type {MessageRendererRegistry} from '@gravity-ui/aikit';

/** Client-only: ChartKit must not evaluate during SSR. */
export function useChartMessageRegistry(): MessageRendererRegistry | undefined {
  const [value, setValue] = useState<MessageRendererRegistry>();
  useEffect(() => {
    let cancelled = false;
    void import('./chart-message-registry').then((mod) => {
      if (!cancelled) setValue(mod.chartMessageRegistry);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}
