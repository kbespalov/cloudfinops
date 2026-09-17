import {listProviders} from '@/lib/public-api/catalog';

export const dynamic = 'force-dynamic';

export function GET() {
  const providers = listProviders()
    .map((p) => `- ${p.name} (\`${p.id}\`): ${p.productCount} products`)
    .join('\n');
  const body = `# CloudFinOps

> Каталог облачных SKU РФ и оценка конфигураций. Цены не выдумывать.

База REST: https://cloudfinops.ru/api/v1
OpenAPI: https://cloudfinops.ru/api/v1/openapi.json
MCP: https://cloudfinops.ru/mcp
Документация: https://cloudfinops.ru/api

## Catalog

- GET /providers
- GET /products — без q список, с q лексический поиск; фильтры сильнее текста
- GET /products/{id}
- GET /products/{id}/alternatives

Product = биллинговый SKU. Price = правило ставки (unit, unitQuantity, vat, tiers). Деньги — decimal strings RUB.

## Calculator

POST /estimates
\`{"resource":{"type":"compute","vcpu":4,"memoryGiB":8,"disk":{"sizeGiB":100,"media":"ssd"}}}\`

Месяц = 720 часов. Строки провайдеров: priced | unavailable | incomplete | error.
Минимум только среди priced: lowestPriceProviderIds.
capacityVerified: false.

## MCP tools

list_providers, search_products, get_product, list_product_alternatives, create_estimate

## Providers

${providers}
`;
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
