import {
  Bucket,
  Boxes3,
  Code,
  FaceRobot,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  Sparkles,
} from '@gravity-ui/icons';

/** Placeholder for the home search field. */
export const HOME_SEARCH_PLACEHOLDER = 'Опишите конфигурацию или спросите своими словами';

export type HomeExample = {
  id: string;
  label: string;
  /** Full question sent to /chat?q=… */
  prompt: string;
  icon: typeof Boxes3;
};

/** Quick-start chips on the landing hero → chat deep-link. */
export const HOME_EXAMPLES: HomeExample[] = [
  {
    id: 'vm',
    label: 'Виртуальная машина',
    prompt: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    icon: Boxes3,
  },
  {
    id: 'h100',
    label: 'H100 GPU',
    prompt: 'Самый дешёвый H100 в месяц',
    icon: Gpu,
  },
  {
    id: 's3',
    label: '50 ТБ S3',
    prompt: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    icon: Bucket,
  },
  {
    id: 'disk-100tb',
    label: '100 ТБ SSD',
    prompt: 'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    icon: HardDrive,
  },
  {
    id: 'k8s',
    label: 'Managed Kubernetes',
    prompt: 'Сравни Managed Kubernetes по провайдерам',
    icon: Layers3Diagonal,
  },
  {
    id: 'glm',
    label: 'GLM 5.2',
    prompt: 'Сколько стоит GLM 5.2 у MWS за 1M токенов?',
    icon: FaceRobot,
  },
  {
    id: 'qwen',
    label: 'Qwen 3.6',
    prompt: 'Сравни цены Qwen 3.6 по провайдерам за 1M токенов',
    icon: Code,
  },
  {
    id: 'ai',
    label: 'AI API',
    prompt: 'Сравни цены AI API / токенов по провайдерам',
    icon: Sparkles,
  },
];

export function chatUrlForQuery(query: string): string {
  const q = query.trim();
  if (!q) return '/chat';
  return `/chat?q=${encodeURIComponent(q)}`;
}
