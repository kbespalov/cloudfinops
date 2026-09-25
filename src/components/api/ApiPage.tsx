'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowRight, ArrowUpRight, Bars, Check, ChevronRight, Copy, Magnifier, Moon, Play, Sun, Xmark} from '@gravity-ui/icons';
import {useAppTheme} from '@/components/AppProviders';
import type {EstimateResult, PublicProduct, PublicRegion, PublicService} from '@/lib/public-api/types';
import {baseUrl, computeExample, endpoints, gpuExample, guides, mcpUrl, type Parameter} from './api-reference';
import styles from './ApiPage.module.css';
import {AttributeFields, AttributeReference} from './AttributeFields';
import {compileAttributeDrafts, emptyAttributeDraft, type AttributeDrafts} from './attribute-form';
import type {CategoryAttributes} from '@/lib/public-api/attribute-registry';
import {PUBLIC_UNITS} from '@/lib/public-api/constants';
import {documentationPath} from '@/lib/public-api/discovery';
import {rich, typograph} from './doc-text';

type ApiResponse = {data?: unknown; meta?: Record<string, unknown>; pagination?: {nextCursor: string | null}; error?: {code: string; message: string; details?: unknown[]}};
type Language = 'cURL' | 'JavaScript' | 'Python' | 'JSON';
type Props = {initialSection: string; exampleProduct: PublicProduct; exampleRegion: PublicRegion; exampleEstimate: EstimateResult; providers: Array<{id: string; name: string}>; services: PublicService[]; attributeCategories: CategoryAttributes[]; regions: PublicRegion[]};
const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const validSection = (id: string) => guides.some(g => g.id === id) || endpoints.some(e => e.id === id) || id === 'mcp-connect' || endpoints.some(e => e.tool && 'mcp-' + e.id === id);

function CopyButton({value, label = 'Копировать'}: {value: string; label?: string}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => { if (state !== 'idle') { const timer = setTimeout(() => setState('idle'), 2200); return () => clearTimeout(timer); } }, [state]);
  return <button className={styles.copyButton} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setState('copied'); } catch { setState('error'); }
  }} aria-label={state === 'copied' ? 'Скопировано' : label}>
    {state === 'copied' ? <Check width={14}/> : <Copy width={14}/>}
    <span aria-live="polite">{state === 'copied' ? 'Скопировано' : state === 'error' ? 'Не удалось скопировать' : label}</span>
  </button>;
}

function Code({value, compact = false}: {value: string; compact?: boolean}) {
  // React escapes every token; API output is never rendered as HTML.
  const tokens = value.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:true|false|null|const|await|new|import|from|print|curl|return)\b|\b\d+(?:\.\d+)?\b|\/\/[^\n]*)/g);
  return <pre className={compact ? styles.compactCode : styles.code}><code>{tokens.map((token, i) => {
    const kind = /^["']/.test(token) ? (/^\s*:/.test(tokens[i + 1] ?? '') ? styles.codeKey : styles.codeString) :
      /^(true|false|null|const|await|new|import|from|print|curl|return)$/.test(token) ? styles.codeKeyword :
      /^\d/.test(token) ? styles.codeNumber : token.startsWith('//') ? styles.codeComment : undefined;
    return <span className={kind} key={i}>{token}</span>;
  })}</code></pre>;
}

function Parameters({items}: {items: Parameter[]}) {
  return <section className={styles.docSection}><h2>Параметры</h2>
    {items.length ? <div className={styles.parameters}>{items.map(p => <div className={styles.parameter} key={p.name}>
      <div className={styles.parameterHead}><code>{p.name}</code><span>{p.type}</span>{p.required && <b>обязательный</b>}</div>
      <p>{rich(p.description)}</p>{p.default && <small>По умолчанию: <code>{p.default}</code></small>}
    </div>)}</div> : <p>Этот метод не принимает параметры.</p>}
  </section>;
}
function Callout({children}: {children: string}) {
  return <div className={styles.callout} role="note"><strong>Примечание</strong><div>{rich(children)}</div></div>;
}
function StatusReference() {
  return <div className={styles.statusList}>{[
    ['priced', 'Все обязательные компоненты оценены. Только такие предложения входят в `lowestPriceProviderIds` и в сравнение цен.'],
    ['incomplete', 'Не хватает ставки, сведений о НДС или условий тарификации. `total` равен `null` — это не нулевая цена.'],
    ['unavailable', 'В каталоге нет SKU, удовлетворяющих ограничениям запроса. Это не значит, что услуга отсутствует у провайдера.'],
    ['error', 'Расчёт для этого провайдера завершился ошибкой.'],
  ].map(([name, description]) => <div key={name}><code>{name}</code><p>{rich(description)}</p></div>)}</div>;
}
function QuoteSummary({estimate}: {estimate: EstimateResult}) {
  return <div className={styles.summary}><p className={styles.summaryCaption}>{typograph(`Полный расчёт за 720 часов доступен для ${estimate.coverage.priced} из ${estimate.coverage.requested} провайдеров.`)}</p>
    {estimate.quotes.map(q => <details className={styles.quote} key={q.provider.id}>
      <summary><span><strong>{q.provider.name}</strong><small>{q.status}</small></span><span className={styles.quotePrice}>{q.total ? Number(q.total.amount).toLocaleString('ru-RU', {minimumFractionDigits: 2}) + ' ₽' : 'Нет оценки'}<ChevronRight width={13}/></span></summary>
      {q.reason && <p>{q.reason.message} <code>{q.reason.path}</code></p>}
      {q.matchedResource && <><h4>Фактическая конфигурация</h4><Code value={pretty(q.matchedResource)} compact/></>}
      {!!q.differences.length && <><h4>Отличия от запроса</h4><Code value={pretty(q.differences)} compact/></>}
      {!!q.lineItems.length && <div className={styles.lineItems}>{q.lineItems.map((line, i) => <div key={i}><span>{line.label}<small>{line.quantity} {line.unit} · НДС: {line.vat}</small></span><strong>{line.amount?.amount ?? '—'} ₽</strong></div>)}</div>}
    </details>)}
  </div>;
}

