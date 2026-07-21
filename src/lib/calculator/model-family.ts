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
  'gpt-oss': {letters: 'O', title: 'gpt-oss'},
  phi: {letters: 'Ph', title: 'Phi'},
  other: {letters: 'AI', title: 'Model'},
};

export function detectModelFamily(name: string): ModelFamily {
  const n = name.toLowerCase();
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
