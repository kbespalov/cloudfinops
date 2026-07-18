# Cloud FinOps

Каталог SKU и новости облачного рынка РФ (+ AWS / Azure / Google Cloud).

Сайт: [cloudfinops.ru](https://cloudfinops.ru) · сообщество: [@cloudfinopsru](https://t.me/cloudfinopsru)

## Что внутри

- **Каталог SKU** — сравнимые тарифы compute / GPU / storage / network / Kubernetes
- **Новости** — подборка новых фич провайдеров (старт: июнь 2026)
- **Цены** — YAML price books в `prices/`, собираются в каталог скриптом

## Локально

```bash
npm ci
npm run dev
```

Откроется [http://localhost:3000](http://localhost:3000) → редирект на `/catalog`.

```bash
npm run data:build        # пересобрать src/data/catalog.generated.json
npm run data:embeddings   # эмбеддинги SKU для hybrid search (нужен CLOUDRU_FM_API_KEY)
npm run eval:retrieval    # lexical vs hybrid recall@10
npm run build             # production build
npm start
```

Эмбеддинги пишутся в `src/data/catalog-embeddings.generated.json` (модель `BAAI/bge-m3` через Cloud.ru FM). Без файла или без ключа `search_prices` остаётся lexical-only.

## Docker (linux/amd64)

```bash
make release         # npm build + docker buildx (linux/amd64)
make run             # docker run -p 3000:3000
```

Образ: `cloudfinops-site:<version>` (версия из `package.json`).

## Структура

```text
prices/          # прайс-листы провайдеров (YAML)
scripts/         # сборка каталога
src/app/         # Next.js App Router
src/components/  # UI (Gravity UI)
src/data/        # новости; catalog.generated.json — артефакт сборки
```

## Лицензия / дисклеймер

Цены и новости собраны из публичных источников провайдеров. Перед принятием решений сверяйте актуальные тарифы у вендора.
