export const LOCALES = [
  { code: 'zh-CN', nativeName: '简体中文' },
  { code: 'en', nativeName: 'English' }
] as const

export type LocaleCode = (typeof LOCALES)[number]['code']
export type UiLanguage = 'system' | LocaleCode

export const FALLBACK_LOCALE: LocaleCode = 'en'

export function isLocaleCode(value: string): value is LocaleCode {
  return LOCALES.some((locale) => locale.code === value)
}

export function resolveLocale(preference: string, systemLocale: string): LocaleCode {
  if (isLocaleCode(preference)) return preference
  if (isLocaleCode(systemLocale)) return systemLocale
  const systemLanguage = systemLocale.toLowerCase().split('-')[0]
  const sameLanguage = LOCALES.find(
    (locale) => locale.code.toLowerCase().split('-')[0] === systemLanguage
  )
  return sameLanguage?.code ?? FALLBACK_LOCALE
}
