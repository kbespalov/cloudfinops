import {endpoints, guides} from '@/components/api/api-reference';
import {plainText} from './doc-typography';

export const SITE_URL = 'https://cloudfinops.ru';
export const API_URL = `${SITE_URL}/api/v1`;
export const MCP_URL = `${SITE_URL}/mcp`;
export const DOCS_UPDATED_AT = '2026-09-18';
export const DISCOVERY_LINKS = `<${SITE_URL}/llms.txt>; rel="describedby", <${API_URL}/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", <${SITE_URL}/api>; rel="service-doc"; type="text/html"`;

export function documentationPath(section: string): string {
  return section === 'overview' ? '/api' : section === 'mcp-connect' ? '/api/mcp' : `/api/${section}`;
}

const guideDescriptions: Record<string, string> = {
  overview: 'CloudFinOps Public API: каталог SKU и тарифов российских облаков, расчёт стоимости VM и GPU, REST API и MCP для AI-ассистентов. Без API-ключа.',
  authentication: 'Доступ к CloudFinOps Public API без ключа: лимит запросов, размер JSON, CORS, проверка MCP Host и Origin и актуальность тарифных данных.',
  models: 'Объекты Product, Price и Estimate в CloudFinOps API: характеристики SKU, единицы потребления, тарифные ступени, НДС и точность денежных расчётов.',
  pagination: 'Постраничное чтение каталога CloudFinOps API: limit, nextCursor, фильтры и обработка смены снимка каталога.',
  errors: 'Ошибки CloudFinOps REST API и MCP: коды HTTP, валидация, ограничения запросов и статусы priced, incomplete, unavailable и error.',
};

export const DOCUMENTATION_PAGES = [
  ...guides.map(g => ({section: g.id, title: g.id === 'overview' ? 'CloudFinOps Public API — каталог облаков и MCP' : g.title,
    description: guideDescriptions[g.id], path: documentationPath(g.id)})),
  ...endpoints.map(e => ({section: e.id, title: `${e.title} — ${e.method} ${e.path}`,
    description: plainText(e.description), path: documentationPath(e.id)})),
  {section: 'mcp-connect', title: 'MCP-сервер CloudFinOps — тарифы облаков для AI-ассистентов',
    description: 'Подключение CloudFinOps MCP по Streamable HTTP: пять инструментов для поиска облачных SKU, изучения тарифов и расчёта стоимости VM и GPU без API-ключа.', path: '/api/mcp'},
  ...endpoints.filter(e => e.tool).map(e => ({section: `mcp-${e.id}`, title: `${e.tool} — инструмент CloudFinOps MCP`,
    description: `MCP ${e.tool}: ${plainText(e.description)}`, path: documentationPath(`mcp-${e.id}`)})),
];

export function documentationPage(section: string) {
  return DOCUMENTATION_PAGES.find(page => page.section === section);
}
