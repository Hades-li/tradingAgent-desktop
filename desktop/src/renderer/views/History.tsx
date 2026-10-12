/**
 * Saved runs, read straight off the report tree that both clients write.
 */

import { useEffect, useState } from 'react'
import { FolderOpen, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@renderer/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@renderer/components/ui/item'

interface HistoryEntry {
  id: string
  ticker: string
  savedAt: string
  path: string
}

interface HistoryDetail extends HistoryEntry {
  completeReport: string
  completeHtml?: string
}

function openExternalLinks(event: React.SyntheticEvent<HTMLIFrameElement>): void {
  const frameDocument = event.currentTarget.contentDocument
  frameDocument?.addEventListener('click', (click) => {
    const anchor = (click.target as Element | null)?.closest('a')
    const href = anchor?.getAttribute('href')
    if (href && /^https?:/i.test(href)) {
      click.preventDefault()
      window.open(href)
    }
  })
}

export function History({ selectedId }: { selectedId: string | null }): React.JSX.Element {
  const { t } = useTranslation('history')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [detail, setDetail] = useState<HistoryDetail | null>(null)

  useEffect(() => {
    void window.desktop.history.list().then(setEntries)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    void window.desktop.history.read(selectedId).then(setDetail)
  }, [selectedId])

  if (!selectedId) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <h3 className="mb-3 font-medium">{t('title')}</h3>
        {entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {entries.map((entry) => (
              <Item key={entry.id} variant="outline">
                <ItemContent>
                  <ItemTitle>{entry.ticker}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <span className="text-muted-foreground text-sm">
                    {entry.savedAt.replace('T', ' ')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void window.desktop.history.reveal(entry.path)}
                  >
                    <FolderOpen />
                    {t('reveal')}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <strong>{detail?.ticker ?? selectedId}</strong>
        <span className="text-muted-foreground text-sm">
          {detail?.savedAt.replace('T', ' ')}
        </span>
        {detail && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void window.desktop.history.reveal(detail.path)}
          >
            <FolderOpen />
            {t('reveal')}
          </Button>
        )}
      </header>
      {detail?.completeHtml ? (
        <iframe
          key={detail.id}
          title={t('reportTitle', { ticker: detail.ticker })}
          srcDoc={detail.completeHtml}
          sandbox="allow-same-origin"
          onLoad={openExternalLinks}
          className="min-h-0 w-full flex-1 border-0"
        />
      ) : (
        <div className="md flex-1 overflow-y-auto px-6 py-4">
          {detail && <Markdown remarkPlugins={[remarkGfm]}>{detail.completeReport}</Markdown>}
        </div>
      )}
    </div>
  )
}
