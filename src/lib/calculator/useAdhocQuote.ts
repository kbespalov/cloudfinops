'use client';

import {useEffect, useRef, useState} from 'react';
import type {ComputeFamily, DiskMedia, PurchaseModel, VcpuShare} from '@/lib/calculator/presets';
import type {PeriodMode, ViewPresetQuote} from '@/lib/calculator/quote-view';

export type AdhocComputeQuoteRequest = {
  kind: 'compute';
  period: PeriodMode;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  diskMedia?: DiskMedia;
  family?: ComputeFamily;
  vmCount?: number;
  publicIpCount?: number;
  purchaseModel?: PurchaseModel;
  vcpuShare?: VcpuShare;
};

export type AdhocGpuQuoteRequest = {
  kind: 'gpu';
  period: PeriodMode;
  gpuModelMatch: string;
  gpuCount: number;
  vcpu?: number;
  ramGiB?: number;
  diskGiB?: number;
  gpuInterconnect?: string | null;
  /** Selectel dedicated nodes (e.g. B300) — bundle without host vCPU/RAM. */
  dedicated?: boolean;
  gpuMemoryGb?: number | null;
};

export type AdhocQuoteRequest = AdhocComputeQuoteRequest | AdhocGpuQuoteRequest;

function requestKey(req: AdhocQuoteRequest | null): string {
  return req ? JSON.stringify(req) : '';
}

/** Debounced POST /api/calculator/quote for live calculator sidebar. */
export function useAdhocQuote(request: AdhocQuoteRequest | null, debounceMs = 180) {
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
    // Drop the previous quote immediately so the sidebar does not show a stale
    // provider/price while the new request is in flight.
    setResult(null);
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      fetch('/api/calculator/quote', {
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
