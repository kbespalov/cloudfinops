import {createHash} from 'node:crypto';
import type {SolutionComponent} from './types';

export function componentId(role: string, provider: string, meterId?: string, qty?: number): string {
  const base = `${role}:${provider}:${meterId ?? 'shape'}:${qty ?? 1}`;
  return `cmp_${createHash('sha1').update(base).digest('hex').slice(0, 10)}`;
}

export function solutionId(
  requirementSpecId: string,
  provider: string,
  components: SolutionComponent[],
): string {
  const parts = components
    .slice()
    .sort((a, b) => a.role.localeCompare(b.role) || (a.meterId ?? '').localeCompare(b.meterId ?? ''))
    .map((c) => `${c.role}:${c.meterId ?? ''}:${c.quantity}`)
    .join(';');
  return `sol_${createHash('sha1')
    .update(`${requirementSpecId}|${provider}|${parts}`)
    .digest('hex')
    .slice(0, 14)}`;
}
