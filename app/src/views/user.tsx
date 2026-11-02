import { Cloud, Copy, KeyRound, LogIn, RefreshCw, Server, Trash2, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AccountForm, HOSTS, SshCreate, accountLabel } from '../components/accounts'
import { Button, Field, Spinner, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { errText } from '../lib/format'
import { useApp } from '../lib/store'
import type { Account, Identity, SshKey } from '../lib/types'
import { ONBOARDED_KEY } from './welcome'

type Check = { state: 'checking' | 'ok' | 'error'; text: string }
type Adding = null | { kind: 'bitbucket-cloud' | 'bitbucket-server'; initial?: { rootUrl?: string; username?: string } }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-1 text-[13px] font-semibold text-foreground-strong">{title}</h2>
      {hint && <p className="mb-2 text-muted">{hint}</p>}
      {children}
    </section>
  )
}

function StatusChip({ c }: { c: Check | undefined }) {
  if (!c) return null
  if (c.state === 'checking') return <span className="flex items-center gap-1.5 text-muted"><Spinner size={11} /> Checking</span>
  return (
    <span title={c.text} className={'max-w-72 truncate ' + (c.state === 'ok' ? 'text-success' : 'text-danger')}>
      {c.state === 'ok' ? (c.text.startsWith('Connected') ? '' : 'Connected: ') : 'Problem: '}
      {c.text}
    </span>
  )
}

