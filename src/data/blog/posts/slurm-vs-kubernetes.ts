import type {BlogPost} from '@/data/blog';

export const slurmVsKubernetesPost: BlogPost = {
  slug: 'slurm-vs-kubernetes',
  date: '2026-07-26',
  series: 'AI-инфраструктура',
  title: 'Slurm vs Kubernetes: обучение, batch и online inference на GPU',
  seoTitle: 'Slurm vs Kubernetes для GPU: обучение, gang scheduling и inference',
  description:
    'Сравнение Slurm и Kubernetes для distributed training, batch workloads и online inference: gang scheduling, Kueue, Volcano, JobSet, Slinky, утилизация GPU и FinOps-выбор стека.',
  lead:
    '64 GPU уже выделены планировщиком, но обучение не делает ни одной итерации: часть процессов ждёт rendezvous, карты заняты, счётчик часов крутится. Разбираем, чем Slurm отличается от Kubernetes для обучения, batch и online inference — и какой выбор снижает простой дорогой capacity.',
  tags: ['ai', 'finops'],
  keywords: [
    'Slurm',
    'Kubernetes',
    'Slurm vs Kubernetes',
    'distributed training',
    'gang scheduling',
    'Kueue',
    'Volcano',
    'JobSet',
    'Kubeflow Trainer',
    'GPU scheduler',
    'inference',
    'GPU utilization',
    'обучение LLM',
    'GPU кластер',
    'AI инфраструктура',
  ],
  readingMinutes: 17,
  sources: [
    {
      label: 'SchedMD — документация Slurm',
      url: 'https://slurm.schedmd.com/documentation.html',
    },
    {
      label: 'Slurm Containers Guide',
      url: 'https://slurm.schedmd.com/containers.html',
    },
    {
      label: 'Slinky — Slurm и Kubernetes',
      url: 'https://slurm.schedmd.com/slinky.html',
    },
    {
      label: 'Kubernetes — Gang Scheduling (alpha)',
      url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/gang-scheduling/',
    },
    {
      label: 'Kubernetes — PodGroup API',
      url: 'https://kubernetes.io/docs/concepts/workloads/podgroup-api/',
    },
    {
      label: 'Kubernetes v1.34: DRA graduated to GA',
      url: 'https://kubernetes.io/blog/2025/09/01/kubernetes-v1-34-dra-updates/',
    },
    {
      label: 'Kubernetes v1.36: Workload-Aware Scheduling',
      url: 'https://kubernetes.io/blog/2026/05/13/kubernetes-v1-36-advancing-workload-aware-scheduling/',
    },
    {
      label: 'Kueue — All-or-nothing Scheduling',
      url: 'https://kueue.sigs.k8s.io/docs/concepts/all_or_nothing/',
    },
    {
      label: 'Volcano — PodGroup',
      url: 'https://volcano.sh/docs/concepts/podgroup/',
    },
    {
      label: 'JobSet overview',
      url: 'https://jobset.sigs.k8s.io/docs/overview/',
    },
    {
      label: 'Kubeflow Trainer v2 — миграция',
      url: 'https://www.kubeflow.org/docs/components/trainer/operator-guides/migration/',
    },
    {
      label: 'LeaderWorkerSet',
      url: 'https://lws.sigs.k8s.io/',
    },
  ],
  body: [
    {
      type: 'p',
      text: 'Кластер выделил восемь узлов по восемь GPU. В мониторинге карты «заняты». В логах — таймаут на rendezvous: часть ranks так и не поднялась. Полезная работа равна нулю, а биллинг уже считает GPU-часы.',
    },
    {
      type: 'p',
      text: 'Такая картина чаще всего возникает не из‑за «плохого фреймворка», а из‑за несовпадения контракта планировщика с моделью нагрузки. Крупное синхронное обучение хочет группу ресурсов сразу. Онлайн‑сервис хочет непрерывно доступные реплики. Batch inference — очередь конечных задач. Один и тот же набор GPU может обслуживать все три режима, но один и тот же control plane делает это с разной ценой.',
    },
    {
      type: 'p',
      text: 'Ниже — инженерное сравнение **Slurm** и **Kubernetes** для distributed training, batch workloads и online inference. После статьи можно ответить: какой стек ближе к вашей нагрузке, где хватит ванильного kube-scheduler, а где нужны Kueue, Volcano, JobSet или Slinky — и где именно теряется утилизация GPU.',
    },

    {type: 'h2', text: 'Коротко: если нужна только суть'},
    {
      type: 'ul',
      items: [
        '**Slurm** — workload manager и scheduler: очередь, выделение ресурсов (allocation), fair-share, backfill, preemption, topology. Сильная сторона — batch и крупный multi-node train.',
        '**Kubernetes** — оркестратор желаемого состояния: Pod, Deployment, Service, probes, rolling update, autoscaling. Сильная сторона — online serving и облачный GitOps‑контур.',
        'Формула «Slurm = train, Kubernetes = inference» — удобная эвристика, но не правило. На Kubernetes успешно учат; на Slurm запускают и долгоживущие процессы, и batch inference.',
        'Ванильный kube-scheduler планирует Pod по одному. Gang / all-or-nothing семантика появляется через **alpha**‑функции Kubernetes (с 1.35), через Kueue/Volcano или через альтернативный scheduler.',
        'Kueue и Volcano — разные механизмы. Kueue ближе к quota / placement-aware admission и timeout-based eviction. Volcano как batch scheduler даёт gang через PodGroup / minMember.',
        'FinOps‑боль — не логотип в README, а GPU, которые уже выделены или удерживаются, но не выполняют полезную работу.',
      ],
    },

    {type: 'h2', text: 'Что именно планирует и контролирует Slurm'},
    {
      type: 'p',
      text: 'Slurm (Simple Linux Utility for Resource Management по поздней расшифровке; имя появилось раньше аббревиатуры) — открытый workload manager. Его развивает SchedMD (с 2025–2026 в составе NVIDIA). На дату публикации актуальная ветка — **26.05** (релиз 26.05.2 от июля 2026).',
    },
    {
      type: 'p',
      text: 'По документации SchedMD у Slurm три базовые функции: выделить ресурсы пользователю на время, запустить и контролировать работу на этих ресурсах, разрешать конкуренцию через очередь и политики. Это не «просто очередь» и не только bare metal.',
    },
    {
      type: 'p',
      text: 'Полезный словарь:',
    },
    {
      type: 'ul',
      items: [
        '**Node** — вычислительный узел.',
        '**Partition** — логическая группа узлов с лимитами и ACL; ближе к «очереди с политикой», чем к Kafka‑топику.',
        '**Job** — заявка на ресурсы и работу; после выделения получает **allocation**.',
        '**Job step** — запуск задач внутри уже выделенного allocation (часто через `srun`).',
        '**Task / rank** — единица параллельной работы внутри step; в distributed training rank обычно соответствует процессу фреймворка.',
        '**TRES / GRES** — учитываемые ресурсы (CPU, память, GPU и др.).',
        '**Priority, fair-share, backfill, preemption, reservation, requeue** — механизмы очереди и политики кластера.',
      ],
    },
    {
      type: 'p',
      text: 'Важная оговорка: allocation не гарантирует успешное завершение. Job может упасть, попасть под preemption, быть отменён, перезапущен (`requeue`) или восстановлен из checkpoint — в зависимости от конфигурации и приложения. Slurm обещает управляемое выделение и запуск, а не «успех обучения».',
    },
    {
      type: 'p',
      text: 'Контейнеры поддерживаются. Встроенный путь — OCI через `oci.conf` и `--container`. Отдельно распространены SPANK‑плагины вроде **Pyxis + Enroot**. Утверждение «Slurm не умеет контейнеры» устарело; другое дело, что UX и экосистема отличаются от Kubernetes.',
    },
    {
      type: 'p',
      text: 'Типичный пользовательский интерфейс:',
    },
    {
      type: 'ul',
      items: [
        '`sbatch` — поставить batch job в очередь.',
        '`salloc` — получить allocation интерактивно.',
        '`srun` — запустить job step на выделенных ресурсах.',
      ],
    },
    {
      type: 'p',
      text: 'Упрощённая, но рабочая схема multi-node запуска PyTorch через Slurm и `torchrun`. Один task на узел поднимает `torchrun`, который создаёт восемь процессов на узле; world size = 8 узлов × 8 процессов = 64. Rendezvous — на первом узле allocation:',
    },
    {
      type: 'pre',
      text: `#!/bin/bash
#SBATCH --job-name=train-llm
#SBATCH --nodes=8
#SBATCH --ntasks-per-node=1
#SBATCH --gpus-per-node=8
#SBATCH --time=48:00:00
#SBATCH --partition=gpu

# Упрощённая схема: один torchrun на узел, 8 процессов на узел.
export MASTER_ADDR=$(scontrol show hostnames "$SLURM_JOB_NODELIST" | head -n 1)
export MASTER_PORT=29500

srun --ntasks-per-node=1 --gpus-per-node=8 \\
  torchrun \\
    --nnodes="$SLURM_NNODES" \\
    --nproc_per_node=8 \\
    --rdzv_backend=c10d \\
    --rdzv_endpoint="\${MASTER_ADDR}:\${MASTER_PORT}" \\
    --rdzv_id="$SLURM_JOB_ID" \\
    train.py`,
    },
    {
      type: 'p',
      text: 'Без `nnodes`, `nproc_per_node`, endpoint rendezvous и согласованного размещения tasks по узлам конструкция вида `srun torchrun --nproc_per_node=8 train.py` для multi-node обычно недостаточна: процессы не договорятся о world size и ranks.',
    },

    {type: 'h2', text: 'Что именно планирует и контролирует Kubernetes'},
    {
      type: 'p',
      text: 'Kubernetes держит **желаемое состояние**. Базовая единица планирования — **Pod**. Вокруг него — Deployment, StatefulSet, Job, Service, Ingress, HPA/VPA, операторы. Control plane сверяет факт с манифестом: упавший Pod нужно заменить, реплики — довести до числа, сервис — оставить доступным.',
    },
    {
      type: 'p',
      text: 'Это другая модель контракта. Kubernetes силён там, где нагрузка — долгоживущий сервис с probes, rolling update и autoscaling. GPU он научился видеть давно через device plugin (`nvidia.com/gpu` и аналоги). С Kubernetes **1.34** ядро **Dynamic Resource Allocation (DRA)** стало **stable (GA)**: workload описывает требования к устройствам через ResourceClaim, драйверы публикуют атрибуты, scheduler учитывает их при размещении. Часть расширений DRA в 1.35–1.36 ещё в beta/alpha — зрелость нужно смотреть по конкретной функции, а не по слову «DRA» целиком.',
    },
    {
      type: 'p',
      text: 'Но DRA отвечает на вопрос «какое устройство и с какими свойствами», а не автоматически решает gang scheduling. Базовый kube-scheduler по умолчанию всё ещё оценивает Pod независимо. Групповая семантика — отдельный слой.',
    },
    {
      type: 'aside',
      label: 'Слои, которые нельзя смешивать',
      text: 'Базовый Kubernetes ≠ kube-scheduler plugins ≠ alpha/beta feature gates ≠ SIG‑проекты (JobSet, Kueue) ≠ альтернативные scheduler (Volcano) ≠ vendor‑решения. Фраза «Kubernetes не умеет X» почти всегда требует уточнения версии и компонента.',
    },

    {type: 'h2', text: 'Почему крупное синхронное обучение требует особой семантики'},
    {
      type: 'p',
      text: 'Возьмём классический синхронный DDP на 8 узлах × 8 GPU. Обычно это 64 процесса (по одному CUDA‑устройству на процесс), `world_size=64`, у каждого процесса свой `rank`, общий rendezvous endpoint. На каждой итерации ranks обмениваются градиентами через NCCL; для multi-node критичны Ethernet/RoCE/InfiniBand и топология GPU (NVLink внутри узла, сеть между узлами).',
    },
    {
      type: 'p',
      text: 'Если стартовали только 48 из 64 процессов, синхронный train часто не делает полезных шагов: либо висит на init/rendezvous, либо падает. При этом уже запущенные процессы могут удерживать GPU. С точки зрения планировщика ресурсы «заняты»; с точки зрения модели — простой.',
    },
    {
      type: 'p',
      text: 'Не любое распределённое обучение требует жёсткого одновременного старта всех ranks на весь срок жизни job. Есть elastic и fault-tolerant режимы, checkpoint/restart, изменение world size, короткие fine-tune на одном‑двух узлах. Но для крупного синхронного pre-training all-or-nothing при старте — типичное и дорогое требование.',
    },
    {
      type: 'p',
      text: 'Именно здесь проявляется разница механизмов:',
    },
    {
      type: 'ul',
      items: [
        'независимое планирование Pod;',
        'quota-based admission («квота на весь workload есть»);',
        'placement-aware admission («квота есть и физически помещается»);',
        'timeout-based eviction («не все Pod Ready — выселить и вернуть в очередь»);',
        'строгий gang scheduling с атомарным bind группы;',
        'capacity provisioning до допуска workload (например, через ProvisioningRequest).',
      ],
    },

    {
      type: 'h2',
      text: 'Что умеет экосистема Kubernetes для batch и training на середину 2026',
    },
    {
      type: 'h3',
      text: 'Нативный gang scheduling — alpha',
    },
    {
      type: 'p',
      text: 'С Kubernetes **1.35** в документации описан **Gang Scheduling** как **alpha** (feature gate `GangScheduling`, по умолчанию выключен). Он опирается на **PodGroup API** (`scheduling.k8s.io/v1alpha2`) и связанный Workload API. В **1.36** архитектуру уточнили: Workload — шаблон политики, PodGroup — runtime‑объект группы; у kube-scheduler появился отдельный цикл планирования PodGroup и первые шаги topology-aware scheduling / workload-aware preemption (тоже за feature gates).',
    },
    {
      type: 'p',
      text: 'Это важный сдвиг: больше нельзя честно писать «в Kubernetes нет gang scheduling» без оговорки. Но на дату публикации это **не production-default**: alpha, opt-in, ограничения по формам workload ещё снимаются. Для большинства кластеров рабочий путь по-прежнему — Kueue, Volcano, JobSet + политики очереди или внешний scheduler.',
    },

    {type: 'h3', text: 'Kueue: admission, а не «ещё один Volcano»'},
    {
      type: 'p',
      text: '**Kueue** (SIG‑проект) управляет допуском Job/Workload в кластер: LocalQueue → ClusterQueue, резервирование квоты, приоритеты, preemption на уровне очередей, MultiKueue, интеграция с autoscaling через AdmissionCheck / ProvisioningRequest.',
    },
    {
      type: 'p',
      text: 'Официальная документация прямо называет all-or-nothing «приближением» gang scheduling и раскладывает его на слои:',
    },
    {
      type: 'ol',
      items: [
        '**Quota-based admission** — workload не снимают с suspend, пока нельзя зарезервировать квоту для всех pod sets сразу (partial admission — отдельная опция).',
        '**Topology-Aware Scheduling (TAS)** — перед admission проверяется, что Pod реально помещаются в topology domains; иначе «8 GPU в квоте» могут оказаться размазаны по узлам так, что крупный Pod никогда не встанет.',
        '**waitForPodsReady** — после admission, если не все Pod стали Ready за timeout, workload выселяют и возвращают в очередь; `blockAdmission` снижает риск взаимной блокировки двух частично стартовавших job.',
        '**ProvisioningRequest** — для автоскейла capacity: не запускать работу, пока провайдер не подтвердил или не попытался выделить узлы.',
      ],
    },
    {
      type: 'p',
      text: 'Итого: Kueue отлично закрывает очередь, квоты и admission‑политику. Это не то же самое, что атомарный gang bind альтернативного scheduler, хотя на практике комбинация quota + TAS + waitForPodsReady часто достаточна.',
    },

    {type: 'h3', text: 'Volcano: batch scheduler с PodGroup'},
    {
      type: 'p',
      text: '**Volcano** — отдельный batch system для Kubernetes: собственный scheduler, очереди, **PodGroup**, `minMember` / `minAvailable`. Если кластер не может удовлетворить минимум группы, Volcano не стартует членов группы по одному. Это ближе к классической gang‑семантике HPC‑планировщика, но ценой ещё одного scheduler в control plane и своей операционной модели.',
    },

    {type: 'h3', text: 'JobSet, LeaderWorkerSet, Kubeflow Trainer'},
    {
      type: 'ul',
      items: [
        '**JobSet** (`jobset.sigs.k8s.io`, API **v1alpha2**) — группа Kubernetes Job как единый distributed workload; удобная база для training/HPC на Kubernetes.',
        '**LeaderWorkerSet** — API для групп leader/worker, особенно multi-host **inference**; API group `leaderworkerset.x-k8s.io/v1`.',
        '**Kubeflow Trainer v2** переходит от framework‑specific CRD (`PyTorchJob`, `TFJob`, `MPIJob`) к унифицированному **TrainJob** (`trainer.kubeflow.org/v1alpha1`) поверх JobSet. Интеграции с Trainer v1 в экосистеме уже помечают как deprecated.',
      ],
    },
    {
      type: 'p',
      text: 'Практический вывод: «мы учим на Kubernetes» почти всегда значит «Kubernetes плюс слой admission/orchestration». Вопрос не в возможности, а в том, сколько семантики Slurm вы готовы собрать сами.',
    },

    {type: 'h2', text: 'Где Slurm удобнее, а где Kubernetes'},
    {
      type: 'p',
      text: 'Slurm обычно выигрывает, когда доминируют конечные job с жёсткими требованиями к комплекту ресурсов: multi-node pre-training, тяжёлый synchronous fine-tune, исследовательский HPC‑контур, привычный UX `sbatch`/`srun`, зрелые fair-share и backfill на общем кластере.',
    },
    {
      type: 'p',
      text: 'Kubernetes обычно выигрывает, когда доминирует продуктовый контур: online API, canary/rolling update, service mesh/gateway, GitOps, единый observability‑стек с остальными микросервисами, автоскейл реплик по нагрузке.',
    },
    {
      type: 'ul',
      items: [
        '**Крупный multi-node / долгий pre-train** — очередь и gang/all-or-nothing; часто Slurm или Kubernetes с явным batch‑слоем.',
        '**Короткий fine-tune на 1–2 узлах в уже живом GitOps** — Kubernetes обычно достаточен.',
        '**Ноутбуки + ночные batch + редкий крупный train** — либо Kubernetes с Kueue/Volcano, либо честный dual-stack.',
        '**Единый control plane любой ценой** — возможно, но сложность никуда не исчезает: она переезжает в операторы, feature gates и политики admission.',
      ],
    },

    {type: 'h2', text: 'Online и batch inference — разные задачи'},
    {
      type: 'p',
      text: 'Слово «инференс» в ТЗ стоит уточнять сразу.',
    },
    {
      type: 'ul',
      items: [
        '**Online / latency-sensitive serving** — chat API, поиск, стриминг токенов, SLA по p95/p99. Здесь естественны Deployment/LeaderWorkerSet, Service, readiness/liveness, rolling update, HPA. Kubernetes — распространённая, но не единственная база.',
        '**Batch / offline inference** — прогон корпуса, пересчёт эмбеддингов, ночной rerank. Это очередь конечных задач: спокойно живёт и как Slurm job, и как Job/CronJob/JobSet в Kubernetes.',
        '**Stateful / multi-host serving** — шардированная модель на несколько узлов. На Kubernetes для этого активно используют LeaderWorkerSet и родственные API; на Slurm тоже можно держать долгоживущие процессы, но эксплуатационная модель (деплой, прогрев, drain, автоскейл) будет другой.',
      ],
    },
    {
      type: 'p',
      text: 'Slurm умеет долгоживущие процессы. Слабое место не в «невозможности inference», а в том, что его основной контракт — allocation с лимитом времени и политиками очереди, а не Deployment с probes и прогрессивным rollout. Для user-facing API это обычно дороже в сопровождении.',
    },

    {type: 'h2', text: 'Отказоустойчивость: checkpoint, preemption, recovery'},
    {
      type: 'p',
      text: 'В training‑контуре отказоустойчивость почти всегда строится вокруг **checkpoint/restart**, а не вокруг «Pod сам воскреснет и продолжит ту же итерацию». И Slurm, и Kubernetes могут перезапустить задачу; вопрос — сохранил ли framework состояние и согласованы ли ranks после рестарта.',
    },
    {
      type: 'ul',
      items: [
        '**Slurm**: preemption, requeue, time limit, reservation; поведение зависит от Partition и Priority. Падение узла или вытеснение job — штатный сценарий для зрелого HPC‑кластера.',
        '**Kubernetes**: RestartPolicy, Job backoff, PodFailurePolicy, eviction; для группы нужна политика уровня JobSet/Trainer/Kueue (`recoveryTimeout` и аналоги).',
        '**Elastic training** снижает требование «все 64 ranks или ничего на весь срок», но усложняет код и воспроизводимость.',
      ],
    },
    {
      type: 'p',
      text: 'Для online inference цель другая: пользователь не должен заметить смерть реплики. Здесь сильны health checks, pod disruption budgets и постепенный rollout — то, под что Kubernetes проектировали изначально.',
    },

    {
      type: 'h2',
      text: 'FinOps: queue time, fragmentation и полезная работа GPU',
    },
    {
      type: 'p',
      text: 'Планировщик не меняет прайс карты. Он меняет, какая доля оплаченного времени превращается в полезные kernels. Различайте уровни:',
    },
    {
      type: 'ul',
      items: [
        'GPU зарезервирована scheduler / квотой;',
        'GPU выделена процессу или контейнеру;',
        'создан CUDA context;',
        'идут полезные kernels;',
        'занята память GPU;',
        'SM / tensor-core utilization;',
        'доля wall-clock, когда workload реально обучается или обслуживает запросы.',
      ],
    },
    {
      type: 'p',
      text: 'Pending workload сам по себе не всегда создаёт расход. В on-demand облаке часто платят за уже запущенные инстансы и удерживаемые GPU. В reserved / dedicated кластере плата идёт за capacity независимо от очереди. В managed training стоимость иногда начинается только после фактического выделения. Модель поставки важнее лозунга «очередь бесплатна».',
    },
    {
      type: 'p',
      text: 'Типичные дыры:',
    },
    {
      type: 'ol',
      items: [
        '**Частичный старт** — 48 из 64 GPU удерживаются, синхронный train не идёт.',
        '**Фрагментация** — суммарно GPU хватает, но ни один комплект узлов не собирается под topology/size constraints.',
        '**Очередь без fair-share/backfill** — длинные эксперименты блокируют короткие; или наоборот, «слоны» голодают.',
        '**Train и online inference в одном пуле без изоляции** — p99 сервиса и сходимость обучения мешают друг другу.',
        '**Dual-stack без capacity planning** — два operational tax и два разрозненных пула GPU.',
      ],
    },
    {
      type: 'p',
      text: 'Сверить публичные тарифы GPU в облаках России удобно в [каталоге GPU](/gpu) и [калькуляторе](/calculator). Цифра за карту — одно. Вопрос, какой планировщик не даст ей простаивать в полузапущенном train, — другое.',
    },

    {type: 'h2', text: 'Dual-stack и современные мосты'},
    {
      type: 'p',
      text: 'Паттерн **train на Slurm, serve на Kubernetes** остаётся нормальной индустриальной схемой. Миры сближаются, но не сливаются в один простой продукт.',
    },
    {
      type: 'p',
      text: '**Slinky** (SchedMD) — набор проектов интеграции:',
    },
    {
      type: 'ul',
      items: [
        '**slurm-operator** — запускать и сопровождать кластер Slurm на Kubernetes (демоны как Pod/CRD), сохраняя пользовательский UX Slurm.',
        '**slurm-bridge** — использовать Slurm как scheduler для выбранных Kubernetes workload (Pod/Job/JobSet/LeaderWorkerSet): Kubernetes подаёт заявку, Slurm решает placement, затем pods bindятся на выделенные узлы.',
      ],
    },
    {
      type: 'p',
      text: 'Это снижает стоимость «двух миров», но добавляет компоненты, версии и failure modes. Единый control plane — не бесплатная абстракция.',
    },

    {type: 'h2', text: 'Матрица выбора'},
    {
      type: 'table',
      caption: 'Сравнение по эксплуатационным осям. «Через компонент» значит: не ванильный kube-scheduler / не дефолтный Slurm без настройки.',
      headers: ['Ось', 'Slurm', 'Kubernetes'],
      rows: [
        [
          'Основная модель',
          'Batch job + allocation на время',
          'Желаемое состояние сервисов и контроллеров',
        ],
        [
          'Единица планирования',
          'Job / step / task на nodes + TRES/GRES',
          'Pod; группы — через PodGroup/JobSet/операторы',
        ],
        [
          'Queue и admission',
          'Partition, priority, QOS, reservations',
          'Через Kueue / Volcano queues; иначе etcd+scheduler',
        ],
        [
          'Gang / all-or-nothing',
          'Нативная модель выделения комплекта ресурсов',
          'Alpha GangScheduling; иначе Kueue/Volcano/мосты',
        ],
        [
          'Topology awareness',
          'Зрелые HPC‑механизмы и GRES/topology плагины',
          'DRA + scheduler plugins; TAS в Kueue; alpha в 1.36',
        ],
        [
          'Fair-share и приоритеты',
          'Встроенные multifactor / fair-share',
          'PriorityClass + политики Kueue/Volcano',
        ],
        [
          'Preemption',
          'Штатно настраивается',
          'Есть; workload-aware — за feature gates / политиками',
        ],
        [
          'Autoscaling capacity',
          'Возможен, но не «родной» облачный UX',
          'Cluster Autoscaler, ProvisioningRequest, node pools',
        ],
        [
          'Failure recovery',
          'requeue, checkpoint/restart приложения',
          'контроллеры + JobSet/Trainer политики + checkpoints',
        ],
        [
          'Long-running services',
          'Возможно, эксплуатационно менее удобно',
          'Сильная сторона (Deployment/Service/probes)',
        ],
        [
          'Distributed training',
          'Очень сильная сторона',
          'Сильно с JobSet/Trainer + admission/gang слоем',
        ],
        [
          'Online inference',
          'Возможно, редко оптимальный UX',
          'Сильная сторона; multi-host — LWS и аналоги',
        ],
        [
          'API и UX',
          'sbatch/salloc/srun, REST/API опционально',
          'YAML/API/GitOps, kubectl, операторы',
        ],
        [
          'Контейнеры',
          'OCI, Pyxis/Enroot и др.',
          'Базовая модель runtime',
        ],
        [
          'Observability',
          'sacct/sstat + внешний стек',
          'Метрики/логи/traces экосистемы cloud-native',
        ],
        [
          'Operational complexity',
          'Высокая в HPC‑кластере, привычная HPC‑команде',
          'Высокая в platform‑команде; растёт с batch‑надстройками',
        ],
      ],
    },

    {type: 'h2', text: 'Как выбрать'},
    {
      type: 'ol',
      items: [
        'Нагрузка **конечная** (job) или **непрерывная** (сервис)?',
        'Нужен ли старт **комплектом** ресурсов / ranks сразу?',
        'Есть ли **user-facing SLA** по latency и доступности?',
        'Команда уже живёт в **sbatch** или в **YAML/GitOps**?',
        'Готовы ли вы сопровождать **второй слой** (Kueue/Volcano/Slinky), если выбираете один control plane?',
      ],
    },
    {
      type: 'ul',
      items: [
        'Исследовательский контур и крупный pre-train → **Slurm** или Kubernetes с явным batch/gang стеком.',
        'Продуктовый API и автоскейл serving → **Kubernetes**.',
        'И то и другое всерьёз → часто **оба**, с явными квотами GPU между контурами.',
        'Один control plane → Kueue/Volcano/JobSet/Trainer или Slinky; закладывайте операционную сложность заранее.',
      ],
    },

    {type: 'h2', text: 'Вывод'},
    {
      type: 'p',
      text: 'Slurm и Kubernetes закрывают разные контракты с GPU‑кластером. Первый исторически заточен под управляемое выделение ресурсов для batch и крупного параллельного train. Второй — под долгоживущие сервисы и облачную платформенную модель. К 2026 году Kubernetes заметно подтянул device management (DRA GA) и начал нативный gang‑путь (пока alpha), а вокруг него созрели Kueue, JobSet, Trainer v2 и Slinky. Это не отменяет выбор — это делает его более точным.',
    },
    {
      type: 'p',
      text: 'Если после статьи останется одна рабочая формулировка: выбирайте не логотип, а семантику планирования под свою доминирующую нагрузку — и считайте простой GPU там, где ресурсы уже удерживаются, а полезной работы ещё нет.',
    },
  ],
};
