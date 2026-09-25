'use client';

import ChartKit, {settings} from '@gravity-ui/chartkit';
import {GravityChartsPlugin} from '@gravity-ui/chartkit/gravity-charts';
import {Card, Flex, Text} from '@gravity-ui/uikit';
import type {ChatChartSpec} from '@/lib/chat/chart-spec';
import styles from './ChatChart.module.css';

let pluginsReady = false;

function ensureChartPlugins() {
  if (pluginsReady) return;
  settings.set({plugins: [GravityChartsPlugin]});
  pluginsReady = true;
}

/** Same series colors as the playground chat chart, so bars stay distinguishable. */
const SERIES_COLORS = [
  '#4DA2F1',
  '#5DC990',
  '#F2A93A',
  '#E66F6F',
  '#A57BD6',
  '#37C0AC',
  '#FFB454',
  '#7D8DFB',
];

export function ChatChart({spec}: {spec: ChatChartSpec}) {
  ensureChartPlugins();
  const data = buildChartKitData(spec);
  return (
    <Card type="container" view="outlined" spacing={{p: 3}} className={styles.card}>
      <Flex direction="column" gap={2}>
        {spec.title ? <Text variant="subheader-2">{spec.title}</Text> : null}
        <div className={styles.plot}>
          <ChartKit type="gravity-charts" data={data} />
        </div>
      </Flex>
    </Card>
  );
}

function buildChartKitData(spec: ChatChartSpec) {
  if (spec.kind === 'pie') {
    const valueSeries = spec.series[0];
    const items = spec.categories
      .map((name, index) => ({
        name,
        value: Number(valueSeries?.data[index] ?? 0),
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0);
    return {
      series: {
        data: [
          {
            type: 'pie' as const,
            dataLabels: {enabled: true},
            data: items,
          },
        ],
      },
      legend: {enabled: true},
      tooltip: {
        enabled: true,
        valueFormat: {type: 'number' as const, precision: 2},
      },
    };
  }

  const seriesType =
    spec.kind === 'bar'
      ? ('bar-x' as const)
      : spec.kind === 'area'
        ? ('area' as const)
        : spec.kind === 'scatter'
          ? ('scatter' as const)
          : ('line' as const);

  const seriesData = spec.series.map((series, seriesIndex) => ({
    type: seriesType,
    name: series.name,
    color: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
    data: series.data.map((y, index) => ({x: index, y: Number(y) || 0})),
  }));

  return {
    series: {data: seriesData},
    xAxis: {
      type: 'category' as const,
      categories: spec.categories,
      title: {text: spec.xField},
    },
    yAxis: [
      {
        type: 'linear' as const,
        title: {text: spec.series.length === 1 ? spec.series[0]!.name : ''},
      },
    ],
    chart: {margin: {top: 16, right: 16, bottom: 32, left: 56}},
    legend: {enabled: spec.series.length > 1},
    tooltip: {
      enabled: true,
      valueFormat: {type: 'number' as const, precision: 2},
    },
  };
}
