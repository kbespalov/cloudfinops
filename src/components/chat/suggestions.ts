import type {SuggestionsItem} from '@gravity-ui/aikit/types';

/** Starter prompts shown on the empty chat screen. Title is used as the message. */
export const CHAT_SUGGESTIONS: SuggestionsItem[] = [
  {id: 'recommend', title: 'Подбери оптимального провайдера для 8 vCPU / 32 GiB'},
  {id: 'glm', title: 'Сколько стоит GLM 5.2 у MWS?'},
  {id: 'compare-4-16', title: 'Сравни 4 vCPU / 16 GiB по всем провайдерам'},
  {id: 'cheapest-h100', title: 'Самый дешёвый H100 в месяц'},
  {id: 's3-selectel', title: 'Цена объектного хранилища за ТБ у Selectel'},
  {id: 'b300', title: 'B300 у Selectel — сколько в месяц?'},
  {id: 'mws-vs-cloudru', title: 'Что дешевле для 8 vCPU / 32 GiB: MWS или Cloud.ru?'},
  {id: 'egress', title: 'Egress-трафик у Yandex Cloud'},
  {id: 'gpu-inference', title: 'Какой GPU дешевле всего для инференса?'},
  {id: 'gigachat', title: 'Цена GigaChat за 1M токенов'},
  {id: '2-8', title: 'Сколько стоит 2 vCPU / 8 GiB?'},
];
