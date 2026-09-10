/**
 * Right column: the seven report sections. Sections arrive as Markdown and are
 * rendered as-is — no conversion step, no HTML from the model.
 */

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@renderer/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { SECTION_LABELS } from '@shared/labels'
import type { SectionKey } from '@shared/protocol'

interface Props {
  sections: Partial<Record<SectionKey, string>>
  available: SectionKey[]
  /** Latest section touched by the run; drives the "follow latest" behaviour. */
  latest: SectionKey | null
}

export function ReportTabs({ sections, available, latest }: Props): React.JSX.Element {
  const [active, setActive] = useState<SectionKey | null>(null)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (!pinned && latest) setActive(latest)
  }, [latest, pinned])

  const current = active ?? latest ?? available[0] ?? null
  if (!current) return <ReportEmpty />

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        setActive(value as SectionKey)
        setPinned(true)
      }}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <TabsList>
          {available.map((section) => (
            <TabsTrigger key={section} value={section}>
              {SECTION_LABELS[section]}
            </TabsTrigger>
          ))}
        </TabsList>
        {pinned && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setPinned(false)}>
            跟随最新
          </Button>
        )}
      </div>
      {available.map((section) => (
        <TabsContent
          key={section}
          value={section}
          className="md min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {sections[section] ? (
            <Markdown remarkPlugins={[remarkGfm]}>{sections[section]}</Markdown>
          ) : (
            <ReportEmpty />
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function ReportEmpty(): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>尚未生成内容</EmptyTitle>
        <EmptyDescription>该板块会在对应的智能体完成后填充。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