export function ApiPage({initialSection, exampleProduct, exampleRegion, exampleEstimate, providers, services, attributeCategories, regions}: Props) {
  const {theme, setTheme} = useAppTheme();
  const router = useRouter();
  const section = initialSection;
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('cURL');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [service, setService] = useState('');
  const [unit, setUnit] = useState('');
  const [meterFilter, setMeterFilter] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [attributeDrafts, setAttributeDrafts] = useState<AttributeDrafts>({});
  const compiledAttributes = compileAttributeDrafts(attributeDrafts);
  const [productId, setProductId] = useState(exampleProduct.id);
  const [providerId, setProviderId] = useState('selectel');
  const [body, setBody] = useState(computeExample);
  const [cursor, setCursor] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [responseTab, setResponseTab] = useState<'json' | 'summary'>('json');
  const [requestInfo, setRequestInfo] = useState<{status: number; ms: number; id: string | null} | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mcp = section.startsWith('mcp-');
  const endpoint = endpoints.find(e => e.id === section.replace(/^mcp-/, ''));
  const executable = !mcp && Boolean(endpoint || section === 'overview');
  const activeEndpoint = endpoint ?? endpoints[0];
  const isEstimate = activeEndpoint.id === 'estimates';
  const hasProductId = ['product', 'alternatives'].includes(activeEndpoint.id);
  const title = mcp ? endpoint?.tool ?? 'Подключение MCP' : endpoint?.title ?? (section === 'overview' ? 'Cloud FinOps API' : guides.find(g => g.id === section)?.title ?? '');

  useEffect(() => {
    function syncHash() {
      const id = window.location.hash.slice(1);
      // Preserve links shared before the documentation gained standalone URLs.
      if (validSection(id)) router.replace(documentationPath(id));
    }
    syncHash(); window.addEventListener('hashchange', syncHash);
    return () => { window.removeEventListener('hashchange', syncHash); abortRef.current?.abort(); };
  }, [router]);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.getElementById('api-navigation');
    sidebar?.querySelector<HTMLInputElement>('input')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key === 'Tab') {
        const items = Array.from(sidebar?.querySelectorAll<HTMLElement>('a, button, input') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); menuButtonRef.current?.focus(); };
  }, [menuOpen]);
  function navigate(id: string) {
    abortRef.current?.abort(); setPending(false);
    setResponse(null); setFailure(''); setRequestInfo(null); setCursor('');
    setMenuOpen(false); setSearch(''); setResponseTab('json');
    router.push(documentationPath(id));
  }
  function resetResponse() { abortRef.current?.abort(); setPending(false); setResponse(null); setFailure(''); setRequestInfo(null); setCursor(''); }
  function clearProductFilters() {
    setQuery(''); setProvider(''); setCategory(''); setRegion(''); setService(''); setUnit(''); setMeterFilter(''); setAttributeDrafts({}); resetResponse();
  }
  function selectProductExample(kind: 'gpu' | 'tokens' | 'embeddings') {
    clearProductFilters(); setCategory(kind === 'gpu' ? 'gpu' : 'ai');
    setService(kind === 'gpu' ? '' : 'ai'); setUnit(kind === 'gpu' ? '' : 'token');
    setMeterFilter(kind === 'embeddings' ? 'ai.embeddings.tokens' : '');
    if (kind === 'gpu') setAttributeDrafts({gpuModel: {...emptyAttributeDraft(), value: 'NVIDIA L4'}});
  }
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (provider) params.set('providers', provider);
  if (service) params.set('services', service);
  if (unit) params.set('units', unit);
  if (meterFilter) params.set('meters', meterFilter);
  if (category) params.set('categories', category);
  if (region) params.append('regions', region);
  if (Object.keys(compiledAttributes.filters).length) params.set('attributes', JSON.stringify(compiledAttributes.filters));
  params.set('limit', '3');
  if (cursor) params.set('cursor', cursor);
  let path = '/api/v1' + activeEndpoint.path.replace('{id}', encodeURIComponent(hasProductId ? productId : providerId));
  if (activeEndpoint.id === 'products') path += '?' + params;
  if (activeEndpoint.id === 'attributes' && category) path += '?' + new URLSearchParams({categories: category});
  const url = 'https://cloudfinops.ru' + path;
  const method = activeEndpoint.method;
  const curl = activeEndpoint.id === 'products' ? 'curl --get ' + shellQuote(baseUrl + '/products') + Array.from(params, ([key, value]) => ' \\\n  --data-urlencode ' + shellQuote(key + '=' + value)).join('') : 'curl ' + (method === 'POST' ? '-X POST ' : '--get ') + shellQuote(url) +
    (method === 'POST' ? " \\\n  -H 'Content-Type: application/json' \\\n  --data-raw " + shellQuote(body) : '');
  const js = 'const response = await fetch(\n  ' + JSON.stringify(url) +
    (method === 'POST' ? ',\n  {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify(' + body.replaceAll('\n', '\n    ') + ')\n  }' : '') +
    '\n);\n\nconst result = await response.json();';
  const python = 'import requests\n\nresponse = requests.' + method.toLowerCase() + '(\n    ' + JSON.stringify(url) +
    (method === 'POST' ? ',\n    headers={"Content-Type": "application/json"},\n    data=' + JSON.stringify(body) : '') + '\n)\n\nprint(response.json())';
  const mcpArgs = endpoint?.id === 'estimates' ? body : endpoint?.id === 'products' ? pretty({services: ['ai'], units: ['token'], limit: 3}) : hasProductId ? pretty({id: productId}) : '{}';
  const mcpCode = endpoint ? 'const result = await client.callTool({\n  name: "' + endpoint.tool + '",\n  arguments: ' + mcpArgs.replaceAll('\n', '\n  ') + '\n});\n\nconsole.log(result.structuredContent);' :
    'import { Client } from\n  "@modelcontextprotocol/sdk/client/index.js";\nimport { StreamableHTTPClientTransport } from\n  "@modelcontextprotocol/sdk/client/streamableHttp.js";\n\nconst client = new Client({\n  name: "my-finops-app",\n  version: "1.0.0"\n});\n\nawait client.connect(\n  new StreamableHTTPClientTransport(\n    new URL("' + mcpUrl + '")\n  )\n);\n\nconst { tools } = await client.listTools();';
  const invalidAttributes = activeEndpoint.id === 'products' ? compiledAttributes.error : '';
  const currentCode = invalidAttributes ? '# ' + invalidAttributes : mcp ? mcpCode : language === 'JavaScript' ? js : language === 'Python' ? python : language === 'JSON' && isEstimate ? body : curl;

  async function run(nextCursor?: string) {
    if (invalidAttributes) return;
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setPending(true); setFailure(''); setRequestInfo(null);
    const start = performance.now();
    try {
      if (method === 'POST') JSON.parse(body);
      const requestPath = new URL(path, window.location.origin);
      if (nextCursor) { requestPath.searchParams.set('cursor', nextCursor); setCursor(nextCursor); }
      const res = await fetch(requestPath.pathname + requestPath.search, {method, signal: controller.signal,
        ...(method === 'POST' ? {headers: {'Content-Type': 'application/json'}, body} : {})});
      const result = await res.json() as ApiResponse;
      if (controller.signal.aborted) return;
      setResponse(result); setRequestInfo({status: res.status, ms: Math.round(performance.now() - start), id: res.headers.get('Request-Id')});
      if (!res.ok) setFailure(result.error?.message ?? 'Не удалось выполнить запрос');
    } catch (error) {
      if (!controller.signal.aborted) { setResponse(null); setFailure(error instanceof SyntaxError ? 'В теле запроса некорректный JSON. Проверьте скобки и кавычки.' : 'Не удалось связаться с API. Попробуйте ещё раз.'); }
    } finally { if (!controller.signal.aborted) setPending(false); }
  }

  const examplePrice = exampleProduct.prices[0];
  const selectedExample = exampleProduct;
  const selectedPrice = selectedExample.prices[0];
  const productSample = {id: selectedExample.id, name: selectedExample.name, provider: selectedExample.provider, service: selectedExample.service, layer: selectedExample.layer, meter: selectedExample.meter,
    ...(selectedExample.service === 'ai' ? {attributes: {modelId: selectedExample.attributes.modelId, modelFamily: selectedExample.attributes.modelFamily, tokenDirection: selectedExample.attributes.tokenDirection, serviceProduct: selectedExample.attributes.serviceProduct, inferenceMode: selectedExample.attributes.inferenceMode}} : {}),
    prices: [{unit: selectedPrice.unit, unitQuantity: selectedPrice.unitQuantity, unitPrice: selectedPrice.unitPrice, vat: selectedPrice.vat}]};
  let example: unknown = {data: [productSample], meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'product') example = {data: productSample, meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'providers' || activeEndpoint.id === 'provider') example = {data: activeEndpoint.id === 'provider' ? providers.find(p => p.id === providerId) : providers, meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'categories') example = {data: [{id: 'gpu', title: 'GPU'}], meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'attributes') example = {data: attributeCategories.filter(item => !category || item.category === category), meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'services') example = {data: services, meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'regions') example = {data: [exampleRegion], meta: {apiVersion: 'v1'}};
  if (activeEndpoint.id === 'alternatives') example = {data: [], pagination: {nextCursor: null}, meta: {apiVersion: 'v1'}};
  if (isEstimate) example = {data: {quotes: exampleEstimate.quotes.map(({provider, status, total, matchedResource}) => ({provider, status, total, matchedResource})), assumptions: exampleEstimate.assumptions}, meta: {apiVersion: 'v1'}};
  const estimate = response?.data && typeof response.data === 'object' && 'quotes' in response.data ? response.data as EstimateResult : null;
  const products = Array.isArray(response?.data) && response.data.every(p => p && typeof p === 'object' && 'prices' in p) ? response.data as PublicProduct[] : null;
  const canSummarize = Boolean(estimate || products?.length);
  const filter = (label: string) => label.toLowerCase().includes(search.toLowerCase().trim());
  const navLink = (id: string, label: string, badge?: string) => <Link key={id} href={documentationPath(id)} prefetch={false} className={styles.navItem} aria-current={section === id ? 'page' : undefined}
    onClick={() => setMenuOpen(false)}>{badge && <span className={badge === 'POST' ? styles.navPost : styles.navMethod}>{badge}</span>}<span>{label}</span></Link>;
  const currentGroup = mcp ? 'MCP' : endpoint?.id === 'estimates' ? 'Калькулятор' : endpoint ? 'Каталог' : 'Начало работы';
  const pageLabel = mcp ? endpoint?.tool ?? 'Подключение MCP' : endpoint?.title ?? guides.find(g => g.id === section)?.title ?? title;

  return <div className={styles.shell} data-theme={theme}>
    <a className={styles.skipLink} href="#reference-content" onClick={e => {e.preventDefault(); document.getElementById('reference-content')?.focus();}}>К содержимому</a>
    <header className={styles.topbar}>
      <Link href="/" className={styles.brand}><span className={styles.brandMark}>CF</span><span>Cloud FinOps<span className={styles.brandSuffix}> / developers</span></span></Link>
      <nav className={styles.surfaceTabs} aria-label="Раздел документации">
        <Link href="/api" aria-current={!mcp ? 'page' : undefined}>API Reference</Link>
        <Link href="/api/mcp" aria-current={mcp ? 'page' : undefined}>MCP</Link>
      </nav>
      <div className={styles.topActions}><span className={styles.version}>v1</span><a href="/api/v1/openapi.json" className={styles.topLink}>OpenAPI <ArrowUpRight width={13}/></a><Link href="/catalog" className={styles.topLink}>На сайт <ArrowUpRight width={13}/></Link>
        <button className={styles.iconButton} aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon width={18}/> : <Sun width={18}/>}</button>
      </div>
    </header>
    <div className={styles.mobileBar}><button ref={menuButtonRef} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="api-navigation"><Bars width={16}/>Навигация</button><span>{currentGroup}<ChevronRight width={12}/>{pageLabel}</span></div>
    {menuOpen && <button className={styles.scrim} aria-label="Закрыть навигацию" onClick={() => setMenuOpen(false)}/>}
    <div className={styles.layout}>
      <aside className={styles.sidebar} data-open={menuOpen} id="api-navigation">
        <div className={styles.sidebarMobileTitle}>Документация<button className={styles.iconButton} onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><Xmark width={18}/></button></div>
        <label className={styles.search}><Magnifier width={16}/><input aria-label="Найти раздел документации" placeholder="Найти раздел…" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <nav aria-label="Методы и руководства">{!mcp ? <>
          <div className={styles.navGroup}><h2>Начало работы</h2>{guides.filter(g => filter(g.title)).map(g => navLink(g.id, g.title))}</div>
          <div className={styles.navGroup}><h2>Каталог</h2>{endpoints.filter(e => e.id !== 'estimates' && filter(e.title + ' ' + e.path)).map(e => navLink(e.id, e.title, e.method))}</div>
          <div className={styles.navGroup}><h2>Калькулятор</h2>{endpoints.filter(e => e.id === 'estimates' && filter(e.title)).map(e => navLink(e.id, e.title, e.method))}</div>
        </> : <>
          <div className={styles.navGroup}><h2>Начало работы</h2>{filter('Подключение MCP') && navLink('mcp-connect', 'Подключение MCP')}</div>
          <div className={styles.navGroup}><h2>Инструменты</h2>{endpoints.filter(e => e.tool && filter(e.tool + ' ' + e.title)).map(e => navLink('mcp-' + e.id, e.tool!))}</div>
        </>}
        {search && !(mcp ? [{title: 'Подключение MCP'}, ...endpoints.filter(e => e.tool).map(e => ({title: e.tool + ' ' + e.title}))] : [...guides, ...endpoints.map(e => ({title: e.title + ' ' + e.path}))]).some(e => filter(e.title)) && <p className={styles.noResults}>Разделы не найдены</p>}
        </nav>
        <div className={styles.sidebarFooter}><span className={styles.publicStatus}>Публичный API, без ключа</span><a href="/llms.txt">Документация для LLM <ArrowUpRight width={13}/></a></div>
      </aside>
      <main className={styles.workspace} id="reference-content" tabIndex={-1}>
        <nav className={styles.breadcrumb} aria-label="Путь к странице"><span>Разработчикам</span><ChevronRight width={12}/><span>{currentGroup}</span><ChevronRight width={12}/><span aria-current="page">{pageLabel}</span></nav>
        <div className={styles.referenceGrid}>
          <article className={styles.article}>
            <h1>{title}</h1>
            <button className={styles.mobileExampleLink} onClick={() => document.getElementById('api-examples')?.scrollIntoView({behavior: 'smooth', block: 'start'})}>{executable ? 'Перейти к выполнению запроса' : 'Перейти к примеру кода'} <ArrowRight width={14}/></button>
            {section === 'overview' && <>
              <p className={styles.lead}>{rich('Cloud FinOps API предоставляет доступ к каталогу SKU и публичным тарифам российских облаков, а также позволяет рассчитывать и сравнивать стоимость конфигураций.')}</p>
              <div className={styles.quickFacts}><span>JSON / HTTPS</span><span>Без API-ключа</span><span>Только чтение</span></div>
              <section className={styles.docSection}><h2>Какие данные доступны</h2><p>{rich(`В каталоге представлены ${providers.map(p => p.name).join(', ')}. REST API позволяет изучать тарифы compute, GPU, хранилищ, сети, CDN, Kubernetes и AI. Для compute и GPU доступен расчёт конфигурации; для остальных категорий можно получить отдельные ставки и правила тарификации.`)}</p></section><section className={styles.docSection}><h2>Первый запрос</h2><p>{rich('Выберите категорию и характеристики или готовый пример запроса. Нажмите «Выполнить запрос», чтобы получить актуальные данные и посмотреть полный ответ API.')}</p><div className={styles.baseUrl}><span>Базовый URL</span><code>{baseUrl}</code><CopyButton value={baseUrl} label="Скопировать URL"/></div></section>
              <section className={styles.docSection}><h2>Каталог и калькулятор</h2>
                <Link href="/api/products" className={styles.featureLink}><div><h3>Каталог продуктов</h3><p>{rich('Каталог содержит характеристики SKU и правила тарификации, включая тарифные ступени, и позволяет находить сопоставимые альтернативы.')}</p></div><ArrowRight width={18}/></Link>
                <Link href="/api/estimates" className={styles.featureLink}><div><h3>Калькулятор конфигураций</h3><p>{rich('По минимально необходимым ресурсам калькулятор подбирает конфигурации у провайдеров и возвращает стоимость каждого компонента.')}</p></div><ArrowRight width={18}/></Link>
              </section>
              <section className={styles.docSection}><h2>Доступ через REST и MCP</h2><p>{rich('REST и MCP используют общий контракт и возвращают одни и те же данные. Для интеграции с приложением доступны REST-методы, а для работы через AI-клиент — пять инструментов MCP.')}</p><Link className={styles.textLink} href="/api/mcp">Подключить MCP <ArrowRight width={15}/></Link></section>
            </>}
            {endpoint && <><p className={styles.lead}>{rich(endpoint.description)}</p><div className={styles.endpointSignature}><span className={endpoint.method === 'POST' ? styles.postBadge : styles.getBadge}>{mcp ? 'TOOL' : endpoint.method}</span><code>{mcp ? endpoint.tool : '/api/v1' + endpoint.path}</code></div>
              {mcp && <p>{rich('Параметры — в `arguments`. Успех: `structuredContent` и тот же JSON в текстовом блоке. Ошибка: `isError=true`, без `structuredContent`.')}</p>}
              {isEstimate && <Callout>Месяц в расчёте — 720 часов. Суммы — оценка по публичным тарифам: итоговую цену и ёмкость уточняйте у провайдера. Ссылайтесь на `source` выбранного SKU и поле `checkedAt`.</Callout>}
              <Parameters items={endpoint.parameters}/><section className={styles.docSection}><h2>Ответ</h2><p>{rich(endpoint.returns)}</p></section>
              {['products', 'attributes'].includes(endpoint.id) && <AttributeReference categories={attributeCategories}/>}
              {isEstimate && <section className={styles.docSection}><h2>Статусы расчёта</h2><StatusReference/></section>}
            </>}
            {section === 'authentication' && <><p className={styles.lead}>{rich('Ключ и регистрация не нужны. Методы только читают каталог или считают стоимость и не меняют данные у провайдеров.')}</p>
              <Parameters items={[{name: '60 запросов / минуту', type: 'на IP / процесс', description: 'При превышении — 429. Время ожидания указано в заголовке `Retry-After`.'}, {name: '64 KiB', type: 'тело запроса', description: 'Максимальный размер JSON в REST и MCP. Больше — 413.'}, {name: 'Request-Id', type: 'response header', description: 'Идентификатор запроса. Сохраняйте его при обращении в поддержку.'}]}/>
              <section className={styles.docSection}><h2>Браузерные приложения</h2><p>{rich('REST отвечает с CORS. MCP отдельно проверяет `Host` и `Origin`. Авторизация не требуется ни там, ни там.')}</p></section><section className={styles.docSection}><h2>Актуальность данных</h2><p>{rich('Дата проверки ставки — в `checkedAt` у продукта и у цены; это не гарантия живой цены. `catalogVersion` — снимок каталога, `calculationVersion` — версия алгоритма расчёта. Ни то ни другое не равно дате, когда провайдер менял прайс.')}</p></section>
            </>}
            {section === 'models' && <><p className={styles.lead}>{rich('`Product` — биллинговый SKU. `Price` — правило его тарификации. `Estimate` собирает продукты в месячную стоимость конфигурации.')}</p>
              <Parameters items={[{name: 'Product.id', type: 'string', description: 'Непрозрачный идентификатор `prod_…`. Сохраняется при обновлении ставки. Исходный SKU провайдера — в `providerSku`.'}, {name: 'Price.unit', type: 'enum', description: 'Единица потребления вместе с периодом, если он есть: `vcpu_hour`, `gib_month`, `token`, `flavor_hour` и другие значения закрытого словаря.'}, {name: 'Price.unitQuantity', type: 'decimal string', description: 'Знаменатель ставки: цена указана за это число единиц. Для пакета в миллион токенов — `"1000000"`.'}, {name: 'Price.tiers', type: 'array | null', description: 'Ступени с полуинтервалом `[from, to)` и ставкой `unitPrice`. `to=null` — ступень без верхней границы.'}, {name: 'Price.vat', type: 'enum', description: '`included`, `excluded` или `unknown`. Если НДС или валюта неизвестны, API не подставляет значения по умолчанию. `null` в денежных полях — не ноль.'}]}/>
              <section className={styles.docSection}><h2>Расчёт стоимости</h2><p>{rich('Строка: объём / `unitQuantity` × ставка. Промежуточные знаки ставки сохраняются; каждая строка округляется до копеек по half-up. Итог — сумма уже округлённых строк, десятичная строка в ₽.')}</p><Callout>В сравнение входят только предложения со статусом `priced`. `incomplete` с `total: null` — не нулевая цена.</Callout></section>
            </>}
            {section === 'pagination' && <><p className={styles.lead}>{rich('Списки каталога отдаются страницами. Непрозрачный `cursor` фиксирует фильтры, порядок и снимок данных.')}</p>
              <ol className={styles.steps}><li><strong>Первая страница</strong><p>{rich('Передайте фильтры и `limit` от 1 до 100. `cursor` не указывайте.')}</p></li><li><strong>Следующая страница</strong><p>{rich('Подставьте `pagination.nextCursor` как есть. Повторять фильтры не нужно: они уже внутри `cursor`.')}</p></li><li><strong>Конец выборки</strong><p>{rich('`pagination.nextCursor` равен `null`.')}</p></li></ol><Callout>Снимок каталога сменился — 409, начните без `cursor`. Фильтры в запросе не совпали с сохранёнными в `cursor` — 400.</Callout>
            </>}
            {section === 'errors' && <><p className={styles.lead}>{rich('Ошибка — JSON с полями `code` и `message`. Ошибки валидации перечислены в `error.details[]`. Для разбора сохраняйте `Request-Id`.')}</p>
              <div className={styles.errorList}>{[['400', 'Некорректный запрос', 'Неверные параметры, типы или операции. Путь к полю — в `error.details[].path`.'], ['404', 'Объект не найден', 'Нет продукта или провайдера с указанным идентификатором.'], ['409', 'Снимок каталога изменился', 'Начните с первой страницы без `cursor`.'], ['413', 'Превышен размер запроса', 'Тело JSON больше 64 KiB.'], ['429', 'Превышен лимит', 'Подождите время из заголовка `Retry-After`.'], ['500', 'Внутренняя ошибка', 'Повторите запрос позже.']].map(([code, label, description]) => <div key={code}><code>{code}</code><span><strong>{label}</strong><p>{rich(description)}</p></span></div>)}</div>
              <section className={styles.docSection}><h2>Статусы предложений в расчёте</h2><p>{rich('`POST /estimates` при корректном теле отвечает 200. Статус каждого провайдера — в `quotes[].status`, это не HTTP-код. `unavailable` значит «нет SKU в каталоге», а не «услуги нет у провайдера».')}</p><StatusReference/></section>
            </>}
            {section === 'mcp-connect' && <><p className={styles.lead}>{rich('MCP-сервер предоставляет AI-клиенту доступ к каталогу облаков через пять инструментов для поиска SKU, изучения тарифов и расчёта стоимости конфигураций.')}</p><div className={styles.quickFacts}><span>Streamable HTTP</span><span>Без авторизации</span><span>5 инструментов</span></div>
              <ol className={styles.steps}><li><strong>Добавьте удалённый MCP-сервер</strong><p>{rich('В настройках AI-клиента выберите подключение удалённого сервера по URL и укажите транспорт Streamable HTTP.')}</p></li><li><strong>Вставьте адрес сервера</strong><div className={styles.baseUrl}><code>{mcpUrl}</code><CopyButton value={mcpUrl} label="Скопировать URL"/></div></li><li><strong>Проверьте доступные инструменты</strong><p>{rich('После подключения клиент получит список из пяти инструментов через `tools/list`. Они используют те же схемы данных, что и REST API.')}</p></li></ol>
              <section className={styles.docSection}><h2>Справочник для AI-клиентов</h2><p>{rich('После подключения клиент может прочитать документацию и OpenAPI через MCP resources.')} <a href="/api/reference.md">Markdown-справочник</a> {rich('содержит примеры вызовов, правила работы с ценами и последовательность выбора инструментов. Его также можно передать агенту, который выполняет обычные HTTP-запросы.')}</p></section><section className={styles.docSection}><h2>Пример запроса к AI-клиенту</h2><div className={styles.promptExample}>{rich('«Сравни месячную стоимость сервера с 4 vCPU, 8 GiB памяти и 100 GiB SSD у всех провайдеров»')}</div><p>{rich('Сравнивайте только предложения со статусом `priced`, а наличие мощностей уточняйте у провайдера.')}</p></section>
            </>}
            <div className={styles.articleFooter}><a href="/api/reference.md">Markdown</a><a href="/llms.txt">llms.txt</a><a href="/api/v1/openapi.json">OpenAPI 3.1 <ArrowUpRight width={12}/></a></div>
          </article>
          <aside className={styles.examples} id="api-examples" aria-label="Примеры и выполнение запросов"><div className={styles.examplesSticky}>
            {mcp ? <>
              <div className={styles.exampleCaption}><span>Подключение</span><span className={styles.liveLabel}>Только чтение</span></div>
              <div className={styles.serverCard}><span>URL сервера</span><div><code>{mcpUrl}</code><CopyButton value={mcpUrl}/></div><small>Streamable HTTP · stateless</small></div>
              <div className={styles.codePanel}><div className={styles.codeToolbar}><span>JavaScript <small>· MCP SDK</small></span><CopyButton value={mcpCode}/></div><Code value={mcpCode}/></div>
              <div className={styles.toolsCard}><h3>Доступные инструменты <span>5</span></h3>{endpoints.filter(e => e.tool).map(e => <button key={e.id} onClick={() => navigate('mcp-' + e.id)}><span><code>{e.tool}</code><small>{e.title}</small></span><ChevronRight width={14}/></button>)}</div>
            </> : executable ? <>
              <div className={styles.exampleCaption}><span>Конструктор запроса</span></div>
              <div className={styles.codePanel}>
                <div className={styles.codeEndpoint}><span className={method === 'POST' ? styles.postBadge : styles.getBadge}>{method}</span><code>{'/api/v1' + activeEndpoint.path}</code></div>
                <div className={styles.codeToolbar}><div className={styles.languageTabs} aria-label="Язык примера">{(['cURL', 'JavaScript', 'Python', ...(isEstimate ? ['JSON'] : [])] as Language[]).map(l => <button key={l} aria-pressed={language === l || language === 'JSON' && !isEstimate && l === 'cURL'} onClick={() => setLanguage(l)}>{l}</button>)}</div><CopyButton value={currentCode}/></div>
                {language === 'JSON' && isEstimate ? <textarea className={styles.jsonEditor} spellCheck={false} aria-label="Тело запроса" value={body} onChange={e => {setBody(e.target.value); resetResponse();}}/> : <Code value={currentCode}/>}
                {isEstimate && <div className={styles.presets}><span>Пример</span><button onClick={() => {setBody(computeExample); setLanguage('JSON'); resetResponse();}}>Compute</button><button onClick={() => {setBody(gpuExample); setLanguage('JSON'); resetResponse();}}>GPU L4</button><button className={styles.editBody} onClick={() => setLanguage('JSON')}>Изменить JSON</button></div>}
                {activeEndpoint.id === 'products' && <div className={styles.presets}><span>Пример</span><button onClick={() => selectProductExample('gpu')}>GPU L4</button><button onClick={() => selectProductExample('tokens')}>Токены AI</button><button onClick={() => selectProductExample('embeddings')}>Эмбеддинги</button><button className={styles.editBody} onClick={clearProductFilters}>Сбросить</button></div>}
                <div className={styles.requestControls}>
                  {['products', 'attributes'].includes(activeEndpoint.id) && <label className={styles.idField}>Категория<select value={category} onChange={e => {setCategory(e.target.value); setAttributeDrafts({}); setService(''); setUnit(''); setMeterFilter(''); resetResponse();}}><option value="">Все категории</option>{attributeCategories.map(c => <option key={c.category} value={c.category}>{c.title}</option>)}</select></label>}
                  {activeEndpoint.id === 'products' && <>
                    <div className={styles.queryFields}>
                      <label>Провайдер<select value={provider} onChange={e => {setProvider(e.target.value); resetResponse();}}><option value="">Все провайдеры</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                      <label>Регион<select value={region} onChange={e => {setRegion(e.target.value); resetResponse();}}><option value="">Не фильтровать</option>{regions.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}</select></label>
                    </div>
                    <AttributeFields category={attributeCategories.find(c => c.category === category)} drafts={attributeDrafts} onChange={value => {setAttributeDrafts(value); resetResponse();}}/>
                    {compiledAttributes.error && <p className={styles.filterHint} role="status">{compiledAttributes.error}</p>}
                    <details className={styles.advancedFilters}><summary>Сервис и тарификация{[service, unit, meterFilter].filter(Boolean).length ? ' · фильтры заданы' : ''}</summary><div className={styles.queryFields}>
                      <label>Сервис<select value={service} onChange={e => {setService(e.target.value); setMeterFilter(''); resetResponse();}}><option value="">Все сервисы</option>{services.filter(s => !category || s.categories.includes(category)).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>
                      <label>Единица тарификации<select value={unit} onChange={e => {setUnit(e.target.value); resetResponse();}}><option value="">Все единицы</option>{PUBLIC_UNITS.map(u => <option key={u} value={u}>{u === 'token' ? 'Токены · token' : u}</option>)}</select></label>
                      <label>Что тарифицируется<select value={meterFilter} onChange={e => {setMeterFilter(e.target.value); resetResponse();}}><option value="">Все ставки</option>{[...new Set(services.filter(s => (!category || s.categories.includes(category)) && (!service || s.id === service)).flatMap(s => s.meters))].sort().map(m => <option key={m} value={m}>{m === 'compute.ram' ? 'Оперативная память · ' + m : m}</option>)}</select></label>
                    </div></details>
                    <label className={styles.idField}>Поиск по названию или SKU · необязательно<input value={query} onChange={e => {setQuery(e.target.value); resetResponse();}} placeholder="Фрагмент названия или SKU"/></label>
                  </>}
                  {hasProductId && <label className={styles.idField}>Product ID<input value={productId} onChange={e => {setProductId(e.target.value); resetResponse();}} spellCheck={false}/></label>}
                  {activeEndpoint.id === 'provider' && <label className={styles.idField}>Провайдер<select value={providerId} onChange={e => {setProviderId(e.target.value); resetResponse();}}>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                  <div className={styles.runRow}><span>Без ключа доступа</span><button className={styles.runButton} disabled={pending || Boolean(invalidAttributes)} onClick={() => void run()}><Play width={13}/>{pending ? 'Выполняется…' : 'Выполнить запрос'}</button></div>
                </div>
              </div>
              <div className={styles.responsePanel} aria-live="polite" aria-busy={pending}>
                <div className={styles.responseToolbar}><span>{response ? 'Ответ' : activeEndpoint.id === 'products' ? 'Результат запроса' : 'Пример ответа'}{!response && activeEndpoint.id !== 'products' && <small>сокращён</small>}</span>{requestInfo ? <span className={requestInfo.status < 400 ? styles.responseOk : styles.responseError}>{requestInfo.status} <small>{requestInfo.ms} ms</small></span> : <span className={styles.exampleBadge}>JSON</span>}</div>
                {failure && <div role="alert" className={styles.errorMessage}>{failure}</div>}
                {canSummarize && <div className={styles.responseTabs}><button aria-pressed={responseTab === 'json'} onClick={() => setResponseTab('json')}>JSON</button><button aria-pressed={responseTab === 'summary'} onClick={() => setResponseTab('summary')}>Сводка</button></div>}
                {!response && activeEndpoint.id === 'products' ? <p className={styles.emptyResponse}>Выполните запрос, чтобы увидеть SKU, соответствующие выбранным фильтрам.</p> : responseTab === 'summary' && canSummarize ? estimate ? <QuoteSummary estimate={estimate}/> : <div className={styles.productSummary}>{products?.map(p => <div key={p.id}><strong>{p.name}</strong><span>{p.provider.name} · {p.region}</span><code>{p.id}</code>{p.prices.map(price => <small key={price.id}>{price.unitPrice?.amount ?? 'Ступенчатая ставка'} {price.currency} / {price.unitLabel} · НДС: {price.vat}</small>)}</div>)}</div> : <Code value={pretty(response ?? example)} compact/>}
                {response?.pagination?.nextCursor && <button disabled={pending} className={styles.nextPage} onClick={() => void run(response.pagination!.nextCursor!)}>Следующая страница <ArrowRight width={14}/></button>}
                {response && <div className={styles.responseFooter}><span title={requestInfo?.id ?? undefined}>{String(response.meta?.catalogVersion ?? requestInfo?.id ?? 'JSON response')}</span><CopyButton value={pretty(response)} label="Копировать JSON"/></div>}
              </div>
              <p className={styles.exampleNote}>{rich(response ? 'Это ответ API текущего сайта. Сведения о версиях и источниках данных приведены в JSON.' : activeEndpoint.id === 'products' ? 'Фильтры описывают характеристики SKU. Для подбора конфигурации по числу vCPU, памяти и GPU используйте `/estimates`.' : 'В примере показана сокращённая структура ответа. Выполните запрос, чтобы получить актуальные данные со всеми полями.')}</p>
            </> : <GuideExample section={section} product={productSample}/>}
          </div></aside>
        </div>
      </main>
    </div>
  </div>;
}

function GuideExample({section, product}: {section: string; product: unknown}) {
  const examples: Record<string, {title: string; code: string; note: string}> = {
    authentication: {title: 'Заголовки ответа', code: 'HTTP/1.1 200 OK\nContent-Type: application/json\nRequest-Id: 9c…\nAccess-Control-Allow-Origin: *\nCache-Control: public, max-age=300', note: 'Ответы каталога кэшируются, а результаты расчётов возвращаются с заголовком `Cache-Control: no-store`.'},
    models: {title: 'Product · сокращённый пример', code: pretty(product), note: 'Полный набор полей `Product` и `Price` описан в схеме OpenAPI 3.1.'},
    pagination: {title: 'Следующая страница', code: 'const url = new URL(\n  "https://cloudfinops.ru/api/v1/products"\n);\nurl.searchParams.set("limit", "50");\nurl.searchParams.set(\n  "cursor", result.pagination.nextCursor\n);\n\nconst next = await fetch(url);\nconst page = await next.json();', note: 'Передавайте `cursor` без изменений: он уже содержит фильтры и версию каталога.'},
    errors: {title: '400 · Invalid request', code: pretty({error: {code: 'invalid_parameter', message: 'Invalid request', details: [{path: '/resource/vcpu', code: 'too_small'}]}}), note: 'HTTP-статус относится к запросу целиком, а статус `quote` описывает результат расчёта для одного провайдера.'},
  };
  const example = examples[section];
  if (!example) return null;
  return <><div className={styles.exampleCaption}><span>Пример</span></div><div className={styles.codePanel}><div className={styles.codeToolbar}><span>{example.title}</span><CopyButton value={example.code}/></div><Code value={example.code}/></div><p className={styles.exampleNote}>{rich(example.note)}</p></>;
}
