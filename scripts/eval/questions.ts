/**
 * 100+ grounded eval questions. Each carries the canonical tool + params used to
 * compute deterministic ground truth (see ground-truth.ts). Questions are phrased
 * naturally; the assistant must pick tools itself — params here are ONLY for truth.
 */
import {
  truthFromSearch,
  truthFromQuote,
  truthFromObjectStorageVolume,
  truthFromUnitPrice,
  type Truth,
} from './ground-truth';

export type Question = {
  id: string;
  q: string;
  kind: 'search' | 'quote' | 'unit';
  truth: () => Truth;
  /** short tag for reporting */
  tag: string;
};

const GPU_TOKENS = [
  'H100',
  'H200',
  'A100',
  'B300',
  'L40S',
  'L4',
  'V100',
  'A30',
  'T4',
  'RTX 4090',
  'RTX 6000 Pro',
  'A2',
  'A5000',
  'GTX 1080',
];

const AI_TOKENS = [
  'GLM',
  'GigaChat',
  'Qwen',
  'DeepSeek',
  'Kimi',
  'gpt-oss',
  'YandexGPT',
  'Gemma',
  'Alice',
  'MiniMax',
];

const STORAGE_CLASSES: {token: string; label: string}[] = [
  {token: 'standard', label: 'Standard'},
  {token: 'cold', label: 'Cold'},
  {token: 'ice', label: 'Ice'},
  {token: 'warm', label: 'Warm'},
];

const DISK_MEDIA = ['NVMe', 'SSD', 'HDD'];

const COMPUTE_SHAPES: {vcpu: number; ram: number}[] = [
  {vcpu: 2, ram: 8},
  {vcpu: 4, ram: 16},
  {vcpu: 8, ram: 32},
  {vcpu: 16, ram: 64},
  {vcpu: 32, ram: 128},
  {vcpu: 2, ram: 4},
  {vcpu: 8, ram: 16},
  {vcpu: 4, ram: 32},
  {vcpu: 2, ram: 16},
  {vcpu: 16, ram: 32},
  {vcpu: 8, ram: 64},
  {vcpu: 4, ram: 8},
  {vcpu: 32, ram: 64},
  {vcpu: 1, ram: 4},
];

const GPU_QUOTE_TOKENS = ['H100', 'H200', 'A100', 'L40S', 'V100', 'L4'];

// Single-provider (or niche) GPUs — strong hallucination traps.
const GPU_NICHE_TOKENS = ['RTX 6000 Ada', 'RTX 2080 Ti', 'A2000', 'V100S', 'Metax C500'];

const PROVIDERS_FOR_SCOPE: {id: string; name: string}[] = [
  {id: 'yandex-cloud', name: 'Yandex Cloud'},
  {id: 'vk-cloud', name: 'VK Cloud'},
  {id: 'cloud-ru', name: 'Cloud.ru'},
  {id: 't1-cloud', name: 'T1 Cloud'},
  {id: 'selectel', name: 'Selectel'},
  {id: 'mws-cloud', name: 'MWS Cloud'},
];

const AI_PROVIDERS_FOR_SCOPE = [
  {id: 'cloud-ru', name: 'Cloud.ru'},
  {id: 'mws-cloud', name: 'MWS Cloud'},
  {id: 'yandex-cloud', name: 'Yandex Cloud'},
];

