import type {SuggestionsItem} from '@gravity-ui/aikit/types';

/**
 * Starter prompts on the empty chat screen. Keep the list short so the composer
 * stays fully visible in the first viewport.
 */
export const CHAT_SUGGESTIONS: SuggestionsItem[] = [
  {id: 'fit-budget-100k', title: 'Бюджет 100 000 ₽/мес — что можно позволить?'},
  {id: 'compare-4-16', title: 'Сравни 4 vCPU / 16 GiB по всем провайдерам'},
  {id: 'cheapest-h100', title: 'Самый дешёвый H100 в месяц'},
  {id: 's3-standard', title: 'Сравни S3 Standard по провайдерам за GiB·мес'},
  {id: 's3-dwh', title: 'Сколько стоит 50 ТБ DWH в объектном хранилище Standard?'},
  {id: 'glm', title: 'Сколько стоит GLM 5.2 у MWS?'},
];
