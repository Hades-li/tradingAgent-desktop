/**
 * Right column: the seven report sections. Sections arrive as Markdown and are
 * rendered as-is — no conversion step, no HTML from the model.
 */

import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  const content = current ? sections[current] : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line2 px-2 py-1.5">
        {available.map((section) => {
          const has = Boolean(sections[section])
          return (
            <button
              key={section}
              type="button"
              onClick={() => {
                setActive(section)
                setPinned(true)
              }}
              className={`shrink-0 rounded-md px-2 py-[2px] text-[11px] ${
                current === section
                  ? 'bg-accent text-white'
                  : has
                    ? 'text-ink hover:bg-panel2'
                    : 'text-muted hover:bg-panel2'
              }`}
            >
              {SECTION_LABELS[section]}
              {has ? '' : ' ·'}
            </button>
          )
        })}
        {pinned && (
          <button
            type="button"
            onClick={() => setPinned(false)}
            className="ml-auto shrink-0 rounded-md border border-line px-2 py-[2px] text-[11px] text-muted hover:text-ink"
          >
            跟随最新
          </button>
        )}
      </div>
      <div className="md flex-1 overflow-y-auto px-4 py-3">
        {content ? (
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        ) : (
          <p className="text-muted">该板块尚未生成内容。</p>
        )}
      </div>
    </div>
  )
}
