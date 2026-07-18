import type {CSSProperties} from 'react';
import {Flex, Icon, Text} from '@gravity-ui/uikit';
import {Code} from '@gravity-ui/icons';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  CALCULATOR_PROVIDER_IDS,
  CALCULATOR_PROVIDER_NAMES,
} from '@/lib/calculator/quote-view';
import styles from './ApiPage.module.css';

function FlowConnector({
  className,
  delay,
}: {
  className: string;
  delay: string;
}) {
  return (
    <div
      className={`${styles.connector} ${className}`}
      style={{'--flow-delay': delay} as CSSProperties}
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

export function ApiProviderScan() {
  return (
    <section
      className={styles.pipeline}
      aria-labelledby="api-pipeline-title"
    >
      <Text as="h2" id="api-pipeline-title" className={styles.visuallyHidden}>
        Как один запрос сравнивается у шести облачных провайдеров
      </Text>

      <div className={styles.pipelineFlow}>
        <div className={`${styles.pipelineStep} ${styles.requestStep}`}>
          <Flex direction="column" gap={2}>
            <Text variant="caption-2" color="secondary">
              01 · Конфигурация
            </Text>
            <Text variant="subheader-2">16 vCPU · 64 GiB · 1× H100</Text>
            <code className={styles.requestCode}>POST /v1/quote</code>
          </Flex>
        </div>

        <FlowConnector className={styles.connectorOne} delay="0s" />

        <div className={`${styles.pipelineStep} ${styles.apiStep}`}>
          <span className={styles.apiMark}>
            <Icon data={Code} size={20} />
          </span>
          <Flex direction="column" gap={1}>
            <Text variant="caption-2" color="secondary">
              02 · Единая точка входа
            </Text>
            <Text variant="subheader-2">Cloud FinOps API</Text>
            <Text variant="caption-2" color="secondary">
              Нормализует конфигурацию
            </Text>
          </Flex>
        </div>

        <FlowConnector className={styles.connectorTwo} delay="1.4s" />

        <div className={`${styles.pipelineStep} ${styles.providersStep}`}>
          <Text variant="caption-2" color="secondary">
            03 · Проверка облаков
          </Text>
          <div className={styles.providerGrid} role="list" aria-label="Облачные провайдеры">
            {CALCULATOR_PROVIDER_IDS.map((providerId, index) => (
              <div
                key={providerId}
                className={styles.providerNode}
                style={{'--scan-index': index} as CSSProperties}
                role="listitem"
              >
                <span className={styles.providerMark}>
                  <ProviderMark providerId={providerId} size={16} />
                </span>
                <Text
                  variant="caption-2"
                  ellipsis
                  title={CALCULATOR_PROVIDER_NAMES[providerId]}
                >
                  {CALCULATOR_PROVIDER_NAMES[providerId]}
                </Text>
              </div>
            ))}
          </div>
        </div>

        <FlowConnector className={styles.connectorThree} delay="6.6s" />

        <div className={`${styles.pipelineStep} ${styles.resultStep}`}>
          <Flex direction="column" gap={2}>
            <Text variant="caption-2" color="secondary">
              04 · Единый ответ
            </Text>
            <Text variant="subheader-2">Лучший оффер</Text>
            <Text variant="caption-2" color="secondary">
              Цена · состав · доступность · источник
            </Text>
          </Flex>
        </div>
      </div>
    </section>
  );
}
