/**
 * Pure helpers behind the model pickers in Settings.
 *
 * The Python catalog marks "enter your own ID" with the value `custom`; that
 * entry is a UI affordance, never a model name to send.
 */

import type { ProviderOption } from '@shared/protocol'

export interface ModelChoice {
  value: string
  /** Short description from the catalog, if any. */
  hint: string | null
  source: 'catalog' | 'endpoint'
}

const CATALOG_CUSTOM = 'custom'

/** Catalog labels read "Name - description"; the value already names the model. */
function hintOf(label: string): string | null {
  const separator = label.indexOf(' - ')
  return separator === -1 ? null : label.slice(separator + 3).trim() || null
}

/**
 * Catalog first, then endpoint-discovered models. The saved value is deliberately
 * not mixed in: a name that is in neither list is shown as a custom ID instead.
 */
export function modelChoices(
  catalog: { label: string; value: string }[],
  discovered: string[]
): ModelChoice[] {
  const choices: ModelChoice[] = []
  const seen = new Set<string>()
  for (const option of catalog) {
    if (option.value === CATALOG_CUSTOM || seen.has(option.value)) continue
    seen.add(option.value)
    choices.push({ value: option.value, hint: hintOf(option.label), source: 'catalog' })
  }
  for (const value of discovered) {
    if (seen.has(value)) continue
    seen.add(value)
    choices.push({ value, hint: null, source: 'endpoint' })
  }
  return choices
}

function firstCatalogModel(options: { value: string }[]): string | null {
  return options.find((option) => option.value !== CATALOG_CUSTOM)?.value ?? null
}

function keepOrDefault(current: string, options: { value: string }[]): string {
  if (options.some((option) => option.value === current && option.value !== CATALOG_CUSTOM)) {
    return current
  }
  return firstCatalogModel(options) ?? current
}

/**
 * Model names after switching provider: keep a model the new provider lists,
 * otherwise take its first recommendation. Providers without a catalog
 * (custom endpoints) keep whatever the user had typed.
 */
export function modelsForProvider(
  provider: ProviderOption | undefined,
  current: { deepThinkLlm: string; quickThinkLlm: string }
): { deepThinkLlm: string; quickThinkLlm: string } {
  if (!provider) return current
  return {
    deepThinkLlm: keepOrDefault(current.deepThinkLlm, provider.deepModels),
    quickThinkLlm: keepOrDefault(current.quickThinkLlm, provider.quickModels)
  }
}
