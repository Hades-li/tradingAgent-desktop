import i18next, { type i18n, type Module } from 'i18next'
import { en } from '../locales/en'
import { zhCN } from '../locales/zh-CN'
import { FALLBACK_LOCALE, type LocaleCode } from './locales'

export const DEFAULT_NAMESPACE = 'common'

export const RESOURCES: Record<LocaleCode, { [namespace: string]: object }> = {
  'zh-CN': zhCN,
  en
}

export function createI18n(language: LocaleCode, plugins: Module[] = []): i18n {
  const instance = i18next.createInstance()
  for (const plugin of plugins) instance.use(plugin)
  void instance.init({
    lng: language,
    fallbackLng: FALLBACK_LOCALE,
    resources: RESOURCES,
    ns: Object.keys(zhCN),
    defaultNS: DEFAULT_NAMESPACE,
    interpolation: { escapeValue: false },
    initAsync: false
  })
  return instance
}
