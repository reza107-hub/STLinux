export type DiffLine = {
  kind: 'ctx' | 'add' | 'del' | 'meta'
  text: string
  oldNo: number | null
  newNo: number | null
}
export type Hunk = { header: string; lines: DiffLine[] }
export type ParsedDiff = {
  /** everything before the first hunk (diff --git, index, ---, +++) */
  fileHeader: string[]
  hunks: Hunk[]
  binary: boolean
  empty: boolean
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function parseDiff(text: string): ParsedDiff {
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const fileHeader: string[] = []
  const hunks: Hunk[] = []
  let cur: Hunk | null = null
  let o = 0
  let n = 0
  let binary = false
  for (const l of lines) {
    const m = HUNK_RE.exec(l)
    if (m) {
      cur = { header: l, lines: [] }
      hunks.push(cur)
      o = Number(m[1])
      n = Number(m[2])
      continue
    }
    if (!cur) {
      if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) binary = true
      fileHeader.push(l)
      continue
    }
    if (l.startsWith('+')) cur.lines.push({ kind: 'add', text: l.slice(1), oldNo: null, newNo: n++ })
    else if (l.startsWith('-')) cur.lines.push({ kind: 'del', text: l.slice(1), oldNo: o++, newNo: null })
    else if (l.startsWith('\\')) cur.lines.push({ kind: 'meta', text: l, oldNo: null, newNo: null })
    else cur.lines.push({ kind: 'ctx', text: l.slice(1), oldNo: o++, newNo: n++ })
  }
  return { fileHeader, hunks, binary, empty: lines.length === 0 }
}

function lineText(l: DiffLine): string {
  if (l.kind === 'add') return '+' + l.text
  if (l.kind === 'del') return '-' + l.text
  if (l.kind === 'meta') return l.text
  return ' ' + l.text
}

/**
 * Builds a patch for one hunk, optionally limited to selected line indexes.
 * `reverse` is true when the patch will be applied with `git apply -R`
 * (unstage or discard), which flips which lines must be kept as context.
 */
export function buildPatch(
  d: ParsedDiff,
  hunk: Hunk,
  selected: Set<number> | null,
  reverse: boolean,
): string {
  const body: string[] = []
  hunk.lines.forEach((l, i) => {
    if (l.kind === 'meta') {
      // keep "no newline" marker only if the line before it was kept
      if (body.length) body.push(l.text)
      return
    }
    const picked = selected === null || selected.has(i)
    if (l.kind === 'ctx' || picked) {
      body.push(lineText(l))
    } else if (l.kind === 'add') {
      if (reverse) body.push(' ' + l.text) // stays in the file
      // forward: unselected addition is simply not applied
    } else if (l.kind === 'del') {
      if (!reverse) body.push(' ' + l.text) // stays in the file
      // reverse: unselected deletion must not be restored
    }
  })
  return [...d.fileHeader, hunk.header, ...body].join('\n') + '\n'
}
