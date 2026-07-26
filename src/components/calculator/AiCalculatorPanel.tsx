'use client';

import {useEffect, useRef, useState} from 'react';
import {CalculatorChat} from '@/components/calculator/CalculatorChat';
import {
  CalculatorSidebar,
  type ConfigSummary,
} from '@/components/calculator/CalculatorSidebar';
import {
  applySidebarConfig,
  type AppliedSidebarPayload,
  type SidebarConfigPayload,
} from '@/lib/chat/sidebar-config';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import {
  useAdhocQuote,
  type AdhocQuoteRequest,
} from '@/lib/calculator/useAdhocQuote';
import {
  useLakehouseQuote,
  type LakehouseQuoteRequest,
} from '@/lib/calculator/useLakehouseQuote';
import panelStyles from './CalculatorPanel.module.css';

function withPeriod(
  payload: AppliedSidebarPayload,
  period: PeriodMode,
): AppliedSidebarPayload {
  if (payload.kind === 'adhoc') {
    return {
      ...payload,
      request: {...payload.request, period},
    };
  }
  return {
    ...payload,
    request: {...payload.request, period},
  };
}

function applyPayload(
  payload: AppliedSidebarPayload,
  setAdhoc: (r: AdhocQuoteRequest | null) => void,
  setLakehouse: (r: LakehouseQuoteRequest | null) => void,
  setSummary: (s: ConfigSummary | null) => void,
) {
  setSummary(payload.summary);
  if (payload.kind === 'adhoc') {
    setAdhoc(payload.request);
    setLakehouse(null);
  } else {
    setLakehouse(payload.request);
    setAdhoc(null);
  }
}

export function AiCalculatorPanel({period}: {period: PeriodMode}) {
  const [adhocRequest, setAdhocRequest] = useState<AdhocQuoteRequest | null>(null);
  const [lakehouseRequest, setLakehouseRequest] = useState<LakehouseQuoteRequest | null>(
    null,
  );
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const lastPayloadRef = useRef<AppliedSidebarPayload | null>(null);

  const adhoc = useAdhocQuote(adhocRequest);
  const lakehouse = useLakehouseQuote(lakehouseRequest);

  const usingLakehouse = lakehouseRequest != null;
  const result = usingLakehouse ? lakehouse.result : adhoc.result;
  const loading = usingLakehouse ? lakehouse.loading : adhoc.loading;

  // Re-quote when the page period toggle changes, keeping the last chat config.
  useEffect(() => {
    const prev = lastPayloadRef.current;
    if (!prev) return;
    const next = withPeriod(prev, period);
    lastPayloadRef.current = next;
    applyPayload(next, setAdhocRequest, setLakehouseRequest, setConfigSummary);
  }, [period]);

  const onSidebarConfig = (payload: SidebarConfigPayload | null) => {
    if (!payload) {
      lastPayloadRef.current = null;
      setAdhocRequest(null);
      setLakehouseRequest(null);
      setConfigSummary(null);
      return;
    }
    const merged = applySidebarConfig(lastPayloadRef.current, payload, period);
    if (!merged) return;
    lastPayloadRef.current = merged;
    applyPayload(merged, setAdhocRequest, setLakehouseRequest, setConfigSummary);
  };

  return (
    <>
      <div className={panelStyles.formColumn}>
        <CalculatorChat period={period} onSidebarConfig={onSidebarConfig} />
      </div>

      <CalculatorSidebar
        period={period}
        result={result}
        loading={loading}
        emptyHint="Опишите конфигурацию в чате — здесь появится минимальная цена и альтернативы"
        bestPriceHint="Для выбранной конфигурации среди предложений, доступных в каталоге. Расчёт выполнен по публичным тарифам без учёта индивидуальных скидок и промоакций."
        bestPriceBadge="Минимальная цена в каталоге"
        configSummary={configSummary}
      />
    </>
  );
}
