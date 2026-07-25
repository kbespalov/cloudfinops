/**
 * Pre-routing for lakehouse / data-platform assistant turns.
 * Appends LAKEHOUSE_SYSTEM_ADDENDUM and gates get_lakehouse_quote.
 */

export type LakehouseIntent = {
  matched: boolean;
  reason: 'lakehouse' | 'data-platform' | 'analytics-stack' | 'none';
};

const LAKEHOUSE_SIGNAL =
  /(?:lake\s*house|лайк\s*хаус|лейкхаус|lakehouse|open\s*lakehouse|data\s*lakehouse|iceberg|айсберг)/i;

const DATA_PLATFORM_SIGNAL =
  /(?:платформ\w*\s+данных|data\s*platform|дата[-\s]?платформ|аналитическ\w*\s+платформ|dwh|data\s*warehouse|витрин\w*\s+данных|data\s*mart)/i;

const ANALYTICS_STACK_SIGNAL =
  /(?:trino|spark(?:\s*sql)?|clickhouse|кликхаус|airflow|etl\s+(?:пайплайн|pipeline)|sql[-\s]?движок|query[-\s]?engine|serverless\s*sql|managed\s*warehouse|olap)/i;

/** True when the user is sizing / comparing a lakehouse or analytics data platform. */
export function matchLakehouseIntent(userText: string): LakehouseIntent {
  const text = userText.trim();
  if (!text) return {matched: false, reason: 'none'};

  // Keep ordinary S3/K8s/VM price questions on the baseline path unless
  // they clearly talk about a data platform / lakehouse stack.
  if (LAKEHOUSE_SIGNAL.test(text)) {
    return {matched: true, reason: 'lakehouse'};
  }
  if (DATA_PLATFORM_SIGNAL.test(text)) {
    return {matched: true, reason: 'data-platform'};
  }
  // ClickHouse / Trino / Spark sizing or managed-vs-DIY — always gate lakehouse tools.
  if (
    /(?:clickhouse|кликхаус|trino|spark)/i.test(text) &&
    /(?:кластер|на\s+вм|managed|self[-\s]?host|стоим|цен|сколько|сравни|подбер|оцен|тб|tib|хранили)/i.test(
      text,
    )
  ) {
    return {matched: true, reason: 'analytics-stack'};
  }
  if (
    ANALYTICS_STACK_SIGNAL.test(text) &&
    /(?:стоим|цен|сколько|сравни|подбер|оцен|калькул|архитектур|что\s+выбрать)/i.test(text)
  ) {
    return {matched: true, reason: 'analytics-stack'};
  }
  return {matched: false, reason: 'none'};
}

/**
 * System addendum for lakehouse / data-platform turns.
 * Distilled from the product persona: explain estimate, assumptions, drivers, alternatives.
 */
export const LAKEHOUSE_SYSTEM_ADDENDUM = `
## Lakehouse / платформа данных (активен этот ход)
Ты помогаешь оценить стоимость аналитической платформы и выбрать модель:
1) serverless SQL / query-based,
2) managed warehouse / managed lakehouse,
3) open lakehouse на Kubernetes + object storage (наш калькулятор /calculator/lakehouse).

Главная цель — не просто цена, а: откуда она, какие допущения, 2–4 драйвера, 1–2 альтернативы.
«Лайкхаус» / «lake house» = lakehouse; не поправляй пользователя резко.

Правила:
- По умолчанию месяц. Не создавай ложную точность: шаблон → «estimate», диапазон, уверенность.
- Не скрывай допущения. Критичных уточнений ≤3; иначе продолжай с типовыми значениями и помечай их.
- Сначала workload archetype (пилот / BI-mart / production lakehouse / real-time / enterprise), потом экономическая модель (query-scanned / runtime / credits / always-on infra / hybrid).
- Разделяй постоянные и переменные расходы. Если K8s-first избыточен для маленькой команды — скажи прямо и предложи managed/serverless.
- Редкие запросы + низкий idle → проверь serverless. Постоянный BI + concurrency/SLA → warehouse/managed. Open formats / anti lock-in → open lakehouse. Near-real-time hot layer → отдельно OLAP поверх озера.
- Сравнивай провайдеров только на сопоставимых моделях; иначе явно скажи, почему сравнение неполное.
- PREVIEW FIRST: в этом же ходе вызови get_lakehouse_quote и/или compose_solution (не один search_catalog и не длинный опрос без чисел).
- Цены DIY open lakehouse (S3 + Managed K8s master + worker ВМ: platform/Airflow+catalog, ETL/Spark, Query/Trino с duty-cycle) бери ТОЛЬКО из get_lakehouse_quote. Не выдумывай тарифы managed Spark/Trino/ClickHouse, если их нет в каталоге — помечай как «не в каталоге / невозможно сравнить полностью / частичное покрытие».
- Не называй результат get_lakehouse_quote «ClickHouse», «ClickHouse-кластером» или managed warehouse. В заголовке используй формулировку из stackLabel/modelNote tool («DIY open lakehouse» / «open lakehouse на K8s»). ClickHouse/OLAP — только как альтернатива в п.8, без выдуманной цены; для CH на ВМ можно compose/get_quote как DIY compute+disk.
- В конце ответа добавь ссылку на калькулятор из answerHint (если tool её вернул).

Формат ответа:
1. Краткий вывод
2. Какой сценарий я распознал
3. Допущения
4. Оценка стоимости (базовый / низ / верх / уверенность)
5. Из чего складывается (постоянные / переменные / потенциально не включено)
6. Что сильнее всего влияет
7. Как сделать дешевле
8. Альтернатива
9. Что уточнить (если нужно)

Тон: деловой русский, коротко, без маркетинговой воды. Сначала вывод, потом логика.
`.trim();
