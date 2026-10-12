import { app } from 'electron'
import type { i18n, TFunction } from 'i18next'
import { createI18n } from '@shared/i18n'
import { resolveLocale, type LocaleCode } from '@shared/i18n/locales'
import { loadSettings } from './settings-store'

const instances = new Map<LocaleCode, i18n>()

export function mainT(): TFunction<'main'> {
  const code = resolveLocale(loadSettings().uiLanguage, app.getLocale())
  let instance = instances.get(code)
  if (!instance) {
    instance = createI18n(code)
    instances.set(code, instance)
  }
  return instance.getFixedT(code, 'main')
}
