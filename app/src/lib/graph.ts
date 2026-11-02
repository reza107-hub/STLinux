import type { Commit } from './types'

export type GraphRow = {
  lane: number
  /** lanes that carry a line into this row from above: [laneIndex, color] */
  top: { from: number; to: number; color: number }[]
  /** lines leaving this row downward */
  bottom: { from: number; to: number; color: number }[]
  color: number
  width: number
}

/**
 * Assigns each commit a lane and the line segments drawn through its row.
 * Commits must be in display order (children before parents).
 */
export function layoutGraph(commits: Commit[]): { rows: GraphRow[]; maxLanes: number } {
  type Lane = { sha: string; color: number } | null
  let lanes: Lane[] = []
  let nextColor = 0
  let maxLanes = 1
  const rows: GraphRow[] = []

  for (const c of commits) {
    // find the lane waiting for this commit (first match)
    let idx = lanes.findIndex((l) => l && l.sha === c.sha)
    const before = lanes.map((l) => (l ? { ...l } : null))
    if (idx === -1) {
      idx = lanes.findIndex((l) => l === null)
      if (idx === -1) idx = lanes.length
      lanes[idx] = { sha: c.sha, color: nextColor++ }
      before[idx] = null // new line starts at this node
    }
    const color = lanes[idx]!.color

    const top: GraphRow['top'] = []
    before.forEach((l, i) => {
      if (!l) return
      top.push({ from: i, to: l.sha === c.sha ? idx : i, color: l.color })
    })

    // other lanes also waiting for this same commit merge into the node
    const after: Lane[] = lanes.map((l) => (l && l.sha !== c.sha ? l : null))
    const bottom: GraphRow['bottom'] = []

    const [p0, ...rest] = c.parents
    if (p0) {
      const existing = after.findIndex((l) => l && l.sha === p0)
      if (existing !== -1 && existing !== idx) {
        bottom.push({ from: idx, to: existing, color: after[existing]!.color })
      } else {
        after[idx] = { sha: p0, color }
        bottom.push({ from: idx, to: idx, color })
      }
    }
    for (const p of rest) {
      const existing = after.findIndex((l) => l && l.sha === p)
      if (existing !== -1) {
        bottom.push({ from: idx, to: existing, color: after[existing]!.color })
      } else {
        let slot = after.findIndex((l, i) => l === null && i !== idx)
        if (slot === -1) slot = after.length
        const col = nextColor++
        after[slot] = { sha: p, color: col }
        bottom.push({ from: idx, to: slot, color: col })
      }
    }
    // pass-through lines
    after.forEach((l, i) => {
      if (!l) return
      const isNew = bottom.some((b) => b.to === i && b.from === idx)
      if (!isNew) bottom.push({ from: i, to: i, color: l.color })
    })

    while (after.length && after[after.length - 1] === null) after.pop()
    const width = Math.max(idx + 1, before.length, after.length)
    maxLanes = Math.max(maxLanes, width)
    rows.push({ lane: idx, top, bottom, color, width })
    lanes = after
  }
  return { rows, maxLanes }
}
