import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { conflictCount, parseConflicts, resolveText, type Choice } from '../lib/conflict'
import { errText } from '../lib/format'
import { useApp } from '../lib/store'
import { Button, Spinner } from './ui'

/** Resolve one conflicted file: pick a side per block, then save and stage it. */
export default function ConflictPanel({ repoPath, file }: { repoPath: string; file: string }) {
  const app = useApp()
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])

  useEffect(() => {
    let live = true
    setText(null)
    setErr(null)
    api
      .readConflictFile(repoPath, file)
      .then((t) => {
        if (!live) return
        setText(t)
        setChoices(new Array(conflictCount(parseConflicts(t))).fill(null))
      })
      .catch((e) => live && setErr(errText(e)))
    return () => {
      live = false
    }
  }, [repoPath, file])

  const segments = useMemo(() => (text === null ? [] : parseConflicts(text)), [text])
  const total = conflictCount(segments)
  const decided = choices.filter(Boolean).length

  const save = () =>
    void app.run('Resolve conflict', () =>
      api.resolveConflict(repoPath, file, 'content', resolveText(segments, choices)).then(() => `${file} resolved`),
    )

  const whole = (side: 'ours' | 'theirs') =>
    void app.run('Resolve conflict', () =>
      api.resolveConflict(repoPath, file, side, null).then(() => `${file} resolved`),
    )

  if (err) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted">{err}</p>
        <div className="flex gap-2">
          <Button onClick={() => whole('ours')}>Use mine</Button>
          <Button onClick={() => whole('theirs')}>Use theirs</Button>
        </div>
      </div>
    )
  }
  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted">No conflict markers found in this file.</p>
        <Button variant="primary" onClick={() => void app.run('Mark resolved', () => api.resolveConflict(repoPath, file, 'content', text).then(() => 'Marked as resolved'))}>
          Mark as resolved
        </Button>
      </div>
    )
  }

  let n = -1
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <span className="font-semibold text-foreground-strong">
          {decided}/{total} conflicts resolved
        </span>
        <div className="ml-auto flex gap-2">
          <Button className="h-6" onClick={() => whole('ours')}>Use mine for the whole file</Button>
          <Button className="h-6" onClick={() => whole('theirs')}>Use theirs for the whole file</Button>
          <Button className="h-6" variant="primary" disabled={decided < total} onClick={save}>
            Save and mark resolved
          </Button>
        </div>
      </div>
      <div className="selectable min-h-0 flex-1 overflow-auto bg-background font-mono text-[12px] leading-[18px]">
        {segments.map((s, k) => {
          if (s.kind === 'text') {
            return (
              <pre key={k} className="whitespace-pre-wrap px-3 py-1 text-muted">
                {s.text.length > 600 ? `${s.text.slice(0, 250)}\n  ...\n${s.text.slice(-250)}` : s.text}
              </pre>
            )
          }
          const idx = ++n
          const ch = choices[idx]
          const set = (c: Choice) => setChoices((cur) => cur.map((x, i) => (i === idx ? c : x)))
          const btn = (c: Choice, label: string) => (
            <Button key={String(c)} className="h-5 px-2 text-[11px]" variant={ch === c ? 'primary' : 'secondary'} onClick={() => set(c)}>
              {label}
            </Button>
          )
          return (
            <section key={k} aria-label={`Conflict ${idx + 1}`} className="my-2 border-y border-border">
              <div className="flex h-7 items-center gap-2 bg-surface px-3 font-sans">
                <span className="font-semibold text-foreground-strong">Conflict {idx + 1}</span>
                <div className="ml-auto flex gap-1.5">
                  {btn('ours', 'Use mine')}
                  {btn('theirs', 'Use theirs')}
                  {btn('both', 'Both (mine first)')}
                  {btn('both-reverse', 'Both (theirs first)')}
                </div>
              </div>
              <div className={'border-l-4 border-success bg-diff-add px-3 py-1 ' + (ch === 'theirs' ? 'opacity-40' : '')}>
                <div className="mb-0.5 font-sans text-muted">Mine ({s.oursLabel || 'current'})</div>
                <pre className="whitespace-pre-wrap text-foreground-strong">{s.ours || ' '}</pre>
              </div>
              {s.base !== null && (
                <div className="border-l-4 border-border px-3 py-1">
                  <div className="mb-0.5 font-sans text-muted">Original</div>
                  <pre className="whitespace-pre-wrap">{s.base || ' '}</pre>
                </div>
              )}
              <div className={'border-l-4 border-danger bg-diff-remove px-3 py-1 ' + (ch === 'ours' ? 'opacity-40' : '')}>
                <div className="mb-0.5 font-sans text-muted">Theirs ({s.theirsLabel || 'incoming'})</div>
                <pre className="whitespace-pre-wrap text-foreground-strong">{s.theirs || ' '}</pre>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
