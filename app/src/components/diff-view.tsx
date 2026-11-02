import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { buildPatch, parseDiff } from '../lib/diff'
import { useApp } from '../lib/store'
import { Button, Spinner } from './ui'

export type DiffMode = 'unstaged' | 'staged' | 'untracked' | 'commit'

type Props = {
  repoPath: string
  diff: string | null
  loading: boolean
  mode: DiffMode
  fileLabel?: string
}

export default function DiffView({ repoPath, diff, loading, mode, fileLabel }: Props) {
  const app = useApp()
  const parsed = useMemo(() => (diff == null ? null : parseDiff(diff)), [diff])
  const [selected, setSelected] = useState<Record<number, Set<number>>>({})

  useEffect(() => setSelected({}), [diff])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }
  if (!parsed || parsed.empty) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        {fileLabel ? 'No changes to show for this file' : 'Select a file to see its changes'}
      </div>
    )
  }
  if (parsed.binary && parsed.hunks.length === 0) {
    return <div className="flex h-full items-center justify-center text-muted">Binary file, no text diff</div>
  }

  const working = mode !== 'commit'
  const staged = mode === 'staged'

  const apply = (label: string, hi: number, lines: boolean, cached: boolean, reverse: boolean) => {
    const h = parsed.hunks[hi]
    const patch = buildPatch(parsed, h, lines ? (selected[hi] ?? new Set()) : null, reverse)
    void app.run(label, () => api.applyPatch(repoPath, patch, cached, reverse).then(() => ''), { quiet: true })
  }

  const toggle = (hi: number, li: number) => {
    if (!working) return
    setSelected((cur) => {
      const s = new Set(cur[hi] ?? [])
      if (s.has(li)) s.delete(li)
      else s.add(li)
      return { ...cur, [hi]: s }
    })
  }

  return (
    <div className="selectable h-full overflow-auto bg-background font-mono text-[12px] leading-[18px]">
      {parsed.hunks.map((h, hi) => {
        const sel = selected[hi]?.size ?? 0
        return (
          <section key={hi} aria-label={`Hunk ${hi + 1}`}>
            <div className="sticky top-0 z-10 flex h-7 items-center gap-2 border-y border-border bg-diff-hunk px-2 font-sans text-foreground-strong">
              <span className="min-w-0 flex-1 truncate font-mono">{h.header}</span>
              {working && (
                <>
                  {sel > 0 && (
                    <>
                      <Button
                        className="h-5 px-2 text-[11px]"
                        onClick={() => apply(staged ? 'Unstage lines' : 'Stage lines', hi, true, true, staged)}
                      >
                        {staged ? 'Unstage' : 'Stage'} {sel} line{sel > 1 ? 's' : ''}
                      </Button>
                      {!staged && mode !== 'untracked' && (
                        <Button
                          variant="danger"
                          className="h-5 px-2 text-[11px]"
                          onClick={() => apply('Discard lines', hi, true, false, true)}
                        >
                          Discard {sel}
                        </Button>
                      )}
                    </>
                  )}
                  {sel === 0 && (
                    <>
                      <Button
                        className="h-5 px-2 text-[11px]"
                        onClick={() => apply(staged ? 'Unstage hunk' : 'Stage hunk', hi, false, true, staged)}
                      >
                        {staged ? 'Unstage hunk' : 'Stage hunk'}
                      </Button>
                      {!staged && mode !== 'untracked' && (
                        <Button
                          variant="danger"
                          className="h-5 px-2 text-[11px]"
                          onClick={() => apply('Discard hunk', hi, false, false, true)}
                        >
                          Discard hunk
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {h.lines.map((l, li) => {
                  const isSel = selected[hi]?.has(li)
                  const bg =
                    l.kind === 'add' ? 'bg-diff-add' : l.kind === 'del' ? 'bg-diff-remove' : ''
                  const clickable = working && (l.kind === 'add' || l.kind === 'del')
                  return (
                    <tr key={li} className={bg + (isSel ? ' outline outline-1 -outline-offset-1 outline-primary' : '')}>
                      <td
                        onClick={() => clickable && toggle(hi, li)}
                        title={clickable ? 'Click to select this line' : undefined}
                        className={
                          'w-10 select-none border-r border-border px-1 text-right text-muted ' +
                          (clickable ? 'cursor-pointer hover:text-foreground-strong' : '')
                        }
                      >
                        {l.oldNo ?? ''}
                      </td>
                      <td
                        onClick={() => clickable && toggle(hi, li)}
                        className={
                          'w-10 select-none border-r border-border px-1 text-right text-muted ' +
                          (clickable ? 'cursor-pointer hover:text-foreground-strong' : '')
                        }
                      >
                        {l.newNo ?? ''}
                      </td>
                      <td className="w-4 select-none px-1 text-center text-muted">
                        {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ''}
                      </td>
                      <td className="whitespace-pre pr-4 text-foreground-strong">{l.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
