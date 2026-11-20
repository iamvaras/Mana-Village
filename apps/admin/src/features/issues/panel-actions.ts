import type { WorkflowAction } from '@mana/core';

// Kept out of the client component so server pages can use the value too.
/** Actions this panel handles. Work and closing actions come in later phases. */
export const PANEL_ACTIONS = [
  'start_review',
  'verify',
  'reject',
  'mark_duplicate',
  'assign',
  'reassign',
  'reconsider',
] as const satisfies readonly WorkflowAction[];
export type PanelAction = (typeof PANEL_ACTIONS)[number];
