import { Plus, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../lib/store'
import { ContextMenu, type MenuItem } from './ui'

export default function TabStrip() {
  const app = useApp()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  return (
    <div role="tablist" aria-label="Open repositories" className="flex h-8 shrink-0 items-end gap-[3px] overflow-x-auto border-t border-border bg-surface px-1">
      {app.tabs.map((t, i) => {
        const active = t.id === app.selectedId
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) app.moveTab(dragFrom, i)
              setDragFrom(null)
            }}
            onClick={() => app.selectTab(t.id)}
            onAuxClick={(e) => e.button === 1 && app.closeTab(t.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && app.selectTab(t.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: 'Close Tab', onClick: () => app.closeTab(t.id) },
                  { label: 'Close All Tabs', onClick: app.closeAll },
                  { label: 'Close All But This', onClick: () => app.closeOthers(t.id) },
                ],
              })
            }}
            title={t.path ?? t.name}
            className={
              'group flex h-7 min-w-28 max-w-56 cursor-default items-center gap-2 rounded-t border border-b-0 px-3 ' +
              (active ? 'border-border bg-background text-foreground-strong' : 'border-transparent hover:bg-hover')
            }
          >
            {t.kind === 'user' && <UserRound size={12} className="shrink-0" />}
            <span className="flex-1 truncate">{t.name}</span>
            <button
              type="button"
              aria-label={`Close ${t.name}`}
              onClick={(e) => {
                e.stopPropagation()
                app.closeTab(t.id)
              }}
              className={'rounded p-0.5 hover:bg-hover ' + (active ? '' : 'invisible group-hover:visible')}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        aria-label="New tab"
        title="New tab (Ctrl+N)"
        onClick={app.newTab}
        className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-foreground-strong"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        aria-label="User and connections"
        title="User and connections"
        onClick={app.openUserTab}
        className="mb-0.5 ml-auto flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-muted hover:bg-hover hover:text-foreground-strong"
      >
        <UserRound size={14} />
        User
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
