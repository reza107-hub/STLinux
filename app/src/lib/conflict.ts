export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'conflict'; ours: string; theirs: string; base: string | null; oursLabel: string; theirsLabel: string }

export type Choice = 'ours' | 'theirs' | 'both' | 'both-reverse' | null

/** Splits a file with Git conflict markers into plain text and conflict blocks. */
export function parseConflicts(text: string): Segment[] {
  const lines = text.split('\n')
  const out: Segment[] = []
  let buf: string[] = []
  let i = 0
  const flush = () => {
    if (buf.length) out.push({ kind: 'text', text: buf.join('\n') + '\n' })
    buf = []
  }
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('<<<<<<< ') || l === '<<<<<<<') {
      const oursLabel = l.slice(8)
      const ours: string[] = []
      const base: string[] = []
      const theirs: string[] = []
      let part: 'ours' | 'base' | 'theirs' = 'ours'
      let theirsLabel = ''
      let closed = false
      let hasBase = false
      let j = i + 1
      for (; j < lines.length; j++) {
        const m = lines[j]
        if (part === 'ours' && m.startsWith('||||||| ')) {
          part = 'base'
          hasBase = true
          continue
        }
        if ((part === 'ours' || part === 'base') && m === '=======') {
          part = 'theirs'
          continue
        }
        if (part === 'theirs' && m.startsWith('>>>>>>> ')) {
          theirsLabel = m.slice(8)
          closed = true
          break
        }
        if (part === 'ours') ours.push(m)
        else if (part === 'base') base.push(m)
        else theirs.push(m)
      }
      if (!closed) {
        // malformed marker: keep it as plain text
        buf.push(l)
        i++
        continue
      }
      flush()
      const join = (a: string[]) => (a.length ? a.join('\n') + '\n' : '')
      out.push({ kind: 'conflict', ours: join(ours), theirs: join(theirs), base: hasBase ? join(base) : null, oursLabel, theirsLabel })
      i = j + 1
      continue
    }
    buf.push(l)
    i++
  }
  // `split` leaves one trailing empty element when the file ends with a newline
  if (buf.length && buf[buf.length - 1] === '') buf.pop()
  if (buf.length) out.push({ kind: 'text', text: buf.join('\n') + (text.endsWith('\n') ? '\n' : '') })
  return out
}

export function resolveText(segments: Segment[], choices: Choice[]): string {
  let c = 0
  return segments
    .map((s) => {
      if (s.kind === 'text') return s.text
      const ch = choices[c++]
      if (ch === 'ours') return s.ours
      if (ch === 'theirs') return s.theirs
      if (ch === 'both') return s.ours + s.theirs
      if (ch === 'both-reverse') return s.theirs + s.ours
      return ''
    })
    .join('')
}

export function conflictCount(segments: Segment[]): number {
  return segments.filter((s) => s.kind === 'conflict').length
}