export default function UserView() {
  const app = useApp()
  const accounts = app.startup?.accounts ?? []
  const keys = app.startup?.sshKeys ?? []
  const hidden = app.startup?.hiddenKeys ?? 0
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [adding, setAdding] = useState<Adding>(null)
  const [host, setHost] = useState('bitbucket.org')

  useEffect(() => {
    void api.getIdentity(null).then(setIdentity).catch(() => setIdentity({ name: '', email: '' }))
  }, [])

  const checkAccount = useCallback(async (a: Account) => {
    setChecks((c) => ({ ...c, [a.id]: { state: 'checking', text: '' } }))
    try {
      const text = await api.checkAccount(a.id)
      setChecks((c) => ({ ...c, [a.id]: { state: 'ok', text } }))
    } catch (e) {
      setChecks((c) => ({ ...c, [a.id]: { state: 'error', text: errText(e) } }))
    }
  }, [])

  const checkKey = useCallback(async (k: SshKey, h: string) => {
    setChecks((c) => ({ ...c, [k.path]: { state: 'checking', text: '' } }))
    try {
      const text = await api.sshTest(h)
      setChecks((c) => ({ ...c, [k.path]: { state: 'ok', text: text.split('\n')[0] || `Reached ${h}` } }))
    } catch (e) {
      setChecks((c) => ({ ...c, [k.path]: { state: 'error', text: errText(e).split('\n')[0] } }))
    }
  }, [])

  // check each account once when the tab opens
  const accountIds = accounts.map((a) => a.id).join('|')
  useEffect(() => {
    accounts.forEach((a) => void checkAccount(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIds])

  const nothingLeft = accounts.length === 0 && keys.length === 0

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRound size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-foreground-strong">{identity?.name || 'No name set'}</div>
            <div className="text-muted">{identity?.email || 'No email set'}</div>
          </div>
          <Button className="ml-auto" onClick={() => app.openDialog('prefs')}>Edit name and email</Button>
        </div>

        {nothingLeft && (
          <div role="status" className="mb-6 rounded border border-warning p-3">
            You have no connections right now. Add one below, or run the setup again to start from the welcome screen.
          </div>
        )}

        <Section title="Accounts" hint="Bitbucket accounts that STLinux can use to list and clone your repositories.">
          {accounts.length === 0 && <p className="mb-2 text-muted">No accounts connected.</p>}
          {accounts.map((a) => (
            <div key={a.id} className="mb-2 rounded border border-border p-3">
              <div className="flex items-center gap-2">
                {a.kind === 'bitbucket-cloud' ? <Cloud size={16} className="text-muted" /> : <Server size={16} className="text-muted" />}
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground-strong">{accountLabel(a)}</span>
                <StatusChip c={checks[a.id]} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className="h-6" onClick={() => void checkAccount(a)}><RefreshCw size={12} /> Test</Button>
                <Button
                  className="h-6"
                  onClick={() =>
                    setAdding({
                      kind: a.kind as 'bitbucket-cloud' | 'bitbucket-server',
                      initial: { rootUrl: a.kind === 'bitbucket-server' ? a.rootUrl : undefined, username: a.username },
                    })
                  }
                >
                  <LogIn size={12} /> Log in again
                </Button>
                <Button
                  className="h-6"
                  variant="danger"
                  onClick={() =>
                    app.openDialog('confirm', {
                      title: 'Remove connection',
                      text: `Disconnect ${accountLabel(a)}? Its saved token is deleted from this computer. Your repositories are not changed. You can log in again later.`,
                      confirm: 'Remove',
                      danger: true,
                      action: { kind: 'remove-account', id: a.id },
                    })
                  }
                >
                  <Trash2 size={12} /> Remove
                </Button>
              </div>
            </div>
          ))}
        </Section>

        <Section title="SSH keys" hint="Keys found in your ~/.ssh folder. Git uses these to talk to Bitbucket over SSH.">
          {keys.length === 0 && <p className="mb-2 text-muted">No SSH keys are connected.</p>}
          {app.startup && keys.length > 0 && (
            <p className="mb-2 text-muted">ssh-agent: {app.startup.agentHasKeys ? 'has keys loaded' : 'no keys loaded (keys with a passphrase need ssh-add first)'}</p>
          )}
          {keys.length > 0 && (
            <div className="mb-3 flex items-end gap-2">
              <Field label="Test host">
                <input className={inputCls + ' w-60'} value={host} onChange={(e) => setHost(e.target.value)} />
              </Field>
            </div>
          )}
          {keys.map((k) => (
            <div key={k.path} className="mb-2 rounded border border-border p-3">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-muted" />
                <span className="font-semibold text-foreground-strong">{k.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted" title={k.fingerprint}>{k.fingerprint}</span>
                <StatusChip c={checks[k.path]} />
              </div>
              <div className="mt-1 truncate text-muted" title={k.path}>{k.path}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className="h-6" disabled={!host.trim()} onClick={() => void checkKey(k, host.trim())}><RefreshCw size={12} /> Test connection</Button>
                <Button className="h-6" onClick={() => void navigator.clipboard.writeText(k.publicKey).then(() => app.notify('ok', 'Public key copied'))}><Copy size={12} /> Copy public key</Button>
                <Button
                  className="h-6"
                  onClick={() =>
                    app.openDialog('confirm', {
                      title: 'Remove SSH connection',
                      text: `Stop showing ${k.name} in STLinux?\n\nThe key files stay in ~/.ssh, and your system SSH can still use them. You can show hidden keys again from this tab.`,
                      confirm: 'Remove from STLinux',
                      action: { kind: 'forget-key', path: k.path },
                    })
                  }
                >
                  Remove from STLinux
                </Button>
                <Button
                  className="h-6"
                  variant="danger"
                  onClick={() =>
                    app.openDialog('confirm', {
                      title: 'Delete SSH key files',
                      text: `Permanently delete ${k.path} and ${k.path}.pub from your computer?\n\nAnything that uses this key (other Git hosts, servers) will stop working. This cannot be undone.`,
                      confirm: 'Delete key files',
                      danger: true,
                      action: { kind: 'delete-key', path: k.path },
                    })
                  }
                >
                  <Trash2 size={12} /> Delete key files...
                </Button>
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <p className="mb-2 text-muted">
              {hidden} key{hidden > 1 ? 's are' : ' is'} hidden.{' '}
              <button type="button" className="text-primary underline" onClick={() => void api.sshRestoreHidden().then(() => app.reloadStartup())}>
                Show hidden keys
              </button>
            </p>
          )}
          <SshCreate />
        </Section>

        <Section title="Add or log in again">
          {adding ? (
            <div className="max-w-md rounded border border-border p-3">
              <h3 className="mb-3 font-semibold text-foreground-strong">
                {adding.initial?.username ? 'Log in again to' : 'Connect'} {HOSTS.find((h) => h.id === adding.kind)?.name}
              </h3>
              <AccountForm
                kind={adding.kind}
                initial={adding.initial}
                onCancel={() => setAdding(null)}
                onDone={(a) => {
                  setAdding(null)
                  app.notify('ok', 'Connected')
                  void checkAccount(a)
                }}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAdding({ kind: 'bitbucket-cloud' })}><Cloud size={13} /> Add Bitbucket Cloud</Button>
              <Button onClick={() => setAdding({ kind: 'bitbucket-server' })}><Server size={13} /> Add Bitbucket Server</Button>
              <Button
                onClick={() => {
                  localStorage.removeItem(ONBOARDED_KEY)
                  window.dispatchEvent(new CustomEvent('stlinux:show-welcome'))
                }}
              >
                Run the setup again
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
