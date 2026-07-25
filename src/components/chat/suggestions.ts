import type {SuggestionsItem} from '@gravity-ui/aikit/types';

/**
 * Starter prompts on the empty chat screen. Keep the list short so the composer
 * stays fully visible in the first viewport.
 */
export const CHAT_SUGGESTIONS: SuggestionsItem[] = [
  {id: 'fit-budget-100k', title: 'Бюджет 100 000 ₽/мес — что можно позволить?'},
  {id: 'compare-4-16', title: 'Сравни 4 vCPU / 16 GiB по всем провайдерам'},
  {id: 'cheapest-h100', title: 'Самый дешёвый H100 в месяц'},
  {
    id: 'stack-vm-ip-s3-cdn-k8s',
    title:
      'Собери решение: ВМ 16 vCPU / 32 GiB, публичный IP, 100 ТБ S3 Standard, 100 ТБ CDN, зональный K8s master',
  },
  {id: 's3-standard', title: 'Сравни S3 Standard по провайдерам за GiB·мес'},
  {id: 'glm', title: 'Сколько стоит GLM 5.2 у MWS?'},
  {id: 'kimi-k3-infra', title: 'Какая инфраструктура нужна, чтобы развернуть Kimi K3 self-host в РФ?'},
];
