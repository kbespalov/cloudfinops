'use client';

import {useEffect, useRef, useState} from 'react';
import type {LakehouseSize} from '@/lib/calculator/lakehouse-presets';
import type {PeriodMode, ViewPresetQuote} from '@/lib/calculator/quote-view';

export type LakehouseQuoteRequest = {
  period: PeriodMode;
  presetId: LakehouseSize;
  lakeTiB: number;
  hotPercent: number;
  k8sTier: 'basic' | 'ha';
  etlHoursPerDay: number;
  queryHoursPerDay: number;
};

function requestKey(req: LakehouseQuoteRequest | null): string {
  return req ? JSON.stringify(req) : '';
}

/** Debounced POST /api/calculator/lakehouse for live sidebar. */
export function useLakehouseQuote(request: LakehouseQuoteRequest | null, debounceMs = 180) {
  const [result, setResult] = useState<ViewPresetQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!request) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = requestKey(request);
    let cancelled = false;
    const mySeq = ++seq.current;
    setResult(null);
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      fetch('/api/calculator/lakehouse', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: key,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`quote ${res.status}`);
          return res.json() as Promise<ViewPresetQuote>;
        })
        .then((data) => {
          if (cancelled || mySeq !== seq.current) return;
          setResult(data);
        })
        .catch((err: unknown) => {
          if (cancelled || mySeq !== seq.current) return;
          setResult(null);
          setError(err instanceof Error ? err.message : 'quote failed');
        })
        .finally(() => {
          if (!cancelled && mySeq === seq.current) setLoading(false);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request, debounceMs]);

  return {result, loading, error};
}
