import { useRef, useState } from 'react'
import Sidebar from '../components/sidebar'
import Toolbar from '../components/toolbar'
import { Button, Splitter, Spinner } from '../components/ui'
import { useActions } from '../lib/actions'
import { RepoProvider, useRepo } from '../lib/repo'
import { useApp } from '../lib/store'
import FileStatus from './file-status'
import { HistoryView, SearchView } from './history'

function Inner({ tabId }: { tabId: string }) {
  const app = useApp()
  const a = useActions()
  const { path, summary, error, loading } = useRepo()
  const view = app.views[path] ?? 'status'
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem('stlinux-sidebar-w')) || 220)
  const base = useRef(0)

  if (error && !summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[13px] font-semibold text-foreground-strong">Could not open this repository</p>
        <p className="selectable max-w-xl whitespace-pre-wrap text-muted">{error}</p>
        <Button variant="primary" onClick={() => app.closeTab(tabId)}>Close tab</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar />
      {(summary?.merging || summary?.rebasing) && (
        <div role="status" className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-warning px-3 text-primary-foreground">
          <span>{summary.merging ? 'A merge is in progress. Resolve conflicts, stage the files and commit.' : 'A rebase is in progress.'}</span>
          <Button className="h-6" onClick={a.abort}>Abort</Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {loading && !summary ? (
          <div className="flex flex-1 items-center justify-center"><Spinner size={24} /></div>
        ) : (
          <>
            <Sidebar width={sidebarW} />
            <Splitter
              dir="col"
              onStart={() => (base.current = sidebarW)}
              onDrag={(d) => {
                const w = Math.max(146, Math.min(1000, base.current + d))
                setSidebarW(w)
                localStorage.setItem('stlinux-sidebar-w', String(w))
              }}
            />
            <main className="min-w-0 flex-1 border-b border-border bg-background">
              {view === 'status' && <FileStatus />}
              {view === 'history' && <HistoryView />}
              {view === 'search' && <SearchView />}
            </main>
          </>
        )}
      </div>
    </div>
  )
}

export default function RepoView({ tabId, path }: { tabId: string; path: string }) {
  return (
    <RepoProvider path={path}>
      <Inner tabId={tabId} />
    </RepoProvider>
  )
}
