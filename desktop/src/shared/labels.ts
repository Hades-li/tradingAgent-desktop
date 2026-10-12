/**
 * Presentation helpers for the pipeline, report tabs and event stream.
 *
 * The protocol always carries the canonical English agent / section names; the
 * display text lives in the `domain` namespace of each locale, and a missing
 * entry degrades to the raw name instead of breaking the layout.
 */

import type { TFunction } from 'i18next'

export type DomainKind =
  | 'team'
  | 'agent'
  | 'analyst'
  | 'section'
  | 'status'
  | 'rating'
  | 'ratingShort'

export const TEAM_ICONS: Record<string, string> = {
  'Analyst Team': 'chart',
  'Research Team': 'users',
  'Trading Team': 'trending',
  'Risk Management': 'shield',
  'Portfolio Management': 'briefcase'
}

export function domainLabel(t: TFunction<'domain'>, kind: DomainKind, id: string): string {
  const translate = t as unknown as (key: string, options: object) => string
  return translate(`${kind}.${id}`, { ns: 'domain', defaultValue: id })
}
