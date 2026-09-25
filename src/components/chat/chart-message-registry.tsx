'use client';

import {createMessageRendererRegistry, registerMessageRenderer} from '@gravity-ui/aikit';
import type {TMessageContent} from '@gravity-ui/aikit';
import type {ChatChartSpec} from '@/lib/chat/chart-spec';
import {ChatChart} from './ChatChart';

export type ChartMessageContent = TMessageContent<'chart', ChatChartSpec>;

const registry = createMessageRendererRegistry();
registerMessageRenderer<ChartMessageContent>(registry, 'chart', {
  component: ({part}) => <ChatChart spec={part.data} />,
});

export const chartMessageRegistry = registry;