export function buildQuestions(): Question[] {
  const qs: Question[] = [];

  // --- GPU: who offers + hourly price (search) ---
  for (const t of GPU_TOKENS) {
    qs.push({
      id: `gpu-who-${t}`,
      tag: 'gpu-who',
      kind: 'search',
      q: `Кто из провайдеров предлагает GPU ${t}? Перечисли только тех, у кого он реально есть.`,
      truth: () => truthFromSearch({query: t, category: 'gpu', gpuModel: t, limit: 30}, 'hour'),
    });
    qs.push({
      id: `gpu-price-${t}`,
      tag: 'gpu-price',
      kind: 'search',
      q: `Сколько стоит ${t} в час у разных провайдеров? Покажи самый дешёвый вариант.`,
      truth: () => truthFromSearch({query: t, category: 'gpu', gpuModel: t, limit: 30}, 'hour'),
    });
  }

  // --- GPU: comparison with configuration parity (quote) ---
  for (const t of GPU_QUOTE_TOKENS) {
    qs.push({
      id: `gpu-quote-${t}`,
      tag: 'gpu-quote',
      kind: 'quote',
      q: `Сравни ${t} по провайдерам с паритетом по конфигурации (целая конфигурация GPU + хост). Кто дешевле?`,
      truth: () => truthFromQuote({gpuModel: t, gpuCount: 1, period: 'month'}),
    });
  }

  // --- AI inference (search) ---
  for (const t of AI_TOKENS) {
    qs.push({
      id: `ai-price-${t}`,
      tag: 'ai-price',
      kind: 'search',
      q: `Сколько стоит инференс модели ${t} за 1M токенов и кто её предлагает?`,
      truth: () => truthFromSearch({query: t, category: 'ai', aiModel: t, limit: 30}, 'hour'),
    });
    qs.push({
      id: `ai-who-${t}`,
      tag: 'ai-who',
      kind: 'search',
      q: `У каких провайдеров есть модель ${t}?`,
      truth: () => truthFromSearch({query: t, category: 'ai', aiModel: t, limit: 30}, 'hour'),
    });
  }

  // --- Object storage classes (search, hard class + capacity) ---
  for (const c of STORAGE_CLASSES) {
    qs.push({
      id: `storage-${c.token}`,
      tag: 'storage',
      kind: 'search',
      q: `Кто предлагает объектное хранилище класса ${c.label} и по какой цене за GiB в месяц?`,
      truth: () =>
        truthFromSearch(
          {
            query: `объектное хранилище ${c.token}`,
            category: 'storage',
            storageClass: c.token,
            meterKind: 'capacity',
            limit: 30,
          },
          'month',
        ),
    });
  }

  // --- Block disks by media (search) ---
  for (const media of DISK_MEDIA) {
    qs.push({
      id: `disk-${media}`,
      tag: 'disk',
      kind: 'search',
      q: `Сколько стоит блочный диск ${media} за GiB в месяц у разных провайдеров?`,
      truth: () => truthFromSearch({query: `диск ${media}`, category: 'compute', limit: 30}, 'month'),
    });
  }

  // --- Network (search) ---
  qs.push({
    id: `net-egress`,
    tag: 'network',
    kind: 'search',
    q: `Сколько стоит исходящий (egress) трафик за GiB у разных провайдеров?`,
    truth: () => truthFromSearch({query: 'egress трафик', category: 'network', limit: 30}, 'month'),
  });
  qs.push({
    id: `net-ip`,
    tag: 'network',
    kind: 'search',
    q: `Сколько стоит публичный IPv4-адрес в месяц у разных провайдеров?`,
    truth: () => truthFromSearch({query: 'публичный IP адрес', category: 'network', limit: 30}, 'month'),
  });

  // --- Kubernetes (search) ---
  qs.push({
    id: `k8s`,
    tag: 'kubernetes',
    kind: 'search',
    q: `Сколько стоит управляемый Kubernetes (мастер) у разных провайдеров?`,
    truth: () => truthFromSearch({query: 'kubernetes мастер', category: 'kubernetes', limit: 30}, 'month'),
  });

  // --- Compute VM comparisons (quote) ---
  for (const s of COMPUTE_SHAPES) {
    qs.push({
      id: `vm-${s.vcpu}-${s.ram}`,
      tag: 'vm-quote',
      kind: 'quote',
      q: `Сравни виртуальную машину ${s.vcpu} vCPU / ${s.ram} GiB RAM по провайдерам за месяц. Где дешевле всего?`,
      truth: () => truthFromQuote({vcpu: s.vcpu, ramGiB: s.ram, period: 'month'}),
    });
  }

  // --- Niche single-provider GPUs (hallucination traps) ---
  for (const t of GPU_NICHE_TOKENS) {
    qs.push({
      id: `gpu-niche-${t}`,
      tag: 'gpu-niche',
      kind: 'search',
      q: `Кто предлагает GPU ${t} и сколько он стоит? Если его почти ни у кого нет — так и скажи.`,
      truth: () => truthFromSearch({query: t, category: 'gpu', gpuModel: t, limit: 30}, 'hour'),
    });
  }

  // --- Multi-GPU parity comparisons (quote) ---
  for (const t of ['H100', 'A100', 'H200']) {
    qs.push({
      id: `gpu-multi-${t}`,
      tag: 'gpu-multi',
      kind: 'quote',
      q: `Сравни конфигурацию 8×${t} по провайдерам с паритетом по конфигурации. Кто дешевле за месяц?`,
      truth: () => truthFromQuote({gpuModel: t, gpuCount: 8, period: 'month'}),
    });
  }

  // --- AI token direction (search) ---
  for (const t of ['GLM', 'Qwen', 'gpt-oss', 'YandexGPT', 'GigaChat']) {
    qs.push({
      id: `ai-output-${t}`,
      tag: 'ai-output',
      kind: 'search',
      q: `Сколько стоят выходные (output) токены модели ${t} за 1M токенов?`,
      truth: () => truthFromSearch({query: `${t} output`, category: 'ai', aiModel: t, limit: 30}, 'hour'),
    });
  }

  // --- Provider-scoped GPU catalog (must not add other providers) ---
  for (const p of PROVIDERS_FOR_SCOPE) {
    qs.push({
      id: `gpu-by-${p.id}`,
      tag: 'gpu-by-provider',
      kind: 'search',
      q: `Какие GPU-ускорители есть в каталоге у провайдера ${p.name}? Назови только его предложения.`,
      truth: () => truthFromSearch({query: 'GPU', category: 'gpu', provider: p.id, limit: 40}, 'hour'),
    });
  }

  // --- Provider-scoped AI catalog ---
  for (const p of AI_PROVIDERS_FOR_SCOPE) {
    qs.push({
      id: `ai-by-${p.id}`,
      tag: 'ai-by-provider',
      kind: 'search',
      q: `Какие AI-модели для инференса есть у провайдера ${p.name}?`,
      truth: () => truthFromSearch({query: 'инференс модель', category: 'ai', provider: p.id, limit: 40}, 'hour'),
    });
  }

  // --- Kubernetes regional/HA ---
  qs.push({
    id: `k8s-regional`,
    tag: 'kubernetes',
    kind: 'search',
    q: `Сколько стоит отказоустойчивый (региональный) мастер управляемого Kubernetes у провайдеров?`,
    truth: () => truthFromSearch({query: 'kubernetes региональный отказоустойчивый', category: 'kubernetes', limit: 30}, 'month'),
  });

  // --- Object storage operations ---
  qs.push({
    id: `storage-requests`,
    tag: 'storage',
    kind: 'search',
    q: `Сколько стоят операции (requests) в объектном хранилище за 10 000 запросов?`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище requests операции',
          category: 'storage',
          meterKind: 'requests',
          limit: 30,
        },
        'month',
      ),
  });

  // --- Object storage: natural scenarios (class parity, volume / DWH) ---
  qs.push({
    id: `storage-standard-compare`,
    tag: 'storage',
    kind: 'search',
    q: `Сравни объектное хранилище стандартного класса (S3 Standard) по провайдерам: цена за GiB в месяц. Кто дешевле? Не смешивай с Cold/Ice.`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище standard',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          limit: 30,
        },
        'month',
      ),
  });

  qs.push({
    id: `storage-ice-compare`,
    tag: 'storage',
    kind: 'search',
    q: `Сравни класс Ice объектного хранилища по провайдерам: кто предлагает и сколько ₽/GiB·мес?`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище ice',
          category: 'storage',
          storageClass: 'ice',
          meterKind: 'capacity',
          limit: 30,
        },
        'month',
      ),
  });

  qs.push({
    id: `storage-cold-compare`,
    tag: 'storage',
    kind: 'search',
    q: `Кто дешевле по холодному (Cold) объектному хранилищу за GiB в месяц?`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище cold',
          category: 'storage',
          storageClass: 'cold',
          meterKind: 'capacity',
          limit: 30,
        },
        'month',
      ),
  });

  qs.push({
    id: `storage-dwh-50tb`,
    tag: 'storage',
    kind: 'search',
    q: `Сколько будет стоить в месяц хранение 50 ТБ данных платформы/DWH в объектном хранилище стандартного класса у разных провайдеров? Кто дешевле?`,
    truth: () => truthFromObjectStorageVolume({storageClass: 'standard', volumeGiB: 50 * 1024}),
  });

  qs.push({
    id: `storage-10tib-cold`,
    tag: 'storage',
    kind: 'search',
    q: `Оцени стоимость 10 ТиБ холодного (Cold) S3-хранилища в месяц по провайдерам.`,
    truth: () => truthFromObjectStorageVolume({storageClass: 'cold', volumeGiB: 10 * 1024}),
  });

  qs.push({
    id: `storage-100gib-standard`,
    tag: 'storage',
    kind: 'search',
    q: `Сколько стоит 100 GiB объектного хранилища Standard в месяц у провайдеров?`,
    truth: () => truthFromObjectStorageVolume({storageClass: 'standard', volumeGiB: 100}),
  });

  qs.push({
    id: `storage-selectel-tb`,
    tag: 'storage',
    kind: 'search',
    q: `Цена объектного хранилища Standard за 1 ТиБ в месяц у Selectel.`,
    truth: () =>
      truthFromObjectStorageVolume({
        storageClass: 'standard',
        volumeGiB: 1024,
        query: 'объектное хранилище standard Selectel',
      }),
  });

  qs.push({
    id: `storage-vk-hotbox`,
    tag: 'storage',
    kind: 'search',
    q: `Сколько стоит Hotbox / Standard объектное хранилище у VK Cloud за GiB в месяц?`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище standard VK',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          provider: 'vk-cloud',
          limit: 10,
        },
        'month',
      ),
  });

  qs.push({
    id: `storage-cloudru-standard`,
    tag: 'storage',
    kind: 'search',
    q: `Есть ли у Cloud.ru стандартный класс объектного хранилища и какая цена за GiB·мес? Не путай с Ice.`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище standard Cloud.ru',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          provider: 'cloud-ru',
          limit: 10,
        },
        'month',
      ),
  });

  qs.push({
    id: `storage-cheapest-standard`,
    tag: 'storage',
    kind: 'search',
    q: `Какой провайдер сейчас самый дешёвый для S3 Standard (хранение ₽/GiB·мес)?`,
    truth: () =>
      truthFromSearch(
        {
          query: 'объектное хранилище standard',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          limit: 30,
        },
        'month',
      ),
  });

  // --- Unit prices (compare_unit_price) ---
  for (const component of ['vcpu', 'ram', 'ssd'] as const) {
    const label =
      component === 'vcpu' ? '1 vCPU (on-demand 100%)' : component === 'ram' ? '1 GiB RAM' : '1 GiB SSD';
    qs.push({
      id: `unit-${component}`,
      tag: 'unit-price',
      kind: 'unit',
      q: `Какая средняя и минимальная цена ${label} по провайдерам? Кто дешевле всех?`,
      truth: () => truthFromUnitPrice(component),
    });
  }

  // --- Block SSD volume (unit × GiB; model must not use S3 storage class) ---
  for (const tb of [1, 10, 50, 100]) {
    qs.push({
      id: `ssd-volume-${tb}tb`,
      tag: 'disk-volume',
      kind: 'unit',
      q: `Сколько стоит ${tb} ТБ блочного SSD в месяц по провайдерам? Не путай с объектным хранилищем.`,
      truth: () => {
        const t = truthFromUnitPrice('ssd');
        if (t.cheapestPrice != null) {
          const gib = tb * 1024;
          return {
            ...t,
            cheapestPrice: Math.round(t.cheapestPrice * gib * 100) / 100,
          };
        }
        return t;
      },
    });
  }

  // --- Versioned AI (must not substitute neighboring versions) ---
  for (const model of [
    {id: 'qwen-36', q: 'Qwen 3.6', aiModel: 'Qwen 3.6'},
    {id: 'qwen-35', q: 'Qwen 3.5', aiModel: 'Qwen 3.5'},
    {id: 'glm-52', q: 'GLM 5.2', aiModel: 'GLM 5.2'},
    {id: 'glm-47', q: 'GLM 4.7', aiModel: 'GLM 4.7'},
    {id: 'deepseek-v32', q: 'DeepSeek v3.2', aiModel: 'DeepSeek v3.2'},
    {id: 'kimi-k26', q: 'Kimi K2.6', aiModel: 'Kimi K2.6'},
  ]) {
    qs.push({
      id: `ai-ver-${model.id}`,
      tag: 'ai-version',
      kind: 'search',
      q: `Сравни цены ${model.q} за 1M токенов по провайдерам. Не подменяй соседней версией.`,
      truth: () =>
        truthFromSearch({query: model.q, category: 'ai', aiModel: model.aiModel, limit: 30}, 'hour'),
    });
  }

  // --- More Kubernetes / network paraphrases ---
  qs.push({
    id: 'k8s-zonal-basic',
    tag: 'kubernetes',
    kind: 'search',
    q: 'Сравни зональный (basic) мастер Managed Kubernetes по провайдерам за месяц.',
    truth: () =>
      truthFromSearch({query: 'Managed Kubernetes зональный', category: 'kubernetes', limit: 30}, 'month'),
  });
  qs.push({
    id: 'k8s-who',
    tag: 'kubernetes',
    kind: 'search',
    q: 'У каких провайдеров есть Managed Kubernetes в каталоге?',
    truth: () => truthFromSearch({query: 'Kubernetes', category: 'kubernetes', limit: 30}, 'month'),
  });
  qs.push({
    id: 'net-egress-1tb',
    tag: 'network',
    kind: 'search',
    q: 'Сколько примерно будет стоить 1 ТБ исходящего трафика (egress) у разных провайдеров?',
    truth: () => truthFromSearch({query: 'egress трафик', category: 'network', limit: 30}, 'month'),
  });
  qs.push({
    id: 'net-ip-compare',
    tag: 'network',
    kind: 'search',
    q: 'Сравни цену внешнего/публичного IP в месяц. Кто дешевле?',
    truth: () => truthFromSearch({query: 'публичный IP', category: 'network', limit: 30}, 'month'),
  });

  // --- Homepage-style / natural paraphrases (still tool-grounded) ---
  qs.push({
    id: 'home-vm-8-32',
    tag: 'vm-quote',
    kind: 'quote',
    q: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    truth: () => truthFromQuote({vcpu: 8, ramGiB: 32, diskGiB: 100, period: 'month'}),
  });
  qs.push({
    id: 'home-h100-month',
    tag: 'gpu-price',
    kind: 'search',
    q: 'Самый дешёвый H100 в месяц',
    truth: () => truthFromSearch({query: 'H100', category: 'gpu', gpuModel: 'H100', limit: 30}, 'month'),
  });
  qs.push({
    id: 'home-s3-50tb',
    tag: 'storage',
    kind: 'search',
    q: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    truth: () => truthFromObjectStorageVolume({storageClass: 'standard', volumeGiB: 50 * 1024}),
  });

  // --- Adversarial / abstain traps ---
  qs.push({
    id: 'adv-s3-as-ssd',
    tag: 'adversarial',
    kind: 'unit',
    q: 'Сравни блочный SSD и S3 Standard как будто это одно и то же — кто дешевле за GiB?',
    // Gold: treat as SSD unit price; model should NOT invent S3 as block disk.
    truth: () => truthFromUnitPrice('ssd'),
  });
  qs.push({
    id: 'adv-missing-gpu',
    tag: 'adversarial',
    kind: 'search',
    q: 'Кто предлагает GPU H800 NVL в российских облаках из каталога?',
    truth: () =>
      truthFromSearch({query: 'H800', category: 'gpu', gpuModel: 'H800', limit: 30}, 'hour'),
  });
  qs.push({
    id: 'adv-wrong-ai-version',
    tag: 'adversarial',
    kind: 'search',
    q: 'Сколько стоит Qwen 9.9 за 1M токенов у провайдеров?',
    truth: () =>
      truthFromSearch({query: 'Qwen 9.9', category: 'ai', aiModel: 'Qwen 9.9', limit: 30}, 'hour'),
  });

  return qs;
}
