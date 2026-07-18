import { randomUUID } from 'crypto';

export const SN_NUMBER_PREFIXES: Record<string, string> = {
  incident: 'INC',
  sc_request: 'REQ',
  sc_req_item: 'RITM',
  sc_task: 'SCTASK',
  change_request: 'CHG',
  problem: 'PRB',
  kb_article: 'KB',
  kb_knowledge: 'KB',
  release_task: 'RTASK',
  cmdb_ci: 'CI',
};

export const SN_INITIAL_STATE: Record<string, string> = {
  incident: '1',
  sc_request: '1',
  sc_req_item: '1',
  sc_task: '1',
  change_request: '-5',
  problem: '1',
};

export const SN_RESOLVED_STATE: Record<string, string> = {
  incident: '6',
  sc_request: '3',
  sc_req_item: '3',
  sc_task: '3',
  change_request: '0',
  problem: '4',
};

export const SN_CLOSED_STATE: Record<string, string> = {
  incident: '7',
  sc_request: '3',
  sc_req_item: '3',
  sc_task: '3',
  change_request: '3',
  problem: '4',
};

export const SN_CLOSING_STATES: Record<string, Set<string>> = {
  incident: new Set(['6', '7']),
  sc_request: new Set(['3', '4']),
  sc_req_item: new Set(['3', '4']),
  sc_task: new Set(['3', '4']),
  change_request: new Set(['0', '3']),
  problem: new Set(['4']),
};

export const SN_STATE_LABELS: Record<string, Record<string, string>> = {
  incident: {
    '1': 'New',
    '2': 'In Progress',
    '3': 'On Hold',
    '6': 'Resolved',
    '7': 'Closed',
    '8': 'Canceled',
  },
  sc_request: {
    '1': 'Open',
    '2': 'Work in Progress',
    '3': 'Closed Complete',
    '4': 'Closed Incomplete',
    '7': 'Canceled',
  },
  sc_req_item: {
    '1': 'Open',
    '2': 'Work in Progress',
    '3': 'Closed Complete',
    '4': 'Closed Incomplete',
    '7': 'Canceled',
  },
  sc_task: {
    '1': 'Open',
    '2': 'Work in Progress',
    '3': 'Closed Complete',
    '4': 'Closed Incomplete',
    '7': 'Canceled',
  },
  change_request: {
    '-5': 'New',
    '-4': 'Assess',
    '-3': 'Authorize',
    '-2': 'Scheduled',
    '-1': 'Implement',
    '0': 'Review',
    '3': 'Closed',
  },
  problem: {
    '1': 'Open',
    '2': 'Known Error',
    '3': 'Pending Change',
    '4': 'Closed/Resolved',
  },
};

export function mapIncomingState(
  tableName: string,
  incoming: unknown,
): string | null {
  if (incoming === undefined || incoming === null) return null;
  const s = String(incoming as string | number).trim();
  if (/^-?\d+$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'resolved') return SN_RESOLVED_STATE[tableName] ?? '6';
  if (lower === 'closed') return SN_CLOSED_STATE[tableName] ?? '7';
  if (lower === 'open' || lower === 'new')
    return SN_INITIAL_STATE[tableName] ?? '1';
  if (
    lower === 'in_progress' ||
    lower === 'in progress' ||
    lower === 'work in progress'
  )
    return '2';
  if (lower === 'on_hold' || lower === 'on hold') return '3';
  if (lower === 'canceled' || lower === 'cancelled') return '8';
  return s;
}

export function isClosingState(tableName: string, state: string): boolean {
  return (SN_CLOSING_STATES[tableName] ?? new Set(['6', '7'])).has(state);
}

export function getStateLabel(tableName: string, state: string): string {
  return SN_STATE_LABELS[tableName]?.[state] ?? state;
}

export function toSnowDate(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

export function toSysId(): string {
  return randomUUID().replace(/-/g, '');
}
