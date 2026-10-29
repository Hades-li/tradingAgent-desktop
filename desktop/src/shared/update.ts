/**
 * Update lifecycle as the renderer sees it. The main process owns the state and
 * pushes every change over `update:state`; the renderer only renders it and
 * asks for the next step.
 */

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; received: number; total: number }
  /** Downloaded while an analysis was running, so it waits for the user. */
  | { phase: 'ready'; version: string }
  | { phase: 'installing'; version: string }
  | { phase: 'error'; version: string; message: string }
