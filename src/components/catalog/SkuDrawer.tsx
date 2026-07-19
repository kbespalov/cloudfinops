'use client';

import {
  Alert,
  Button,
  ClipboardButton,
  DefinitionList,
  Divider,
  Drawer,
  Flex,
  Icon,
  Label,
  Link,
  Text,
} from '@gravity-ui/uikit';
import {ArrowUpRightFromSquare, Xmark} from '@gravity-ui/icons';
import {
  CATEGORY_TITLE,
  billingUnitLabel,
  displayAmount,
  displayMeterName,
  formatAsOf,
  formatParameterCount,
  formatPlatform,
  isAddressMeter,
  isGatewayMeter,
  isImageMeter,
  isSnapshotMeter,
  isUsageMeter,
  meterPriceLabel,
  paramsLabel,
  resolveMeterSources,
  type CatalogMeter,
  type PeriodMode,
} from '@/lib/catalog';
import {categoryLabelTheme} from '@/lib/labelTheme';
import styles from './SkuDrawer.module.css';

function statusLabel(status: string): string {
  if (status === 'available') return 'Доступен';
  if (status === 'deprecated') return 'Устарел';
  if (status === 'preview') return 'Превью';
  return status;
}

function pricingModeLabel(mode: string): string {
  if (mode === 'bundle') return 'Комплект';
  if (mode === 'component') return 'Покомпонентно';
  return mode;
}

export function SkuDrawer({
  meter,
  period,
  open,
  onClose,
}: {
  meter: CatalogMeter | null;
  period: PeriodMode;
  open: boolean;
  onClose: () => void;
}) {
  const platform = meter ? formatPlatform(meter.cpuPlatformFamily) : null;
  const showPlatform = Boolean(platform && platform !== 'Платформа не указана');
  const params = meter ? paramsLabel(meter) : '';
  const parameterCount = meter ? formatParameterCount(meter) : null;
  const billingUnit =
    meter &&
    (isImageMeter(meter) ||
      isSnapshotMeter(meter) ||
      isAddressMeter(meter) ||
      isGatewayMeter(meter) ||
      isUsageMeter(meter) ||
      meter.unitQuantity === 'GiB')
      ? billingUnitLabel(meter)
      : null;
  const sources = meter ? resolveMeterSources(meter) : [];

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      placement="right"
      size={400}
      contentOverflow="auto"
      aria-label={meter?.name || 'Детали тарифа'}
    >
      {meter ? (
        <div className={styles.root}>
          <div className={styles.header}>
            <Flex justifyContent="space-between" alignItems="center" gap={3}>
              <Label size="s" theme={categoryLabelTheme(meter.categoryKey)}>
                {CATEGORY_TITLE[meter.categoryKey]}
              </Label>
              <Button
                view="flat-secondary"
                size="m"
                onClick={onClose}
                aria-label="Закрыть"
              >
                <Icon data={Xmark} size={18} />
              </Button>
            </Flex>

            <Flex direction="column" gap={2} className={styles.titleBlock}>
              <Text variant="header-1">{displayMeterName(meter)}</Text>
              {displayMeterName(meter) !== meter.name ? (
                <Text variant="body-1" color="secondary">
                  {meter.name}
                </Text>
              ) : null}
              <Flex alignItems="center" gap={1}>
                <Text variant="body-1" color="secondary" className={styles.sku}>
                  {meter.sku}
                </Text>
                <ClipboardButton size="s" view="flat-secondary" text={meter.sku} />
              </Flex>
            </Flex>

            <Flex direction="column" gap={1} className={styles.priceBlock}>
              <Text variant="header-1">{displayAmount(meter, period) ?? '—'}</Text>
              <Text variant="body-1" color="secondary">
                {meterPriceLabel(meter, period)}
              </Text>
            </Flex>
          </div>

          <Divider />

          <div className={styles.section}>
            <DefinitionList nameMaxWidth={120}>
              <DefinitionList.Item name="Провайдер">{meter.providerName}</DefinitionList.Item>
              {meter.region ? (
                <DefinitionList.Item name="Регион">{meter.region}</DefinitionList.Item>
              ) : null}
              {params && params !== '—' ? (
                <DefinitionList.Item name="Конфигурация">{params}</DefinitionList.Item>
              ) : null}
              {parameterCount ? (
                <DefinitionList.Item name="Параметры модели">{parameterCount}</DefinitionList.Item>
              ) : null}
              {billingUnit ? (
                <DefinitionList.Item name="Единица биллинга">{billingUnit}</DefinitionList.Item>
              ) : null}
              {showPlatform ? (
                <DefinitionList.Item name="Платформа">{platform}</DefinitionList.Item>
              ) : null}
              <DefinitionList.Item name="Тарификация">
                {pricingModeLabel(meter.pricingMode)}
              </DefinitionList.Item>
              <DefinitionList.Item name="Статус">{statusLabel(meter.status)}</DefinitionList.Item>
              {meter.checkedAt ? (
                <DefinitionList.Item name="Обновлено">
                  {formatAsOf(meter.checkedAt)}
                </DefinitionList.Item>
              ) : null}
              {meter.effectiveFrom ? (
                <DefinitionList.Item name="Действует с">
                  {formatAsOf(meter.effectiveFrom)}
                </DefinitionList.Item>
              ) : null}
            </DefinitionList>
          </div>

          {sources.length ? (
            <>
              <Divider />
              <div className={styles.section}>
                <Flex direction="column" gap={3}>
                  <Text variant="subheader-2">Источники</Text>
                  <Flex direction="column" gap={2} className={styles.sources}>
                    {sources.map((src) => (
                      <Link
                        key={src.id}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        view="normal"
                        className={styles.sourceLink}
                      >
                        <span className={styles.sourceTitle}>{src.title}</span>
                        <Icon data={ArrowUpRightFromSquare} size={14} />
                      </Link>
                    ))}
                  </Flex>
                </Flex>
              </div>
            </>
          ) : null}

          {meter.notes ? (
            <>
              <Divider />
              <div className={styles.section}>
                <Alert theme="info" view="outlined" title="Пояснение" message={meter.notes} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
