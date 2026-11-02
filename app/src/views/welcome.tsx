import { Check, Circle, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AccountForm, AccountsList, HOSTS, SshPanel, type HostKind } from '../components/accounts'
import { Button, Field, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { errText } from '../lib/format'
import { useApp } from '../lib/store'

export const ONBOARDED_KEY = 'stlinux-onboarded'

export default function Welcome({ onDone }: { onDone: () => void }) {
  const app = useApp()
  const [step, setStep] = useState<'account' | 'prefs'>('account')
  const [host, setHost] = useState<HostKind | null>(null)
  const [gitVer, setGitVer] = useState<string | null>(null)
  const [gitErr, setGitErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const accounts = app.startup?.accounts ?? []
  const keys = app.startup?.sshKeys ?? []
  const connected = accounts.length > 0 || keys.length > 0

  useEffect(() => {
    void api.gitVersion().then(setGitVer).catch((e) => setGitErr(errText(e)))
    void api.getIdentity(null).then((i) => { setName(i.name); setEmail(i.email) }).catch(() => undefined)
  }, [])

  const finish = async () => {
    setErr(null)
    try {
      if (name.trim() && email.trim()) await api.setIdentity(name.trim(), email.trim())
      localStorage.setItem(ONBOARDED_KEY, '1')
      onDone()
    } catch (e) {
      setErr(errText(e))
    }
  }

  const steps = [
    { id: 'install', label: 'Install', done: !!gitVer },
    { id: 'account', label: 'Account', done: step === 'prefs' },
    { id: 'prefs', label: 'Preferences', done: false },
  ]

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex h-[440px] w-[720px] max-w-full overflow-hidden rounded border border-border bg-surface-raised shadow-2xl">
        <div className="flex w-[220px] shrink-0 flex-col bg-primary px-5 pb-5 pt-[34px] text-primary-foreground">
          <div className="mb-4 text-xl font-bold">STLinux</div>
          {steps.map((s) => (
            <div key={s.id} className="mb-[15px] flex items-center gap-3 pl-0.5">
              {s.done ? <Check size={18} /> : <Circle size={18} className={s.id === step ? '' : 'opacity-60'} />}
              <span className={s.id === step ? 'font-semibold' : 'opacity-80'}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-7">
          <div className="min-h-0 flex-1 overflow-auto">
            {gitErr && <p role="alert" className="mb-3 rounded border border-danger p-2 text-danger">Git was not found. Install it with: sudo apt install git</p>}
            {step === 'account' && !host && (
              <>
                <h1 className="mb-3 mt-1 text-[22px] font-semibold text-foreground-strong">Connect your accounts</h1>
                <p className="mb-5">
                  Connect Bitbucket Cloud or Bitbucket Server to browse and clone your repositories, or use an SSH key.
                  {keys.length > 0 && ` We found ${keys.length} SSH key${keys.length > 1 ? 's' : ''} on this computer.`}
                  {' '}You can skip this and add accounts later in Preferences.
                </p>
                <div className="mb-4 flex justify-center gap-4">
                  {HOSTS.map((h) => (
                    <button key={h.id} type="button" onClick={() => setHost(h.id)} className="flex w-[150px] flex-col items-center gap-2 rounded border border-border p-4 hover:bg-hover">
                      <h.icon size={40} strokeWidth={1.25} />
                      <span className="text-sm font-semibold text-foreground-strong">{h.name}</span>
                      <span className="text-muted">{h.blurb}</span>
                    </button>
                  ))}
                </div>
                <AccountsList />
                {keys.length > 0 && (
                  <p className="flex items-center gap-2 text-success"><KeyRound size={14} /> SSH key detected: {keys.map((k) => k.name).join(', ')}</p>
                )}
              </>
            )}
            {step === 'account' && host && host !== 'ssh' && (
              <>
                <h1 className="mb-4 mt-1 text-[22px] font-semibold text-foreground-strong">Login to {HOSTS.find((h) => h.id === host)?.name}</h1>
                <AccountForm kind={host} onCancel={() => setHost(null)} onDone={() => setHost(null)} />
              </>
            )}
            {step === 'account' && host === 'ssh' && (
              <>
                <h1 className="mb-4 mt-1 text-[22px] font-semibold text-foreground-strong">SSH keys</h1>
                <SshPanel />
                <div className="mt-3"><Button onClick={() => setHost(null)}>Back</Button></div>
              </>
            )}
            {step === 'prefs' && (
              <>
                <h1 className="mb-3 mt-1 text-[22px] font-semibold text-foreground-strong">Your details</h1>
                <p className="mb-5">Git adds these to every commit you make.</p>
                <Field label="Full name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
                <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                {err && <p role="alert" className="text-danger">{err}</p>}
              </>
            )}
          </div>
          <div className="flex h-10 shrink-0 items-end justify-end gap-2">
            {step === 'account' && host ? null : step === 'account' ? (
              <>
                <Button className="px-4" onClick={() => setStep('prefs')}>Skip</Button>
                <Button className="px-4" variant="primary" disabled={!connected} onClick={() => setStep('prefs')}>Next</Button>
              </>
            ) : (
              <>
                <Button className="px-4" onClick={() => setStep('account')}>Back</Button>
                <Button className="px-4" variant="primary" onClick={() => void finish()}>Finish</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
