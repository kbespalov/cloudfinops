import {runChat} from './harness';
import {matchFastPath} from '../../src/lib/chat/fast-path';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';

async function main() {
  const q =
    'Собери решение на месяц по провайдерам: ВМ 16 vCPU / 32 GiB / 100 GiB SSD, 1 публичный IP, Object Storage Standard 100 ТБ, исходящий трафик CDN 100 ТБ, 1 зональный мастер Managed Kubernetes. Итоговая таблица с колонками по каждому компоненту, Итого и к минимуму.';
  console.log('fastPath match', matchFastPath(q));
  const r = await runChat(SYSTEM_PROMPT, q);
  const cats = r.toolCalls.map((t) => {
    try {
      const args = JSON.parse(t.arguments) as {category?: string};
      return args.category || t.name;
    } catch {
      return t.name;
    }
  });
  console.log(
    JSON.stringify(
      {
        fastPath: r.fastPath,
        rounds: r.toolRounds,
        tools: r.toolCalls.length,
        cats,
        leaks: [r.leaksRecovered, r.leaksRetried, r.leaksDropped],
        ms: r.durationMs,
        hasCdn: /cdn/i.test(r.answer),
        hasK8s: /k8s|kubernetes|мастер/i.test(r.answer),
        hasS3: /s3|хранилищ|100\s*тб/i.test(r.answer),
        answer: r.answer,
      },
      null,
      2,
    ),
  );
}

main();
