import { openUrl } from '@tauri-apps/plugin-opener'
import { Cloud, Copy, KeyRound, Server, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import { errText } from '../lib/format'
import { useApp } from '../lib/store'
import type { Account, SshKey } from '../lib/types'
import { Button, Field, inputCls, Spinner } from './ui'

export type HostKind = 'bitbucket-cloud' | 'bitbucket-server' | 'ssh'

export const HOSTS: { id: HostKind; name: string; icon: typeof Cloud; blurb: string }[] = [
  { id: 'bitbucket-cloud', name: 'Bitbucket Cloud', icon: Cloud, blurb: 'bitbucket.org' },
  { id: 'bitbucket-server', name: 'Bitbucket Server', icon: Server, blurb: 'Self-hosted or Data Center' },
  { id: 'ssh', name: 'SSH key', icon: KeyRound, blurb: 'Use or create a key' },
]

export function accountLabel(a: Account): string {
  return a.kind === 'bitbucket-cloud' ? `Bitbucket Cloud: ${a.username}` : `${a.rootUrl}: ${a.username}`
}

export function AccountForm({
  kind,
  onDone,
  onCancel,
  initial,
}: {
  kind: 'bitbucket-cloud' | 'bitbucket-server'
  onDone: (a: Account) => void
  onCancel?: () => void
  initial?: { rootUrl?: string; username?: string }
}) {
  const app = useApp()
  const cloud = kind === 'bitbucket-cloud'
  const [root, setRoot] = useState(initial?.rootUrl ?? '')
  const [user, setUser] = useState(initial?.username ?? '')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const a = await api.addAccount(kind, root, user, secret)
      await app.reloadStartup()
      onDone(a)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {!cloud && (
        <Field label="Root URL">
          <input className={inputCls} placeholder="https://bitbucket.example.com" value={root} onChange={(e) => setRoot(e.target.value)} autoFocus />
        </Field>
      )}
      <Field label={cloud ? 'Atlassian account email' : 'Username'}>
        <input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} autoFocus={cloud && !initial?.username} autoComplete="username" />
      </Field>
      <Field
        label={cloud ? 'API token' : 'Personal access token'}
        hint={
          cloud
            ? 'Create an API token in your Atlassian account security settings with repository read and write access.'
            : 'Create a token in Bitbucket under your profile, Personal access tokens (repository read and write).'
        }
      >
        <input className={inputCls} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" autoFocus={!!initial?.username} />
      </Field>
      {cloud && (
        <button
          type="button"
          className="mb-3 text-primary underline"
          onClick={() => void openUrl('https://id.atlassian.com/manage-profile/security/api-tokens')}
        >
          Open the API token page in your browser
        </button>
      )}
      {err && <p role="alert" className="mb-3 whitespace-pre-wrap rounded border border-danger p-2 text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (<Button onClick={onCancel}>Back</Button>)}
        <Button variant="primary" type="submit" disabled={busy || !user || !secret || (!cloud && !root)}>
          {busy ? <Spinner size={12} /> : null} Login
        </Button>
      </div>
    </form>
  )
}

export function SshPanel() {
  const app = useApp()
  const keys = app.startup?.sshKeys ?? []
  const [host, setHost] = useState('bitbucket.org')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult({ ok: true, text: await api.sshTest(host) })
    } catch (e) {
      setResult({ ok: false, text: errText(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      {keys.length === 0 && <p className="mb-3 text-muted">No SSH keys found in ~/.ssh.</p>}
      {keys.map((k) => (
        <SshKeyRow key={k.path} k={k} />
      ))}
      {app.startup && (
        <p className="mb-3 text-muted">
          ssh-agent: {app.startup.agentHasKeys ? 'has keys loaded' : 'no keys loaded (keys with a passphrase need ssh-add first)'}
        </p>
      )}
      <div className="mb-3 flex items-end gap-2">
        <Field label="Test connection to host">
          <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Button className="mb-3" onClick={() => void test()} disabled={testing || !host.trim()}>
          {testing ? <Spinner size={12} /> : null} Test
        </Button>
      </div>
      {result && (
        <p role="status" className={'mb-3 whitespace-pre-wrap rounded border p-2 ' + (result.ok ? 'border-success text-success' : 'border-danger text-danger')}>
          {result.text || (result.ok ? 'Connected' : 'Failed')}
        </p>
      )}
      <SshCreate />
    </div>
  )
}

function SshKeyRow({ k }: { k: SshKey }) {
  const app = useApp()
  return (
    <div className="mb-2 rounded border border-border p-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground-strong">{k.name}</span>
        <Button
          className="h-6"
          onClick={() => void navigator.clipboard.writeText(k.publicKey).then(() => app.notify('ok', 'Public key copied'))}
        >
          <Copy size={12} /> Copy public key
        </Button>
      </div>
      <div className="mt-1 truncate text-muted" title={k.fingerprint}>{k.fingerprint || k.path}</div>
    </div>
  )
}

export function AccountsList() {
  const app = useApp()
  const accounts = app.startup?.accounts ?? []
  if (accounts.length === 0) return <p className="mb-3 text-muted">No accounts connected yet.</p>
  return (
    <div className="mb-3">
      {accounts.map((a) => (
        <div key={a.id} className="mb-1.5 flex items-center justify-between rounded border border-border px-2 py-1.5">
          <span className="truncate text-foreground-strong">{accountLabel(a)}</span>
          <button
            type="button"
            aria-label={`Remove ${accountLabel(a)}`}
            title="Remove account"
            className="rounded p-1 text-muted hover:bg-hover hover:text-danger"
            onClick={() =>
              void api.removeAccount(a.id).then(() => app.reloadStartup())
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Button that opens the "create a new SSH key" form. */
export function SshCreate() {
  const [show, setShow] = useState(false)
  if (!show) return <Button onClick={() => setShow(true)}>Create a new SSH key...</Button>
  return <SshGenerateForm onDone={() => setShow(false)} onCancel={() => setShow(false)} />
}

export function SshGenerateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const app = useApp()
  const [genName, setGenName] = useState('id_ed25519_stlinux')
  const [genComment, setGenComment] = useState('')
  const [genPass, setGenPass] = useState('')
  const [genErr, setGenErr] = useState<string | null>(null)

  const generate = async () => {
    setGenErr(null)
    try {
      await api.sshGenerate(genName, genComment, genPass)
      await app.reloadStartup()
      app.notify('ok', 'SSH key created. Add the public key to your Bitbucket account.')
      onDone()
    } catch (e) {
      setGenErr(errText(e))
    }
  }

  return (
    <div className="rounded border border-border p-3">
      <Field label="File name (saved in ~/.ssh)">
        <input className={inputCls} value={genName} onChange={(e) => setGenName(e.target.value)} />
      </Field>
      <Field label="Comment (usually your email)">
        <input className={inputCls} value={genComment} onChange={(e) => setGenComment(e.target.value)} />
      </Field>
      <Field label="Passphrase (optional, recommended)">
        <input className={inputCls} type="password" value={genPass} onChange={(e) => setGenPass(e.target.value)} />
      </Field>
      {genErr && <p role="alert" className="mb-2 text-danger">{genErr}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={() => void generate()}>Create key</Button>
      </div>
    </div>
  )
}
