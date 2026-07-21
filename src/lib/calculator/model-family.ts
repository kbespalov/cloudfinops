export type ModelFamily =
  | 'qwen'
  | 'glm'
  | 'kimi'
  | 'deepseek'
  | 'llama'
  | 'gemma'
  | 'mixtral'
  | 'mistral'
  | 'gpt-oss'
  | 'phi'
  | 'giga'
  | 'ttech'
  | 'other';

export const MODEL_FAMILY_META: Record<ModelFamily, {letters: string; title: string}> = {
  qwen: {letters: 'Qw', title: 'Qwen'},
  glm: {letters: 'GL', title: 'GLM'},
  kimi: {letters: 'Ki', title: 'Kimi'},
  deepseek: {letters: 'DS', title: 'DeepSeek'},
  llama: {letters: 'Ll', title: 'Llama'},
  gemma: {letters: 'Ge', title: 'Gemma'},
  mixtral: {letters: 'Mx', title: 'Mixtral'},
  mistral: {letters: 'Mi', title: 'Mistral'},
  'gpt-oss': {letters: 'O', title: 'OpenAI'},
  phi: {letters: 'Ph', title: 'Phi'},
  giga: {letters: 'Gi', title: 'Sber / Giga'},
  ttech: {letters: 'T', title: 'T-Tech'},
  other: {letters: 'AI', title: 'Model'},
};

export function detectModelFamily(name: string): ModelFamily {
  const n = name.toLowerCase();
  if (/gigaam|gigachat|гигаам|гигачат|\bsber\b/.test(n)) return 'giga';
  if (/t-search|tsearch|\bt-pro\b|\bt-lite\b|t-tech|tbank|т-банк|т банк/.test(n)) {
    return 'ttech';
  }
  if (/whisper/.test(n)) return 'gpt-oss';
  if (/qwen/.test(n)) return 'qwen';
  if (/glm|zhipu|злм/.test(n)) return 'glm';
  if (/kimi|moonshot/.test(n)) return 'kimi';
  if (/deepseek/.test(n)) return 'deepseek';
  if (/llama|\bmeta\b/.test(n)) return 'llama';
  if (/gemma|\bgoogle\b/.test(n)) return 'gemma';
  if (/mixtral/.test(n)) return 'mixtral';
  if (/devstral|mistral/.test(n)) return 'mistral';
  if (/gpt-oss|openai/.test(n)) return 'gpt-oss';
  if (/\bphi\b|phi-?\d/.test(n)) return 'phi';
  return 'other';
}
