import type { WorkflowAction } from '@mana/core';

// Kept out of the client component so server pages can use the value too.
/** Actions this panel handles. Work steps belong to the worker's phone, confirming to the resident. */
export const PANEL_ACTIONS = [
  'start_review',
  'verify',
  'reject',
  'mark_duplicate',
  'assign',
  'reassign',
  'reconsider',
  'close',
  'reopen',
] as const satisfies readonly WorkflowAction[];
export type PanelAction = (typeof PANEL_ACTIONS)[number];
