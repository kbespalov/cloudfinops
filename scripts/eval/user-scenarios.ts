/**
 * Soft UX scenario corpus (natural user prompts).
 *
 * These are NOT vitest cases and NOT grounded goldens with frozen prices.
 * Rubrics are soft signals for agent/human review + scenario-run soft-grade.
 *
 * Target size is enforced in buildUserScenarios() (SOFT_SCENARIO_COUNT).
 */
export type SoftDifficulty = 'easy' | 'medium' | 'hard' | 'trap';

export type CatalogAnchor = 'unit' | 'search' | 'quote' | 'none';

export type SoftExpect = {
  /** At least one of these tools should fire. */
  toolsAny?: string[];
  /** Soft warning if these tools fire (usually over-compose). */
  toolsAvoid?: string[];
  /** Case-insensitive substrings / patterns that should appear in the answer. */
  answerIncludes?: string[];
  mustClarify?: boolean;
  mustRefuseOrPartial?: boolean;
  mustNotClaimFullCoverage?: boolean;
  mustExposeAssumptions?: boolean;
  mustShowBreakdown?: boolean;
  /** Extras that must not be pushed unsolicited (e.g. S3/CDN). */
  forbiddenExtras?: string[];
  /** Optional runtime catalog check — never stores frozen cheapest/price. */
  catalogAnchor?: CatalogAnchor;
  /** Params for runtime catalogAnchor (truth computed live). */
  anchorParams?: Record<string, unknown>;
  /** For revise follow-ups: prior scenario id to seed conversation. */
  seedId?: string;
  /** Substrings that should appear in follow-up tool args or answer after revise. */
  reviseSignals?: string[];
};

export type SoftScenario = {
  id: string;
  section: string;
  q: string;
  intent: string[];
  difficulty: SoftDifficulty;
  expect?: SoftExpect;
  /** One-line note: what “good” looks like for agent review. */
  notes?: string;
};

const PRICE = /₽|руб|RUB|\/час|\/мес|в месяц|в час/i;
const CLARIFY = /уточн|уточните|какой|какая|какие|нужен ли|нужно ли|укажите|не хватает|неясно|уточн/i;
const PARTIAL =
  /невозмож|не\s+удастся|нельзя|не\s+могу|не\s+позволя|не\s+покрыв|не\s+может\s+обеспеч|частичн|partial|компромисс|без\s+полного|не\s+уложить|не\s+укладыва|недостаточн|бюджет.*(мал|недостат)|неполное\s+покрыт|покрыти[ея]\s*(неполное|частич)|итоговая\s+сумма\s+будет\s+неполн|coverage\s*(partial|incomplete)|gaps?\b|пробел|противореч|заведомо\s+не|кратно\s+дороже|в\s+каталоге\s+нет|нет\s+в\s+каталоге|не\s+представлен|отсутству|не\s+удалось\s+найти|не\s+найден|недоступн|нет\s+подходящ|тариф\w*\s+нет|нельзя\s+посчитать|не\s+сравнить\s+полностью|нет\s+публичн|не\s+найдете\s+sku|на\s+данный\s+момент\s+отсутств|не\s+синтетическ/i;
const ASSUME = /допущен|assum|исход|если не указан|по умолчанию|предполож|принято\s+по\s+умолчанию/i;
const BREAKDOWN = /компонент|состав|breakdown|из чего|вклад|строк|SKU|итого/i;
/** Positive claim of full coverage — ignore when clearly negated in the same clause. */
const COVERAGE_100 =
  /(?<!не\s)(?<!без\s)(?<!не\s+показать\s)(?:100\s*%\s*покрыт|покрытие\s*100\s*%|полное\s+покрыт|coverage\s*=?\s*1(?:\.0)?\b)/i;

function sc(
  idNum: number,
  section: string,
  q: string,
  intent: string[],
  difficulty: SoftDifficulty,
  expect?: SoftExpect,
  notes?: string,
): SoftScenario {
  return {
    id: `ux-${String(idNum).padStart(3, '0')}`,
    section,
    q,
    intent,
    difficulty,
    expect,
    notes,
  };
}

/** Expected corpus size — bump when appending cases. */
export const SOFT_SCENARIO_COUNT = 227;

