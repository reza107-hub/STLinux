import { open } from '@tauri-apps/plugin-dialog'
import { api } from './api'
import { useApp } from './store'

/** Actions shared by the menu bar, the toolbar and keyboard shortcuts. */
export function useActions() {
  const app = useApp()
  const tab = app.tabs.find((t) => t.id === app.selectedId)
  const path = tab?.kind === 'repo' ? (tab.path ?? null) : null

  const need = (fn: (p: string) => void) => () => {
    if (path) fn(path)
  }

  const openFolder = async () => {
    const dir = await open({ directory: true, multiple: false, title: 'Open repository' })
    if (typeof dir === 'string') await app.openRepoPath(dir)
  }

  return {
    path,
    openFolder,
    refresh: () => app.bump(),
    fetch: need((p) => void app.run('Fetch', () => api.fetch(p))),
    pull: need((p) => app.openDialog('pull', { path: p })),
    push: need((p) => app.openDialog('push', { path: p })),
    branch: need((p) => app.openDialog('branch', { path: p })),
    merge: need((p) => app.openDialog('merge', { path: p })),
    stash: need((p) => app.openDialog('stash', { path: p })),
    discardAll: need((p) => app.openDialog('discard', { path: p, all: true })),
    tag: need((p) => app.openDialog('tag', { path: p })),
    flow: need((p) => app.openDialog('flow', { path: p })),
    terminal: need((p) => void api.openTerminal(p).catch((e) => app.notify('error', String(e)))),
    files: need((p) => void api.openInFiles(p).catch((e) => app.notify('error', String(e)))),
    repoSettings: need((p) => app.openDialog('repo-settings', { path: p })),
    abort: need((p) => void app.run('Abort', () => api.abortOperation(p))),
    view: (v: 'status' | 'history' | 'search') => {
      if (path) app.setView(path, v)
    },
    commitAll: need((p) => {
      app.setView(p, 'status')
      window.dispatchEvent(new CustomEvent('stlinux:stage-all-and-focus'))
    }),
    preferences: () => app.openDialog('prefs'),
    about: () => app.openDialog('about'),
    clone: () => {
      app.newTab()
      window.dispatchEvent(new CustomEvent('stlinux:new-tab-section', { detail: 'clone' }))
    },
  }
}
