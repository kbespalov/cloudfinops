import {runChat} from './harness';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';

async function main() {
  const q = process.argv[2] || 'Сколько стоит NVIDIA H100 в час и кто из провайдеров его предлагает?';
  const t0 = Date.now();
  const res = await runChat(SYSTEM_PROMPT, q);
  console.log('Q:', q);
  console.log('tools:', res.toolCalls.map((c) => `${c.name}(${c.arguments})`).join(' | '));
  console.log('---answer---');
  console.log(res.answer);
  if (res.error) console.log('ERROR:', res.error);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
main();
