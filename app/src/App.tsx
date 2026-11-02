import { useEffect, useState } from 'react'
import MenuBar from './components/menu-bar'
import TabStrip from './components/tab-strip'
import Toasts from './components/toasts'
import { Spinner } from './components/ui'
import DialogHost from './dialogs'
import { inTauri } from './lib/api'
import { errText } from './lib/format'
import { useShortcuts } from './lib/shortcuts'
import { AppProvider, useApp } from './lib/store'
import NewTab from './views/new-tab'
import RepoView from './views/repo-view'
import UserView from './views/user'
import Welcome, { ONBOARDED_KEY } from './views/welcome'

function Main() {
  const app = useApp()
  useShortcuts()
  const tab = app.tabs.find((t) => t.id === app.selectedId) ?? app.tabs[0]
  return (
    <div className="flex h-full min-h-[518px] min-w-[600px] flex-col bg-background">
      <MenuBar />
      <TabStrip />
      <div className="min-h-0 flex-1">
        {tab.kind === 'repo' && tab.path ? (
          <RepoView key={tab.id} tabId={tab.id} path={tab.path} />
        ) : tab.kind === 'user' ? (
          <UserView />
        ) : (
          <NewTab />
        )}
      </div>
    </div>
  )
}

function Gate() {
  const app = useApp()
  const [err, setErr] = useState<string | null>(null)
  const [welcome, setWelcome] = useState<boolean | null>(null)

  useEffect(() => {
    app
      .reloadStartup()
      .catch((e) => setErr(errText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const show = () => setWelcome(true)
    window.addEventListener('stlinux:show-welcome', show)
    return () => window.removeEventListener('stlinux:show-welcome', show)
  }, [])

  useEffect(() => {
    if (!app.startup || welcome !== null) return
    const known = app.startup.accounts.length > 0 || app.startup.sshKeys.length > 0
    const done = localStorage.getItem(ONBOARDED_KEY) === '1'
    // An existing account or SSH key goes straight to the repository tabs.
    setWelcome(!known && !done)
  }, [app.startup, welcome])

  if (err) {
    return <div role="alert" className="flex h-full items-center justify-center p-8 text-danger">{err}</div>
  }
  if (welcome === null) {
    return <div className="flex h-full items-center justify-center"><Spinner size={28} /></div>
  }
  if (welcome) {
    return <Welcome onDone={() => { localStorage.setItem(ONBOARDED_KEY, '1'); setWelcome(false) }} />
  }
  return <Main />
}

export default function App() {
  if (!inTauri()) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        STLinux needs its desktop shell. Start it with: pnpm tauri dev
      </div>
    )
  }
  return (
    <AppProvider>
      <Gate />
      <DialogHost />
      <Toasts />
    </AppProvider>
  )
}