/** Build the full soft UX corpus. */
export function buildUserScenarios(): SoftScenario[] {
  const qs: SoftScenario[] = [
    // ── 1. Unit / single-resource price ──────────────────────────────────
    sc(
      1,
      'unit-price',
      'Сколько сейчас стоит один vCPU в российских облаках?',
      ['price', 'unit'],
      'easy',
      {
        toolsAny: ['compare_unit_price', 'search_prices', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'vcpu'},
        answerIncludes: ['vCPU', 'vcpu'],
      },
      'Unit vCPU via compare_unit_price; no full VM compose.',
    ),
    sc(
      2,
      'unit-price',
      'У кого дешевле 32 ГиБ оперативной памяти в месяц?',
      ['price', 'unit', 'compare'],
      'easy',
      {
        toolsAny: ['compare_unit_price', 'search_prices', 'get_quote'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'ram'},
      },
      'RAM unit or scaled quote; name cheapest provider.',
    ),
    sc(
      3,
      'unit-price',
      'Найди минимальную публичную цену на H100.',
      ['price', 'gpu'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog', 'get_quote'],
        catalogAnchor: 'search',
        anchorParams: {query: 'H100', category: 'gpu', gpuModel: 'H100', limit: 30},
      },
    ),
    sc(
      4,
      'unit-price',
      'Сколько стоит одна H200 на 720 часов?',
      ['price', 'gpu'],
      'medium',
      {
        toolsAny: ['search_prices', 'get_quote', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'H200', category: 'gpu', gpuModel: 'H200', limit: 30},
        answerIncludes: ['H200'],
      },
      '720h ≈ month; show hour and/or month total.',
    ),
    sc(
      5,
      'unit-price',
      'Сравни стоимость A100 80 GB у доступных провайдеров.',
      ['price', 'gpu', 'compare'],
      'easy',
      {
        toolsAny: ['search_prices', 'get_quote', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'A100', category: 'gpu', gpuModel: 'A100', limit: 30},
      },
    ),
    sc(
      6,
      'unit-price',
      'Где дешевле 1 ТБ сетевого SSD?',
      ['price', 'storage', 'compare'],
      'easy',
      {
        toolsAny: ['compare_unit_price', 'search_prices', 'search_catalog'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'ssd'},
      },
    ),
    sc(
      7,
      'unit-price',
      'Сколько будет стоить 100 ТБ HDD в месяц?',
      ['price', 'storage'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compare_unit_price'],
        catalogAnchor: 'search',
        anchorParams: {query: 'HDD диск', category: 'compute', limit: 30},
      },
    ),
    sc(
      8,
      'unit-price',
      'У кого самый дешёвый NVMe-диск?',
      ['price', 'storage', 'compare'],
      'easy',
      {
        toolsAny: ['compare_unit_price', 'search_prices', 'search_catalog'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'ssd', diskMedia: 'nvme'},
      },
    ),
    sc(
      9,
      'unit-price',
      'Сравни стоимость одного публичного IPv4-адреса.',
      ['price', 'network', 'compare'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'публичный IP адрес', category: 'network', limit: 30},
      },
    ),
    sc(
      10,
      'unit-price',
      'Сколько стоит исходящий интернет-трафик объёмом 1 ТБ?',
      ['price', 'network'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'egress трафик', category: 'network', limit: 30},
      },
    ),
    sc(
      11,
      'unit-price',
      'Найди тарифы на CDN-трафик объёмом 10 ТБ в месяц.',
      ['price', 'cdn'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'CDN трафик', category: 'cdn', limit: 30},
      },
    ),
    sc(
      12,
      'unit-price',
      'Сколько стоит хранить 50 ТБ в S3 Standard?',
      ['price', 'storage'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'объектное хранилище standard',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          volumeGiB: 51200,
          limit: 30,
        },
      },
    ),
    sc(
      13,
      'unit-price',
      'Где дешевле холодное объектное хранилище?',
      ['price', 'storage', 'compare'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'объектное хранилище cold',
          category: 'storage',
          storageClass: 'cold',
          meterKind: 'capacity',
          limit: 30,
        },
      },
    ),
    sc(
      14,
      'unit-price',
      'Сколько стоит миллион операций PUT в S3?',
      ['price', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'S3 PUT операции', category: 'storage', limit: 30},
      },
    ),
    sc(
      15,
      'unit-price',
      'Сравни цену операций GET у пяти провайдеров.',
      ['price', 'storage', 'compare'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'S3 GET операции', category: 'storage', limit: 30},
      },
    ),
    sc(
      16,
      'unit-price',
      'Где дешевле managed Kubernetes control plane?',
      ['price', 'kubernetes', 'compare'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {query: 'kubernetes мастер', category: 'kubernetes', limit: 30},
      },
    ),
    sc(
      17,
      'unit-price',
      'Сколько стоит балансировщик нагрузки в месяц?',
      ['price', 'network'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'балансировщик нагрузки', category: 'network', limit: 30},
      },
    ),
    sc(
      18,
      'unit-price',
      'Найди минимальную цену на кластер PostgreSQL.',
      ['price', 'database'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compose_solution'],
        mustExposeAssumptions: true,
      },
      'Managed PG may be sparse; state gaps/assumptions.',
    ),
    sc(
      19,
      'unit-price',
      'Сколько стоит аренда выделенного сервера с двумя GPU?',
      ['price', 'gpu'],
      'medium',
      {
        toolsAny: ['search_prices', 'get_quote', 'compose_solution', 'search_catalog'],
        mustClarify: true,
      },
      'GPU model unclear — clarify or show options.',
    ),
    sc(
      20,
      'unit-price',
      'Есть ли в каталоге тарифы на InfiniBand, и сколько они стоят?',
      ['price', 'network'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustRefuseOrPartial: true,
      },
      'May be absent — say so, do not invent.',
    ),

    // ── 2. VM quotes ─────────────────────────────────────────────────────
    sc(
      21,
      'vm',
      'Рассчитай виртуальную машину с 8 vCPU, 32 ГиБ RAM и SSD-диском на 500 ГиБ.',
      ['quote', 'vm'],
      'easy',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 8, ramGiB: 32, diskGiB: 500, period: 'month'},
        mustShowBreakdown: true,
      },
    ),
    sc(
      22,
      'vm',
      'Сколько будет стоить ВМ с 16 ядрами и 64 ГиБ памяти?',
      ['quote', 'vm'],
      'easy',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 16, ramGiB: 64, period: 'month'},
      },
    ),
    sc(
      23,
      'vm',
      'Подбери самую дешёвую ВМ с 4 vCPU, 16 ГиБ RAM и публичным IP.',
      ['quote', 'vm', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 4, ramGiB: 16, publicIp: true, period: 'month'},
      },
    ),
    sc(
      24,
      'vm',
      'Сравни конфигурацию 32 vCPU и 128 ГиБ RAM у всех провайдеров.',
      ['quote', 'vm', 'compare'],
      'easy',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 32, ramGiB: 128, period: 'month'},
      },
    ),
    sc(
      25,
      'vm',
      'Мне нужна ВМ с 2 vCPU, 8 ГиБ RAM и HDD на 2 ТБ. Где дешевле?',
      ['quote', 'vm', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_prices'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 2, ramGiB: 8, diskGiB: 2048, period: 'month'},
      },
    ),
    sc(
      26,
      'vm',
      'Рассчитай три одинаковые ВМ по 8 vCPU и 32 ГиБ RAM каждая.',
      ['quote', 'vm'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        answerIncludes: ['3', 'три', '×3', 'x3'],
      },
    ),
    sc(
      27,
      'vm',
      'Нужна высокочастотная ВМ на 16 ядер, память не важна.',
      ['quote', 'vm'],
      'hard',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_catalog'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
      'HF SKU may be sparse; assume RAM or ask.',
    ),
    sc(
      28,
      'vm',
      'Подбери memory-optimized ВМ с 8 vCPU и минимум 128 ГиБ RAM.',
      ['quote', 'vm'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_catalog'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 8, ramGiB: 128, period: 'month'},
      },
    ),
    sc(
      29,
      'vm',
      'Нужна ВМ с локальным NVMe не меньше 2 ТБ.',
      ['quote', 'vm', 'storage'],
      'hard',
      {
        toolsAny: ['search_catalog', 'search_prices', 'get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      30,
      'vm',
      'Сколько стоит ВМ с одной H100, 16 vCPU и 128 ГиБ RAM?',
      ['quote', 'vm', 'gpu'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {gpuModel: 'H100', gpuCount: 1, vcpu: 16, ramGiB: 128, period: 'month'},
      },
    ),
    sc(
      31,
      'vm',
      'Сравни готовую GPU-ВМ и отдельную цену GPU для той же конфигурации.',
      ['compare', 'gpu', 'quote'],
      'hard',
      {
        toolsAny: ['get_quote', 'search_prices', 'compose_solution', 'search_catalog'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
      'Card-only vs full host parity explanation.',
    ),
    sc(
      32,
      'vm',
      'Рассчитай ВМ на месяц, но загрузка будет только 30% времени.',
      ['quote', 'vm', 'budget'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['30'],
      },
      'Duty-cycle / preemptible caveat; ask shape if missing.',
    ),
    sc(
      33,
      'vm',
      'Посчитай такую же ВМ на год и покажи месячную и годовую стоимость.',
      ['quote', 'vm', 'revise'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['год', 'мес'],
      },
      'Needs prior shape or default assumption; show month+year.',
    ),
    sc(
      34,
      'vm',
      'Найди ближайшую конфигурацию, если точной ВМ 12 vCPU и 48 ГиБ нет.',
      ['quote', 'vm'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      35,
      'vm',
      'Подбери ВМ до 20 тысяч рублей в месяц с максимальным количеством RAM.',
      ['quote', 'vm', 'budget'],
      'medium',
      {
        toolsAny: ['fit_budget', 'get_quote', 'compose_solution', 'compare_unit_price'],
        answerIncludes: ['20', 'RAM', 'ГиБ', 'GiB', 'памят'],
      },
    ),

    // ── 3. Kubernetes ────────────────────────────────────────────────────
    sc(
      36,
      'kubernetes',
      'Собери минимальный managed Kubernetes-кластер с тремя worker-нодами.',
      ['compose', 'kubernetes'],
      'easy',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        forbiddenExtras: ['CDN'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      37,
      'kubernetes',
      'Рассчитай однозональный Kubernetes: три worker по 8 vCPU и 32 ГиБ RAM.',
      ['compose', 'kubernetes'],
      'easy',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution', 'get_quote'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      38,
      'kubernetes',
      'Собери отказоустойчивый Kubernetes в трёх зонах с шестью worker-нодами.',
      ['compose', 'kubernetes'],
      'medium',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['зон', 'HA', 'отказоустойч', '3'],
      },
    ),
    sc(
      39,
      'kubernetes',
      'Сколько будет стоить managed Kubernetes с одним master и десятью workers?',
      ['compose', 'kubernetes'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'price_solution'],
        mustExposeAssumptions: true,
      },
      'Worker shape missing — ask or assume and label.',
    ),
    sc(
      40,
      'kubernetes',
      'Мне нужен Kubernetes до 100 тысяч рублей в месяц. Подбери конфигурацию.',
      ['compose', 'kubernetes', 'budget'],
      'medium',
      {
        toolsAny: ['compose_solution', 'fit_budget', 'price_solution'],
        answerIncludes: ['100'],
      },
    ),
    sc(
      41,
      'kubernetes',
      'Собери Kubernetes с worker-нодами по 16 vCPU, 64 ГиБ RAM и диском 500 ГиБ.',
      ['compose', 'kubernetes'],
      'easy',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      42,
      'kubernetes',
      'Добавь к Kubernetes один публичный IP, балансировщик и 2 ТБ исходящего трафика.',
      ['compose', 'kubernetes', 'network', 'revise'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'price_solution'],
        answerIncludes: ['IP', 'балансир', 'трафик', 'egress'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      43,
      'kubernetes',
      'Собери Kubernetes для веб-приложения с S3, CDN и PostgreSQL.',
      ['compose', 'kubernetes', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['S3', 'CDN', 'Postgre', 'Postgres', 'Postgres'],
      },
    ),
    sc(
      44,
      'kubernetes',
      'Сравни managed Kubernetes и самостоятельный Kubernetes на обычных ВМ.',
      ['compare', 'kubernetes'],
      'hard',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices', 'price_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      45,
      'kubernetes',
      'Где дешевле control plane, если worker-ноды одинаковые?',
      ['compare', 'kubernetes', 'price'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'kubernetes мастер', category: 'kubernetes', limit: 30},
      },
    ),
    sc(
      46,
      'kubernetes',
      'Рассчитай Kubernetes, где системный диск каждого worker составляет 100 ГиБ, а отдельный data-диск — 2 ТБ.',
      ['compose', 'kubernetes', 'storage'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['100', '2'],
      },
    ),
    sc(
      47,
      'kubernetes',
      'Нужен Kubernetes с GPU-worker на H100 и тремя обычными CPU-worker.',
      ['compose', 'kubernetes', 'gpu'],
      'hard',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution', 'get_quote'],
        mustShowBreakdown: true,
        answerIncludes: ['H100'],
      },
    ),
    sc(
      48,
      'kubernetes',
      'Подбери самый дешёвый кластер, который переживёт отказ одной worker-ноды.',
      ['compose', 'kubernetes'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['2', '3', 'worker', 'нод'],
      },
      'N+1 workers minimum; state assumption.',
    ),
    sc(
      49,
      'kubernetes',
      'Рассчитай кластер без публичных IP, но с внешним балансировщиком.',
      ['compose', 'kubernetes', 'network'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'price_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      50,
      'kubernetes',
      'Собери Kubernetes, но не добавляй S3 и CDN, если я их явно не просил.',
      ['compose', 'kubernetes'],
      'medium',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        forbiddenExtras: ['S3', 'CDN', 'объектн'],
        mustShowBreakdown: true,
      },
      'No unsolicited S3/CDN in BOM.',
    ),

    // ── 4. Storage ───────────────────────────────────────────────────────
    sc(
      51,
      'storage',
      'Сравни стоимость 100 ТБ S3 и 100 ТБ HDD-дисков.',
      ['compare', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      52,
      'storage',
      'Что дешевле для архивов: S3 Cold или обычный HDD?',
      ['compare', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      53,
      'storage',
      'Рассчитай 50 ТБ S3, 10 миллионов GET и 1 миллион PUT в месяц.',
      ['price', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      54,
      'storage',
      'Посчитай S3 на 20 ТБ с исходящим трафиком 5 ТБ.',
      ['price', 'storage', 'network'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      55,
      'storage',
      'Мне нужно 200 ТБ хранения, но читать данные будем редко. Подбери вариант.',
      ['compose', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution', 'search_catalog'],
        mustExposeAssumptions: true,
        answerIncludes: ['Cold', 'cold', 'Ice', 'архив'],
      },
    ),
    sc(
      56,
      'storage',
      'Где дешевле хранить резервные копии сроком один год?',
      ['compare', 'storage', 'budget'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      57,
      'storage',
      'Рассчитай блочное хранилище на 10 ТБ с 20 000 IOPS.',
      ['price', 'storage'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
      },
      'IOPS SKUs may be sparse — state gaps.',
    ),
    sc(
      58,
      'storage',
      'Сравни SSD и NVMe для базы данных объёмом 5 ТБ.',
      ['compare', 'storage'],
      'medium',
      {
        toolsAny: ['compare_unit_price', 'search_prices', 'search_catalog'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      59,
      'storage',
      'Подбери самое дешёвое хранилище, но задержка должна быть минимальной.',
      ['compare', 'storage', 'ambiguous'],
      'trap',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
      'Cheap vs low-latency conflict — trade-off, not one winner.',
    ),
    sc(
      60,
      'storage',
      'Посчитай трёхкратную репликацию 100 ТБ между тремя зонами.',
      ['price', 'storage'],
      'hard',
      {
        toolsAny: ['search_prices', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['3', 'зон', 'реплик'],
      },
    ),

    // ── 5. Network / CDN ─────────────────────────────────────────────────
    sc(
      61,
      'network',
      'Сколько будет стоить 20 ТБ исходящего трафика в интернет?',
      ['price', 'network'],
      'easy',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        catalogAnchor: 'search',
        anchorParams: {query: 'egress трафик', category: 'network', limit: 30},
      },
    ),
    sc(
      62,
      'network',
      'Сравни стоимость трафика напрямую с ВМ и через CDN.',
      ['compare', 'network', 'cdn'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      63,
      'network',
      'Рассчитай CDN для 100 миллионов запросов и 50 ТБ трафика.',
      ['price', 'cdn'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      64,
      'network',
      'Сколько стоит передать 100 ТБ между двумя дата-центрами?',
      ['price', 'network'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      65,
      'network',
      'Подбери провайдера с самым дешёвым межзональным трафиком.',
      ['compare', 'network'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      66,
      'network',
      'Рассчитай один публичный IP для каждой из двадцати ВМ.',
      ['price', 'network'],
      'easy',
      {
        toolsAny: ['search_prices', 'compose_solution', 'get_quote'],
        answerIncludes: ['20'],
      },
    ),
    sc(
      67,
      'network',
      'Посчитай два балансировщика и 10 ТБ обработанного трафика.',
      ['price', 'network'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      68,
      'network',
      'Что дешевле: один большой балансировщик или несколько небольших?',
      ['compare', 'network', 'ambiguous'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      69,
      'network',
      'Рассчитай стоимость NAT Gateway для 5 ТБ исходящего трафика.',
      ['price', 'network'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        mustRefuseOrPartial: true,
      },
      'NAT SKU may be missing — say so.',
    ),
    sc(
      70,
      'network',
      'Сравни стоимость CDN у провайдеров, но учитывай бесплатные лимиты.',
      ['compare', 'cdn'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        answerIncludes: ['бесплат', 'лимит', 'free', 'включ'],
        mustExposeAssumptions: true,
      },
    ),

    // ── 6. Inference / GPU infra ─────────────────────────────────────────
    sc(
      71,
      'inference',
      'Подбери инфраструктуру для запуска GLM-5.',
      ['compose', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: [
          'recommend_inference_infra',
          'compose_solution',
          'search_prices',
          'get_quote',
        ],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      72,
      'inference',
      'Сколько GPU нужно для инференса модели размером 400 миллиардов параметров?',
      ['compose', 'gpu', 'inference'],
      'hard',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'search_catalog'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      73,
      'inference',
      'Подбери конфигурацию для Qwen3-Coder с контекстом 128 тысяч токенов.',
      ['compose', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      74,
      'inference',
      'Рассчитай инфраструктуру для 32 одновременных пользователей большой языковой модели.',
      ['compose', 'gpu', 'inference'],
      'hard',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      75,
      'inference',
      'Что дешевле для инференса: восемь H100 или четыре H200?',
      ['compare', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: ['get_quote', 'search_prices', 'compose_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['H100', 'H200'],
      },
    ),
    sc(
      76,
      'inference',
      'Подбери минимальную конфигурацию для модели, которой требуется 300 ГиБ VRAM.',
      ['compose', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'get_quote'],
        mustExposeAssumptions: true,
        answerIncludes: ['300', 'VRAM', 'H100', 'H200', 'B200', 'GPU'],
      },
    ),
    sc(
      77,
      'inference',
      'Рассчитай inference-кластер на 16 B200.',
      ['compose', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: [
          'get_quote',
          'compose_solution',
          'search_prices',
          'recommend_inference_infra',
          'search_catalog',
        ],
        answerIncludes: ['B200', '16'],
        mustRefuseOrPartial: true,
      },
    ),
    sc(
      78,
      'inference',
      'Мне нужно генерировать 10 миллионов токенов в день. Какая инфраструктура нужна?',
      ['compose', 'gpu', 'inference', 'ambiguous'],
      'hard',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'search_prices'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      79,
      'inference',
      'Сравни self-hosted inference и использование внешнего API.',
      ['compare', 'inference'],
      'hard',
      {
        toolsAny: ['search_prices', 'recommend_inference_infra', 'compose_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      80,
      'inference',
      'Подбери инфраструктуру для модели, но я не знаю её точный размер.',
      ['compose', 'inference', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'search_catalog'],
      },
      'Must ask size/context before firm BOM.',
    ),
    sc(
      81,
      'inference',
      'Рассчитай три варианта инференса: минимальный, сбалансированный и производительный.',
      ['compose', 'inference'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'get_quote'],
        mustExposeAssumptions: true,
        answerIncludes: ['минимал', 'сбаланс', 'производител'],
      },
    ),
    sc(
      82,
      'inference',
      'Можно ли запустить модель на одной машине с восемью GPU, и сколько это будет стоить?',
      ['compose', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'recommend_inference_infra'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      83,
      'inference',
      'Сравни GPU-кластер с NVLink и набор независимых GPU-нод.',
      ['compare', 'gpu', 'inference'],
      'hard',
      {
        toolsAny: [
          'search_prices',
          'compose_solution',
          'get_quote',
          'search_catalog',
          'recommend_inference_infra',
        ],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      84,
      'inference',
      'Подбери инфраструктуру для batch inference, latency не важна.',
      ['compose', 'inference'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['batch', 'пакет', 'latency', 'задержк'],
      },
    ),
    sc(
      85,
      'inference',
      'Подбери инфраструктуру для online inference с минимальной задержкой.',
      ['compose', 'inference'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      86,
      'inference',
      'Нужен инференс с контекстом 1 миллион токенов. Что потребуется?',
      ['compose', 'inference'],
      'hard',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      87,
      'inference',
      'Рассчитай стоимость резервной GPU-ноды для отказоустойчивости.',
      ['quote', 'gpu', 'inference'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_prices'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      88,
      'inference',
      'Сколько будет стоить инференс, если GPU загружены только на 40%?',
      ['quote', 'gpu', 'inference', 'budget'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'recommend_inference_infra'],
        mustExposeAssumptions: true,
        answerIncludes: ['40'],
      },
    ),
    sc(
      89,
      'inference',
      'Где дешевле запускать H100 круглосуточно в течение года?',
      ['compare', 'gpu'],
      'easy',
      {
        toolsAny: ['get_quote', 'search_prices', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {gpuModel: 'H100', gpuCount: 1, period: 'year'},
      },
    ),
    sc(
      90,
      'inference',
      'Подбери GPU-инфраструктуру до 5 миллионов рублей в месяц.',
      ['compose', 'gpu', 'budget'],
      'medium',
      {
        toolsAny: ['fit_budget', 'compose_solution', 'get_quote', 'recommend_inference_infra'],
        answerIncludes: ['5', 'млн', 'миллион', '000'],
      },
    ),

    // ── 7. Lakehouse / DBs ───────────────────────────────────────────────
    sc(
      91,
      'lakehouse',
      'Собери минимальный lakehouse на S3, Spark и Trino.',
      ['compose', 'lakehouse'],
      'medium',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution', 'search_prices'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      92,
      'lakehouse',
      'Рассчитай lakehouse для хранения 100 ТБ данных.',
      ['compose', 'lakehouse'],
      'medium',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution', 'search_prices'],
        mustExposeAssumptions: true,
        answerIncludes: ['100'],
      },
    ),
    sc(
      93,
      'lakehouse',
      'Подбери инфраструктуру для ClickHouse-кластера объёмом 50 ТБ.',
      ['compose', 'database'],
      'hard',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices', 'get_lakehouse_quote'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      94,
      'lakehouse',
      'Сравни ClickHouse на ВМ и managed ClickHouse.',
      ['compare', 'database'],
      'hard',
      {
        toolsAny: ['compose_solution', 'search_prices', 'get_quote', 'get_lakehouse_quote', 'search_catalog'],
        mustExposeAssumptions: true,
        mustRefuseOrPartial: true,
      },
      'Managed CH may be absent — compare honestly.',
    ),
    sc(
      95,
      'lakehouse',
      'Собери PostgreSQL для нагрузки 20 тысяч транзакций в секунду.',
      ['compose', 'database'],
      'hard',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      96,
      'lakehouse',
      'Подбери кластер PostgreSQL с одной primary и двумя replicas.',
      ['compose', 'database'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'get_quote'],
        mustShowBreakdown: true,
        answerIncludes: ['replica', 'реплик', 'primary', 'primary', 'мастер'],
      },
    ),
    sc(
      97,
      'lakehouse',
      'Рассчитай аналитическую платформу с S3, Trino, Spark и Kubernetes.',
      ['compose', 'lakehouse'],
      'hard',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution', 'price_solution'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      98,
      'lakehouse',
      'Подбери инфраструктуру для обработки 10 ТБ новых данных в день.',
      ['compose', 'lakehouse'],
      'hard',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      99,
      'lakehouse',
      'Что дешевле: хранить данные в ClickHouse или в S3 с Trino?',
      ['compare', 'lakehouse', 'storage'],
      'hard',
      {
        toolsAny: ['search_prices', 'get_lakehouse_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      100,
      'lakehouse',
      'Рассчитай lakehouse с 200 ТБ хранения и 500 vCPU для периодических задач.',
      ['compose', 'lakehouse'],
      'hard',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      101,
      'lakehouse',
      'Собери инфраструктуру для Kafka на трёх узлах.',
      ['compose', 'database'],
      'medium',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices'],
        mustExposeAssumptions: true,
        answerIncludes: ['3', 'Kafka', 'кафк'],
      },
    ),
    sc(
      102,
      'lakehouse',
      'Подбери конфигурацию для Elasticsearch на 20 ТБ.',
      ['compose', 'database'],
      'medium',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      103,
      'lakehouse',
      'Рассчитай Redis-кластер с 1 ТБ RAM.',
      ['compose', 'database'],
      'medium',
      {
        toolsAny: ['compose_solution', 'get_quote', 'search_prices'],
        mustExposeAssumptions: true,
        answerIncludes: ['1', 'ТБ', 'TB', 'RAM', 'памят'],
      },
    ),
    sc(
      104,
      'lakehouse',
      'Сравни managed database и самостоятельную базу на ВМ.',
      ['compare', 'database'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution', 'get_quote'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      105,
      'lakehouse',
      'Подбери инфраструктуру для data platform до 2 миллионов рублей в месяц.',
      ['compose', 'lakehouse', 'budget'],
      'hard',
      {
        toolsAny: ['get_lakehouse_quote', 'compose_solution', 'fit_budget'],
        mustExposeAssumptions: true,
      },
    ),

    // ── 8. Web / app architectures ───────────────────────────────────────
    sc(
      106,
      'web',
      'Собери инфраструктуру для небольшого интернет-магазина.',
      ['compose', 'web'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution', 'get_quote'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      107,
      'web',
      'Подбери облако для сайта с миллионом посетителей в месяц.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'search_prices'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      108,
      'web',
      'Рассчитай веб-приложение: Kubernetes, PostgreSQL, S3, CDN и балансировщик.',
      ['compose', 'web'],
      'medium',
      {
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['Kubernetes', 'S3', 'CDN', 'Postgre', 'балансир'],
      },
    ),
    sc(
      109,
      'web',
      'Собери минимальную инфраструктуру для стартапа до 50 тысяч рублей в месяц.',
      ['compose', 'web', 'budget'],
      'medium',
      {
        toolsAny: ['compose_solution', 'fit_budget', 'get_quote'],
        mustExposeAssumptions: true,
        answerIncludes: ['50'],
      },
    ),
    sc(
      110,
      'web',
      'Подбери архитектуру для мобильного backend с высокой доступностью.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      111,
      'web',
      'Рассчитай инфраструктуру для видеосервиса с 100 ТБ CDN-трафика.',
      ['compose', 'web', 'cdn'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'price_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['CDN', '100'],
      },
    ),
    sc(
      112,
      'web',
      'Собери backend для хранения фотографий: API, compute, S3 и CDN.',
      ['compose', 'web'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustShowBreakdown: true,
        answerIncludes: ['S3', 'CDN'],
      },
    ),
    sc(
      113,
      'web',
      'Подбери инфраструктуру для SaaS-сервиса на 10 тысяч клиентов.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      114,
      'web',
      'Рассчитай три среды: production, staging и development.',
      ['compose', 'web'],
      'medium',
      {
        toolsAny: ['compose_solution', 'get_quote', 'price_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['prod', 'staging', 'dev', 'production', 'development'],
      },
    ),
    sc(
      115,
      'web',
      'Собери отказоустойчивое приложение в двух регионах.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),
    sc(
      116,
      'web',
      'Подбери инфраструктуру для API с нагрузкой 50 тысяч запросов в секунду.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'get_quote'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      117,
      'web',
      'Рассчитай приложение с autoscaling от 3 до 30 worker-нод.',
      ['compose', 'web', 'kubernetes'],
      'hard',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['3', '30'],
      },
    ),
    sc(
      118,
      'web',
      'Собери дешёвую архитектуру для ночных batch-задач.',
      ['compose', 'web', 'budget'],
      'medium',
      {
        toolsAny: ['compose_solution', 'get_quote', 'fit_budget'],
        mustExposeAssumptions: true,
        answerIncludes: ['batch', 'ноч', 'preempt', 'прерыва', 'spot'],
      },
    ),
    sc(
      119,
      'web',
      'Подбери serverless-вариант и сравни его с обычными ВМ.',
      ['compare', 'web'],
      'hard',
      {
        toolsAny: ['search_prices', 'get_quote', 'compose_solution', 'search_catalog'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
      'Serverless may be out of catalog — say so or compare with assumptions.',
    ),
    sc(
      120,
      'web',
      'Рассчитай инфраструктуру для маркетплейса с поиском, базой и объектным хранилищем.',
      ['compose', 'web'],
      'hard',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
    ),

    // ── 9. Budget-driven ─────────────────────────────────────────────────
    sc(
      121,
      'budget',
      'Что можно собрать за 100 тысяч рублей в месяц?',
      ['budget', 'compose'],
      'medium',
      {
        toolsAny: ['fit_budget', 'compose_solution', 'compare_unit_price'],
        mustExposeAssumptions: true,
        answerIncludes: ['100'],
      },
    ),
    sc(
      122,
      'budget',
      'Подбери максимальную ВМ до 30 тысяч рублей.',
      ['budget', 'vm'],
      'easy',
      {
        toolsAny: ['fit_budget', 'get_quote', 'compose_solution'],
        answerIncludes: ['30'],
      },
    ),
    sc(
      123,
      'budget',
      'Какой Kubernetes можно собрать за 500 тысяч рублей?',
      ['budget', 'kubernetes'],
      'medium',
      {
        toolsAny: ['fit_budget', 'compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      124,
      'budget',
      'Подбери GPU-инфраструктуру до 1 миллиона рублей в месяц.',
      ['budget', 'gpu'],
      'medium',
      {
        toolsAny: ['fit_budget', 'get_quote', 'compose_solution'],
        answerIncludes: ['1', 'млн', 'миллион'],
      },
    ),
    sc(
      125,
      'budget',
      'Мне нужно 100 ТБ хранения до 300 тысяч рублей. Какие есть варианты?',
      ['budget', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'fit_budget', 'compose_solution'],
        mustShowBreakdown: true,
      },
    ),
    sc(
      126,
      'budget',
      'Подбери максимально производительный PostgreSQL до 200 тысяч рублей.',
      ['budget', 'database'],
      'hard',
      {
        toolsAny: ['compose_solution', 'fit_budget', 'get_quote'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      127,
      'budget',
      'Как распределить бюджет 2 миллиона между compute, storage и traffic?',
      ['budget', 'compose'],
      'hard',
      {
        toolsAny: ['fit_budget', 'compose_solution', 'search_prices'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      128,
      'budget',
      'Найди самый дешёвый вариант, который покрывает все требования.',
      ['budget', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
      },
      'No requirements given — must ask.',
    ),
    sc(
      129,
      'budget',
      'Покажи, чем придётся пожертвовать, чтобы уложиться в 150 тысяч рублей.',
      ['budget', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      130,
      'budget',
      'Насколько нужно увеличить бюджет, чтобы добавить отказоустойчивость?',
      ['budget', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),

    // ── 10. Optimize existing ────────────────────────────────────────────
    sc(
      131,
      'optimize',
      'Сейчас я плачу 500 тысяч рублей за 20 ВМ. Можно ли дешевле?',
      ['optimize', 'vm', 'ambiguous'],
      'hard',
      {
        mustClarify: true,
        toolsAny: ['get_quote', 'compose_solution', 'compare_unit_price'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      132,
      'optimize',
      'У меня десять ВМ по 8 vCPU и 32 ГиБ RAM. Сравни альтернативы.',
      ['optimize', 'vm', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 8, ramGiB: 32, period: 'month'},
        answerIncludes: ['10'],
      },
    ),
    sc(
      133,
      'optimize',
      'Можно ли заменить часть ВМ одной большой машиной?',
      ['optimize', 'vm', 'ambiguous'],
      'medium',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
        toolsAny: ['get_quote', 'compose_solution'],
      },
    ),
    sc(
      134,
      'optimize',
      'Что будет дешевле: уменьшить CPU или перейти на другой тип диска?',
      ['optimize', 'compare', 'ambiguous'],
      'medium',
      {
        mustClarify: true,
        toolsAny: ['compare_unit_price', 'search_prices', 'get_quote'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      135,
      'optimize',
      'У меня 100 ТБ S3 и 20 ТБ трафика. Где можно сэкономить?',
      ['optimize', 'storage', 'network'],
      'medium',
      {
        toolsAny: ['search_prices', 'compose_solution'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      136,
      'optimize',
      'Сравни текущую конфигурацию с самым дешёвым провайдером.',
      ['optimize', 'compare', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
      },
    ),
    sc(
      137,
      'optimize',
      'Покажи, какие компоненты дают основной вклад в стоимость.',
      ['optimize', 'explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      138,
      'optimize',
      'Сколько я сэкономлю при снижении исходящего трафика на 30%?',
      ['optimize', 'network', 'ambiguous'],
      'medium',
      {
        mustClarify: true,
        toolsAny: ['search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      139,
      'optimize',
      'Есть ли смысл заменить H100 на H200?',
      ['optimize', 'gpu', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'search_prices', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['H100', 'H200'],
      },
    ),
    sc(
      140,
      'optimize',
      'Стоит ли переносить PostgreSQL с managed-сервиса на обычные ВМ?',
      ['optimize', 'database', 'compare'],
      'hard',
      {
        toolsAny: ['search_prices', 'compose_solution', 'get_quote'],
        mustExposeAssumptions: true,
        mustClarify: true,
      },
    ),

    // ── 11. Provider compare ─────────────────────────────────────────────
    sc(
      141,
      'providers',
      'Сравни Yandex Cloud, VK Cloud и Selectel для ВМ 16/64.',
      ['compare', 'vm'],
      'easy',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 16, ramGiB: 64, period: 'month'},
        answerIncludes: ['Yandex', 'VK', 'Selectel', 'Яндекс', 'Селектел'],
      },
    ),
    sc(
      142,
      'providers',
      'Кто дешевле для managed Kubernetes с тремя worker-нодами?',
      ['compare', 'kubernetes'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution', 'search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      143,
      'providers',
      'Сравни T1 Cloud и Cloud.ru для хранения 100 ТБ.',
      ['compare', 'storage'],
      'medium',
      {
        toolsAny: ['search_prices', 'search_catalog'],
        answerIncludes: ['T1', 'Cloud.ru', 'Cloud.ru', 'Т1'],
      },
    ),
    sc(
      144,
      'providers',
      'У какого провайдера дешевле GPU, если учитывать всю ВМ?',
      ['compare', 'gpu'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      145,
      'providers',
      'Сравни решения не только по цене, но и по полноте расчёта.',
      ['compare', 'explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      146,
      'providers',
      'Покажи только варианты с актуальными ценами не старше 30 дней.',
      ['compare', 'explain'],
      'hard',
      {
        toolsAny: ['search_prices', 'search_catalog', 'get_quote', 'compose_solution'],
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['актуаль', 'давн', 'дат', 'стар', 'свеж', 'provenance', 'уточн', 'какую'],
      },
    ),
    sc(
      147,
      'providers',
      'Исключи провайдеров, у которых используются синтетические тарифы.',
      ['compare', 'explain'],
      'hard',
      {
        toolsAny: ['search_prices', 'compose_solution', 'get_quote', 'search_catalog'],
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['синтет', 'synthetic', 'оценк', 'уточн', 'какую'],
      },
    ),
    sc(
      148,
      'providers',
      'Сравни решения только в московском регионе.',
      ['compare', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['search_prices', 'get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      149,
      'providers',
      'Покажи самый дешёвый и самый сбалансированный варианты.',
      ['compare', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
      },
    ),
    sc(
      150,
      'providers',
      'Почему рекомендованный вариант лучше второго по цене?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),

    // ── 12. Conversational / incomplete ──────────────────────────────────
    sc(
      151,
      'conversational',
      'Мне нужна ашка на месяц, где дешевле?',
      ['price', 'gpu', 'conversational'],
      'medium',
      {
        toolsAny: ['search_prices', 'get_quote'],
        catalogAnchor: 'search',
        anchorParams: {query: 'A100', category: 'gpu', gpuModel: 'A100', limit: 30},
        answerIncludes: ['A100', 'A30', 'A2'],
      },
      '«Ашка» → A100 (or clarify A-series).',
    ),
    sc(
      152,
      'conversational',
      'Посчитай кубер с тремя воркерами и быстрыми дисками.',
      ['compose', 'kubernetes', 'conversational'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      153,
      'conversational',
      'Нужна большая машина, памяти где-то 200 гигов.',
      ['quote', 'vm', 'conversational'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['200', 'RAM', 'памят', 'ГиБ', 'GiB'],
      },
    ),
    sc(
      154,
      'conversational',
      'Собери что-нибудь для GLM, чтобы нормально летало.',
      ['compose', 'inference', 'conversational'],
      'medium',
      {
        toolsAny: ['recommend_inference_infra', 'compose_solution', 'search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      155,
      'conversational',
      'Посчитай 100 терабайт диска, лучше дешёвого.',
      ['price', 'storage', 'conversational'],
      'easy',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      156,
      'conversational',
      'Мне нужен мастер кубера и несколько нод, не очень дорогих.',
      ['compose', 'kubernetes', 'conversational'],
      'medium',
      {
        toolsAny: ['compose_solution', 'price_solution', 'fit_budget'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      157,
      'conversational',
      'Добавь интернет, айпишник и CDN, трафика будет много.',
      ['compose', 'network', 'cdn', 'conversational', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['search_prices', 'compose_solution'],
      },
    ),
    sc(
      158,
      'conversational',
      'Хочу запустить большую модель на восьми карточках.',
      ['compose', 'gpu', 'conversational'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'recommend_inference_infra'],
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['8', 'восьм'],
      },
    ),
    sc(
      159,
      'conversational',
      'Найди ВМ на 16 ядер, память 32, диск DD сто терабайт.',
      ['quote', 'vm', 'conversational'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution', 'search_prices'],
        mustExposeAssumptions: true,
        answerIncludes: ['HDD', 'DD', '100', '16'],
      },
      'DD → HDD; 100 TB disk.',
    ),
    sc(
      160,
      'conversational',
      'Мне нужен дешёвый облачный кластер для базы.',
      ['compose', 'database', 'conversational', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['compose_solution', 'search_prices', 'get_quote'],
      },
    ),

    // ── 13. Ambiguous ────────────────────────────────────────────────────
    sc(
      161,
      'ambiguous',
      'Подбери H100 на 32 ГиБ памяти.',
      ['ambiguous', 'gpu'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['search_prices', 'get_quote'],
      },
      'H100 VRAM ≠ host RAM — disambiguate.',
    ),
    sc(
      162,
      'ambiguous',
      'Рассчитай 16 ядер на весь кластер из трёх нод.',
      ['ambiguous', 'kubernetes'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['compose_solution', 'get_quote'],
      },
    ),
    sc(
      163,
      'ambiguous',
      'Мне нужен диск 100 ТБ на каждую ВМ или, возможно, на весь кластер.',
      ['ambiguous', 'storage'],
      'trap',
      {
        mustClarify: true,
      },
    ),
    sc(
      164,
      'ambiguous',
      'Посчитай CDN на 10 ТБ, но исходящего трафика будет 1 ТБ.',
      ['ambiguous', 'cdn', 'network'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['search_prices'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      165,
      'ambiguous',
      'Собери Kubernetes с одной нодой, но чтобы он был отказоустойчивым.',
      ['ambiguous', 'kubernetes', 'impossible'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustClarify: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['compose_solution'],
      },
    ),
    sc(
      166,
      'ambiguous',
      'Нужен дешёвый вариант, но только самый производительный.',
      ['ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      167,
      'ambiguous',
      'Выбери только Cloud.ru, но сравни со всеми провайдерами.',
      ['ambiguous', 'compare'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['get_quote', 'compose_solution', 'search_prices'],
      },
    ),
    sc(
      168,
      'ambiguous',
      'Нужна конфигурация до 100 тысяч, хотя один только диск стоит больше.',
      ['ambiguous', 'budget', 'impossible'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustClarify: true,
        mustNotClaimFullCoverage: true,
      },
    ),
    sc(
      169,
      'ambiguous',
      'Подбери managed Kubernetes у провайдера, у которого его нет в каталоге.',
      ['ambiguous', 'kubernetes', 'impossible'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['search_prices', 'compose_solution', 'search_catalog'],
      },
    ),
    sc(
      170,
      'ambiguous',
      'Рассчитай инфраструктуру для модели GLM Night.',
      ['ambiguous', 'inference'],
      'trap',
      {
        mustClarify: true,
        toolsAny: ['recommend_inference_infra', 'search_prices', 'search_catalog'],
      },
      'Unknown model name — clarify, do not invent SKU.',
    ),

    // ── 14. Conflicts / impossible ───────────────────────────────────────
    sc(
      171,
      'conflicts',
      'Собери три GPU-ноды с H100 до 100 тысяч рублей в месяц.',
      ['impossible', 'gpu', 'budget'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['get_quote', 'compose_solution', 'fit_budget', 'search_prices'],
      },
      'Budget vs 3×H100 — refuse full coverage.',
    ),
    sc(
      172,
      'conflicts',
      'Нужны 100 ТБ NVMe и бюджет 50 тысяч рублей.',
      ['impossible', 'storage', 'budget'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['search_prices', 'compare_unit_price', 'fit_budget'],
      },
    ),
    sc(
      173,
      'conflicts',
      'Подбери ВМ с 128 vCPU и 1 ТБ RAM не дороже 20 тысяч.',
      ['impossible', 'vm', 'budget'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['get_quote', 'fit_budget', 'compose_solution'],
      },
    ),
    sc(
      174,
      'conflicts',
      'Нужен отказоустойчивый кластер в трёх зонах, но только одна нода.',
      ['impossible', 'kubernetes'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustClarify: true,
        mustNotClaimFullCoverage: true,
      },
    ),
    sc(
      175,
      'conflicts',
      'Собери Kubernetes без worker-нод.',
      ['impossible', 'kubernetes'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustClarify: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['compose_solution', 'search_prices'],
      },
    ),
    sc(
      176,
      'conflicts',
      'Нужен публичный сервис, но публичные IP и балансировщики запрещены.',
      ['impossible', 'network'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustClarify: true,
        mustNotClaimFullCoverage: true,
      },
    ),
    sc(
      177,
      'conflicts',
      'Выбери только тарифы без синтетических цен, даже если таких вариантов нет.',
      ['impossible', 'explain'],
      'trap',
      {
        mustRefuseOrPartial: true,
        toolsAny: ['search_prices', 'compose_solution', 'get_quote', 'search_catalog'],
        answerIncludes: ['синтет', 'нет', 'отсутств', 'не найден', 'прям', 'не синтет'],
      },
    ),
    sc(
      178,
      'conflicts',
      'Подбери H200 у провайдера, у которого доступна только H100.',
      ['impossible', 'gpu'],
      'trap',
      {
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
        toolsAny: ['search_prices', 'get_quote', 'search_catalog'],
      },
    ),
    sc(
      179,
      'conflicts',
      'Собери решение строго до бюджета, не убирая ни одного требования.',
      ['impossible', 'budget', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustRefuseOrPartial: true,
        mustNotClaimFullCoverage: true,
      },
    ),
    sc(
      180,
      'conflicts',
      'Покажи 100% покрытие, даже если часть компонентов отсутствует.',
      ['impossible', 'explain'],
      'trap',
      {
        mustNotClaimFullCoverage: true,
        mustRefuseOrPartial: true,
      },
      'Must NOT claim 100% coverage when gaps exist.',
    ),

    // ── 15. Explainability ───────────────────────────────────────────────
    sc(
      181,
      'explainability',
      'Покажи, из каких компонентов сложилась итоговая цена.',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustShowBreakdown: true,
      },
      'No prior solution — ask or refuse silent invent.',
    ),
    sc(
      182,
      'explainability',
      'Какие части решения ты не смог посчитать?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      183,
      'explainability',
      'Какие допущения ты сделал без моего явного указания?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      184,
      'explainability',
      'Почему покрытие требований составляет только 80%?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['покрыт', 'coverage', '80'],
      },
    ),
    sc(
      185,
      'explainability',
      'Какие компоненты используют синтетические тарифы?',
      ['explain'],
      'medium',
      {
        toolsAny: ['compose_solution', 'search_prices', 'get_quote', 'price_solution'],
        mustClarify: true,
        answerIncludes: ['синтет', 'synthetic', 'оценк', 'нет'],
      },
    ),
    sc(
      186,
      'explainability',
      'Насколько актуальны цены в этом сравнении?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
        answerIncludes: ['актуаль', 'дат', 'обнов', 'каталог', 'provenance'],
      },
    ),
    sc(
      187,
      'explainability',
      'Есть ли в решении компоненты с неизвестной стоимостью?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),
    sc(
      188,
      'explainability',
      'Не посчитал ли ты диск дважды?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      189,
      'explainability',
      'Цена GPU указана отдельно или входит в стоимость всей ВМ?',
      ['explain', 'gpu'],
      'medium',
      {
        toolsAny: ['get_quote', 'search_prices', 'compose_solution', 'search_catalog'],
        mustClarify: true,
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
      },
    ),
    sc(
      190,
      'explainability',
      'Почему более дешёвый вариант не был рекомендован?',
      ['explain', 'ambiguous'],
      'trap',
      {
        mustClarify: true,
        mustExposeAssumptions: true,
      },
    ),

    // ── 16. Revise / recalculate ─────────────────────────────────────────
    sc(
      191,
      'revise',
      'Увеличь количество worker-нод с трёх до пяти.',
      ['revise', 'kubernetes'],
      'medium',
      {
        seedId: 'ux-037',
        toolsAny: ['compose_solution', 'price_solution', 'validate_solution'],
        reviseSignals: ['5', 'пяти', 'worker'],
        mustShowBreakdown: true,
      },
      'Follow-up on 3×8/32 k8s → 5 workers.',
    ),
    sc(
      192,
      'revise',
      'Замени SSD на HDD и пересчитай.',
      ['revise', 'vm', 'storage'],
      'medium',
      {
        seedId: 'ux-021',
        toolsAny: ['get_quote', 'compose_solution', 'price_solution'],
        reviseSignals: ['HDD', 'hdd'],
      },
    ),
    sc(
      193,
      'revise',
      'Убери CDN из решения.',
      ['revise', 'web'],
      'medium',
      {
        seedId: 'ux-108',
        toolsAny: ['compose_solution', 'price_solution', 'validate_solution'],
        forbiddenExtras: [],
        reviseSignals: ['CDN'],
        mustShowBreakdown: true,
      },
      'After web stack, CDN should be removed / zeroed.',
    ),
    sc(
      194,
      'revise',
      'Добавь ещё один публичный IP.',
      ['revise', 'network'],
      'medium',
      {
        seedId: 'ux-023',
        toolsAny: ['get_quote', 'compose_solution', 'search_prices', 'price_solution'],
        reviseSignals: ['IP', 'ip'],
      },
    ),
    sc(
      195,
      'revise',
      'Увеличь исходящий трафик до 10 ТБ.',
      ['revise', 'network'],
      'medium',
      {
        seedId: 'ux-054',
        toolsAny: ['search_prices', 'compose_solution', 'price_solution'],
        reviseSignals: ['10'],
      },
    ),
    sc(
      196,
      'revise',
      'Пересчитай решение для двух зон вместо одной.',
      ['revise', 'kubernetes'],
      'medium',
      {
        seedId: 'ux-037',
        toolsAny: ['compose_solution', 'price_solution'],
        reviseSignals: ['2', 'зон', 'zone'],
        mustExposeAssumptions: true,
      },
    ),
    sc(
      197,
      'revise',
      'Исключи Yandex Cloud из сравнения.',
      ['revise', 'compare'],
      'medium',
      {
        seedId: 'ux-141',
        toolsAny: ['get_quote', 'compose_solution'],
        reviseSignals: ['Yandex', 'Яндекс'],
      },
      'Yandex should be absent from positive claims.',
    ),
    sc(
      198,
      'revise',
      'Оставь только решения с полным покрытием требований.',
      ['revise', 'explain'],
      'hard',
      {
        seedId: 'ux-108',
        toolsAny: ['compose_solution', 'validate_solution', 'price_solution'],
        mustExposeAssumptions: true,
        reviseSignals: ['покрыт', 'coverage', 'полный', '100'],
        answerIncludes: ['покрыт', 'coverage', 'полный', 'valid', 'требован'],
      },
    ),
    sc(
      199,
      'revise',
      'Замени H100 на H200 во всех вариантах.',
      ['revise', 'gpu'],
      'medium',
      {
        seedId: 'ux-030',
        toolsAny: ['get_quote', 'compose_solution', 'search_prices'],
        reviseSignals: ['H200'],
        answerIncludes: ['H200'],
      },
    ),
    sc(
      200,
      'revise',
      'Возьми рекомендованное решение и добавь 20% запас по мощности.',
      ['revise', 'compose'],
      'hard',
      {
        seedId: 'ux-037',
        toolsAny: ['compose_solution', 'price_solution', 'get_quote'],
        reviseSignals: ['20', 'запас', 'headroom'],
        mustExposeAssumptions: true,
      },
    ),

    // ── 15. Platform / SKU compare (Ice Lake ≠ S3 Ice; nearest preemptible analogs) ──
    sc(
      201,
      'sku-compare',
      'Сравни с другими провайдерами: «Intel Ice Lake, 100% preemptible vCPU» (yc.compute.ice-lake-100.preemptible-vcpu) у Yandex Cloud. Категория: Compute. Конфигурация: vCPU · 100% · Intel Ice Lake · preemptible. Платформа: Intel Ice Lake. Цена сейчас: 244,80 ₽ за vCPU · в месяц. Найди ближайшие аналоги у других провайдеров (если точного SKU нет — ближайшее по смыслу: тот же тип ресурса, платформа и доля ядра где применимо) и сравни цены в одной таблице. Отметь отличия, если аналоги неполные.',
      ['price', 'compare', 'compute'],
      'hard',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Intel Ice Lake, 100% preemptible vCPU',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['Ice Lake', 'Selectel', 'Yandex', 'preemptible', 'прерыв', 'vCPU'],
        forbiddenExtras: ['S3 Standard', 'Hotbox'],
      },
      'Product-page CTA: filled cross-provider vCPU table; Ice Lake ≠ S3 Ice; note incomplete on-demand analogs.',
    ),
    sc(
      202,
      'sku-compare',
      'Intel Ice Lake, 100%',
      ['price', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Intel Ice Lake, 100%',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['Ice Lake', 'vCPU', 'Selectel', 'Yandex'],
      },
      'Short chip: unit vCPU analogs, not disks/images/RAM; non-empty answer.',
    ),
    sc(
      203,
      'sku-compare',
      'Сравни Ice Lake preemptible vCPU по провайдерам — у кого дешевле ядро?',
      ['price', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['search_prices', 'compare_unit_price'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Ice Lake preemptible vCPU',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['preemptible', 'прерыв', 'vCPU', 'Ice Lake'],
      },
      'Nearest preemptible/100% vCPU; do not collapse to empty «нет тарифов».',
    ),
    sc(
      204,
      'sku-compare',
      'Сравни Sapphire Rapids 100% vCPU с аналогами у других облаков РФ.',
      ['price', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Sapphire Rapids 100% vCPU',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['Sapphire', 'vCPU'],
      },
      'Platform SKU compare; nearest 100% vCPU if exact Sapphire missing.',
    ),
    sc(
      205,
      'sku-compare',
      'yc.compute.ice-lake-100.preemptible-vcpu — есть ли такие же preemptible ядра у Selectel и VK?',
      ['price', 'compare', 'compute'],
      'hard',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Intel Ice Lake, 100% preemptible vCPU yc.compute.ice-lake-100.preemptible-vcpu',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
        answerIncludes: ['Selectel', 'preemptible', 'прерыв'],
      },
      'SKU id ask: Selectel has preemptible Cascade; VK often only on-demand — say so explicitly.',
    ),
    sc(
      206,
      'sku-compare',
      'Не путай с объектным Ice: сравни именно Intel Ice Lake 100% preemptible vCPU по цене ядра.',
      ['price', 'compare', 'compute'],
      'trap',
      {
        toolsAny: ['search_prices', 'compare_unit_price'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'Intel Ice Lake 100% preemptible vCPU',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['vCPU', 'Ice Lake', 'preemptible', 'прерыв'],
        forbiddenExtras: ['Hotbox', 'Icebox'],
      },
      'Trap: CPU Ice Lake must not become S3 Ice capacity compare.',
    ),
    sc(
      207,
      'sku-compare',
      'Сравни on-demand и preemptible цену одного Ice Lake vCPU — можно ли их усреднять?',
      ['price', 'compare', 'compute', 'explain'],
      'hard',
      {
        toolsAny: ['compare_unit_price', 'search_prices'],
        toolsAvoid: ['compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['preemptible', 'прерыв', 'on-demand', 'on demand', 'обычн', 'нельзя', 'разн'],
      },
      'Must refuse averaging preemptible with on-demand; show both as separate lines.',
    ),
    sc(
      208,
      'sku-compare',
      'У Yandex Ice Lake preemptible около 245 ₽/vCPU·мес — найди ближайший аналог у Selectel и скажи, чем он отличается.',
      ['price', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['search_prices', 'compare_unit_price', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: '100% preemptible vCPU',
          category: 'compute',
          limit: 30,
        },
        mustShowBreakdown: true,
        answerIncludes: ['Selectel', 'Cascade', 'Ice Lake', 'preemptible', 'прерыв'],
      },
      'Selectel preemptible is cheaper but Cascade Lake — call out platform delta.',
    ),
    sc(
      221,
      'sku-compare',
      'Сравни с другими провайдерами: «NVIDIA B300 288 ГБ · ×8» (selectel.dedicated.hgx-b300-8) у Selectel. Категория: GPU. Конфигурация: 128 vCPU · 2048 GiB RAM · 8 GPU · NVIDIA B300. Цена сейчас: 8 000 000,00 ₽ конфигурация целиком (GPU+хост) · в месяц. Найди ближайшие аналоги у других провайдеров (если точного SKU нет — ближайшее по смыслу: тот же класс datacenter GPU и сопоставимое число карт) и сравни цены в одной таблице. Отметь отличия, если аналоги неполные.',
      ['price', 'compare', 'gpu'],
      'hard',
      {
        toolsAny: ['search_prices', 'get_quote', 'search_catalog'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'search',
        anchorParams: {
          query: 'NVIDIA B300 288 ГБ · ×8 selectel.dedicated.hgx-b300-8',
          category: 'gpu',
          gpuModel: 'B300',
          nearestAnalog: true,
          limit: 20,
        },
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
        answerIncludes: ['B300', 'H200', 'H100', 'Selectel'],
        forbiddenExtras: ['GTX 1080', 'GTX1080', 'RTX 2080', 'A2000'],
      },
      'Product CTA B300×8 HGX: peers are 8×H200/H100 datacenter nodes — never cheapest NVIDIA (GTX 1080). No same-gen SKU → say incomplete, do not pad with T4/L4.',
    ),
    sc(
      209,
      'unit-price',
      '8 ядер cpu — сколько стоит одно ядро on-demand 100% у разных провайдеров? Cloud.ru тоже покажи.',
      ['price', 'unit', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['compare_unit_price', 'search_prices'],
        toolsAvoid: ['compose_solution'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'vcpu'},
        mustShowBreakdown: true,
        answerIncludes: ['Cloud.ru', 'оценк', 'vCPU', 'Selectel'],
      },
      'Cloud.ru must appear via derivedFromFlavors with * / оценка — not «нет в каталоге».',
    ),
    sc(
      210,
      'budget',
      'Около 10 тысяч рублей в месяц — что смогу позволить из виртуальных машин? Хочу максимально утилизировать бюджет и получить больше ресурсов. Cloud.ru тоже сравни.',
      ['budget', 'vm', 'compare'],
      'medium',
      {
        toolsAny: ['fit_budget', 'get_quote'],
        toolsAvoid: ['compose_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
        answerIncludes: ['Cloud.ru', '10', 'утил', 'vCPU', 'VK', 'Selectel'],
      },
      'fit_budget ~10k: rank max totalVcpu then util% (VK/Selectel 2/8×2 win). Cloud.ru is quoted (flavor) but 2/8 only fits ×1; 4/16 is cheapest same-4-vCPU with lower util — must appear via valuePick / note, not «Cloud.ru нет».',
    ),
    sc(
      211,
      'unit-price',
      'Минимальная цена 1 vCPU (on-demand 100%) в месяц с НДС у всех провайдеров — таблица и разброс к минимуму. Cloud.ru не забудь.',
      ['price', 'unit', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['compare_unit_price'],
        toolsAvoid: ['compose_solution', 'get_quote'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'vcpu'},
        mustShowBreakdown: true,
        answerIncludes: [
          'Cloud.ru',
          'Selectel',
          'VK',
          'MWS',
          'Yandex',
          'T1',
          'оценк',
          'vCPU',
        ],
      },
      'Full 6-provider vCPU unit table: providers[] + Cloud.ru* from derivedFromFlavors. Human answer: % к минимуму / разброс; never «Cloud.ru нет в каталоге». Cheapest unit meter = Selectel; Cloud.ru* is estimate.',
    ),
    sc(
      212,
      'unit-price',
      'А теперь то же для памяти: минимальная цена 1 GiB RAM в месяц у всех, включая Cloud.ru, и кто дороже всех.',
      ['price', 'unit', 'compare', 'compute'],
      'medium',
      {
        toolsAny: ['compare_unit_price'],
        toolsAvoid: ['compose_solution', 'get_quote'],
        catalogAnchor: 'unit',
        anchorParams: {component: 'ram'},
        mustShowBreakdown: true,
        answerIncludes: [
          'Cloud.ru',
          'Selectel',
          'T1',
          'RAM',
          'памят',
          'оценк',
          'GiB',
          'ГиБ',
        ],
      },
      'RAM unit table with Cloud.ru*. Expect inversion vs vCPU: T1 cheapest among unit meters, Selectel often dearest; Cloud.ru* estimate still lowest overall.',
    ),
    sc(
      213,
      'unit-price',
      'Сравни цену на ядро и на память у всех провайдеров — какой там разброс? И по vCPU, и по RAM, по-человечески, с Cloud.ru.',
      ['price', 'unit', 'compare', 'compute', 'explain'],
      'hard',
      {
        toolsAny: ['compare_unit_price'],
        toolsAvoid: ['compose_solution'],
        mustShowBreakdown: true,
        mustExposeAssumptions: true,
        answerIncludes: [
          'Cloud.ru',
          'Selectel',
          'vCPU',
          'RAM',
          'памят',
          'оценк',
          'разброс',
          'T1',
        ],
      },
      'Dual unit compare (vcpu + ram). Must call compare_unit_price twice or cover both; include Cloud.ru* both times; narrate spread (~20–25%) and CPU-cheap/RAM-dear inversion (Selectel) — not tool dumps only.',
    ),

    // ── 18. Capacity sizing (RPS → vCPU/RAM → quote) ─────────────────────
    sc(
      214,
      'sizing',
      'Тысяча RPS на Go — сколько CPU-ядер нужно?',
      ['sizing', 'compute', 'web'],
      'medium',
      {
        mustExposeAssumptions: true,
        answerIncludes: ['ядр', 'RPS', 'латент'],
      },
      'Latency-based concurrency + ~250 RPS/core × safety ≈ 5–6 vCPU at ~10 ms; expose assumptions; priced flavor is a plus, not required for pure core-count ask.',
    ),
    sc(
      215,
      'sizing',
      'API на Go, около 1000 RPS, средняя латентность 10 мс — подбери ВМ и сравни провайдеров за месяц.',
      ['sizing', 'compose', 'vm', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
        answerIncludes: ['vCPU', 'ядр', 'RPS', '₽'],
      },
      'Derive ~6 vCPU (+ RAM assumption), get_quote/compose, provider table with ₽ — not theory-only.',
    ),
    sc(
      216,
      'sizing',
      'При 1000 RPS и средней латентности 50 мс сколько ядер понадобится для Go-сервиса?',
      ['sizing', 'compute'],
      'hard',
      {
        mustExposeAssumptions: true,
        answerIncludes: ['ядр', 'RPS', 'латент', '50'],
      },
      'Higher latency → higher concurrency/reserve; ballpark 15–20 cores with 250 RPS/core + ~30% safety; state formula in plain text.',
    ),
    sc(
      217,
      'sizing',
      'Сколько памяти нужно Go-сервису на 1000 RPS?',
      ['sizing', 'compute'],
      'hard',
      {
        mustExposeAssumptions: true,
        mustClarify: true,
        answerIncludes: ['GiB', 'ГиБ', 'памят', 'RPS'],
      },
      'RAM needs profile; expose defaults (~0.5–1 GiB/vCPU or ~2×vCPU GiB) or ask 1 short clarifying Q; do not invent precise RSS.',
    ),
    sc(
      218,
      'sizing',
      'Нам нужно обслужить около тысячи запросов в секунду на бэкенде — какую конфигурацию взять?',
      ['sizing', 'compose', 'web', 'ambiguous'],
      'trap',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['запрос', 'ядр', 'vCPU'],
      },
      'No language/latency given — default Go/~10ms/I-O explicitly, size cores, then quote; never silent magic numbers.',
    ),
    sc(
      219,
      'sizing',
      'Go API, 5000 RPS, latency 5 мс, в основном I/O — оцени vCPU и RAM и сравни цену по провайдерам.',
      ['sizing', 'compose', 'vm', 'compare'],
      'hard',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        mustShowBreakdown: true,
        answerIncludes: ['vCPU', 'RAM', 'RPS', '₽'],
      },
      'I/O-friendly RpsPerCore can be >250; still show math + safety; priced comparison required.',
    ),
    sc(
      220,
      'sizing',
      'Если средняя латентность 5 мс при 1000 RPS — это меньше ядер, чем при 20 мс? Объясни и предложи конфигурации с ценой.',
      ['sizing', 'explain', 'compare'],
      'medium',
      {
        toolsAny: ['get_quote', 'compose_solution'],
        mustExposeAssumptions: true,
        answerIncludes: ['латент', 'ядр', 'RPS', '₽'],
      },
      'Teach concurrency = RPS×latency; contrast ~3–4 vs ~8–10 cores; quote both configs or explain delta then price the recommended one.',
    ),

    // ── Cheapest full VM per provider (not unit components) ─────────────
    sc(
      222,
      'vm',
      'Подбери самое экономичное вариант в каждом из провайдеров',
      ['quote', 'vm', 'compare', 'economy'],
      'medium',
      {
        toolsAny: ['get_quote'],
        toolsAvoid: ['compare_unit_price', 'fit_budget'],
        catalogAnchor: 'quote',
        anchorParams: {mode: 'cheapest-per-provider', period: 'month', diskGiB: 10},
        mustShowBreakdown: true,
        answerIncludes: ['Cloud.ru', 'Yandex', 'Selectel', 'vCPU', '₽'],
      },
      'get_quote(mode=cheapest-per-provider): full launchable VM BOM per provider (shape/share/spot may differ). Not unit CPU/RAM, not vague «~400–600 ₽» without tools.',
    ),
    sc(
      223,
      'vm',
      'Самая дешёвая виртуальная машина у каждого провайдера — именно полноценная ВМ (ядра+память+диск), не отдельные диски и не снимки.',
      ['quote', 'vm', 'compare', 'economy'],
      'medium',
      {
        toolsAny: ['get_quote'],
        toolsAvoid: ['compare_unit_price'],
        catalogAnchor: 'quote',
        anchorParams: {mode: 'cheapest-per-provider', period: 'month', diskGiB: 10},
        mustShowBreakdown: true,
        answerIncludes: ['vCPU', 'GiB', '₽'],
        forbiddenExtras: [],
      },
      'Must price whole VMs; mentioning disk/snapshot SKUs alone as «cheapest VM» is a miss.',
    ),
    sc(
      224,
      'vm',
      'Не устраивай опросник — сразу покажи самую дешёвую ВМ по всем провайдерам: конфиг и цена в месяц.',
      ['quote', 'vm', 'compare', 'economy'],
      'trap',
      {
        toolsAny: ['get_quote'],
        toolsAvoid: ['compare_unit_price', 'fit_budget'],
        catalogAnchor: 'quote',
        anchorParams: {mode: 'cheapest-per-provider', period: 'month', diskGiB: 10},
        mustShowBreakdown: true,
        answerIncludes: ['₽', 'vCPU'],
      },
      'Preview-first: priced table in the same turn; clarifying questions only as a short footnote, not instead of the BOM.',
    ),
    sc(
      225,
      'sku-compare',
      'Сравни с другими провайдерами: «Виртуальная машина 4vCPU/32GB RAM» (cloudru.compute.4vcpu-32gb) у Cloud.ru. Категория: Compute. Конфигурация: 4 vCPU · 32 GiB RAM · Cascade / Ice Lake. Платформа: Cascade / Ice Lake. Цена сейчас: 8 669,81 ₽ в месяц. Найди ближайшие аналоги у других провайдеров (если точного SKU нет — ближайшее по смыслу: тот же тип ресурса, платформа и доля ядра где применимо) и сравни цены в одной таблице. Отметь отличия, если аналоги неполные.',
      ['price', 'compare', 'compute', 'vm'],
      'hard',
      {
        toolsAny: ['get_quote'],
        toolsAvoid: ['compare_unit_price'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 4, ramGiB: 32, diskGiB: 10, period: 'month'},
        mustShowBreakdown: true,
        answerIncludes: ['4', '32', 'Cloud.ru', 'Selectel', 'vCPU'],
        forbiddenExtras: [
          'GiB-RAM',
          'preemptible RAM',
          'GPU V100',
          'gpu-v100',
          'только RAM',
        ],
      },
      'Product CTA VM flavor 4/32: full-machine get_quote peers — never unit RAM / GPU-host Cascade RAM as «аналог».',
    ),
    sc(
      226,
      'vm',
      'Сравни 4 vCPU / 16 GiB по всем провайдерам',
      ['quote', 'vm', 'compare'],
      'easy',
      {
        toolsAny: ['get_quote'],
        catalogAnchor: 'quote',
        anchorParams: {vcpu: 4, ramGiB: 16, diskGiB: 100, period: 'month'},
        mustShowBreakdown: true,
        answerIncludes: ['Cloud.ru', 'MWS', '4', '16'],
      },
      'Fixed-shape VM compare across providers (seed for provider-focus revise).',
    ),
    sc(
      227,
      'revise',
      'покажи только cloud ru',
      ['revise', 'vm', 'compare'],
      'medium',
      {
        seedId: 'ux-226',
        toolsAny: ['get_quote'],
        reviseSignals: ['Cloud.ru', 'cloud'],
        answerIncludes: ['Cloud.ru'],
        forbiddenExtras: ['MWS Cloud', 'Selectel', 'Yandex Cloud', 'VK Cloud', 'T1 Cloud'],
      },
      'After full 4/16 compare, «только Cloud.ru» must not re-dump every provider.',
    ),
  ];

  if (qs.length !== SOFT_SCENARIO_COUNT) {
    throw new Error(`Expected ${SOFT_SCENARIO_COUNT} soft scenarios, got ${qs.length}`);
  }
  return qs;
}

/** Regex helpers shared with soft-grade (not stored on cases). */
export const SOFT_SIGNAL_RES = {
  price: PRICE,
  clarify: CLARIFY,
  partial: PARTIAL,
  assume: ASSUME,
  breakdown: BREAKDOWN,
  coverage100: COVERAGE_100,
};

export function getScenarioById(id: string): SoftScenario | undefined {
  return buildUserScenarios().find((s) => s.id === id);
}

export function filterScenarios(opts: {
  section?: string;
  ids?: string[];
  intent?: string;
  difficulty?: SoftDifficulty;
  limit?: number;
  offset?: number;
}): SoftScenario[] {
  let list = buildUserScenarios();
  if (opts.section) list = list.filter((s) => s.section === opts.section);
  if (opts.intent) list = list.filter((s) => s.intent.includes(opts.intent!));
  if (opts.difficulty) list = list.filter((s) => s.difficulty === opts.difficulty);
  if (opts.ids?.length) {
    const set = new Set(opts.ids);
    list = list.filter((s) => set.has(s.id));
  }
  const offset = opts.offset ?? 0;
  if (offset) list = list.slice(offset);
  if (opts.limit != null) list = list.slice(0, opts.limit);
  return list;
}