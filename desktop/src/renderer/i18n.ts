import { useMemo } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import { domainLabel, type DomainKind } from '@shared/labels'
import { createI18n } from '@shared/i18n'
import { resolveLocale } from '@shared/i18n/locales'

export const i18n = createI18n(resolveLocale('system', navigator.language), [initReactI18next])

function syncDocumentLanguage(language: string): void {
  document.documentElement.lang = language
}

syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export function applyUiLanguage(preference: string): void {
  void i18n.changeLanguage(resolveLocale(preference, navigator.language))
}

export interface Domain {
  team: (id: string) => string
  agent: (id: string) => string
  analyst: (id: string) => string
  section: (id: string) => string
  status: (id: string) => string
  rating: (id: string) => string
  ratingShort: (id: string) => string
}

export function useDomain(): Domain {
  const { t } = useTranslation('domain')
  return useMemo(() => {
    const bind =
      (kind: DomainKind) =>
      (id: string): string =>
        domainLabel(t, kind, id)
    return {
      team: bind('team'),
      agent: bind('agent'),
      analyst: bind('analyst'),
      section: bind('section'),
      status: bind('status'),
      rating: bind('rating'),
      ratingShort: bind('ratingShort')
    }
  }, [t])
}
