import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useApp } from '../lib/store'

export default function Toasts() {
  const { toasts, busy } = useApp()
  return (
    <>
      {busy && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[70]">
          <div className="h-1 w-full overflow-hidden bg-hover">
            <div className="h-full w-1/3 animate-[slide_1s_linear_infinite] bg-primary" />
          </div>
          <div className="mx-auto mt-1 w-fit rounded border border-border bg-surface-raised px-3 py-0.5 text-foreground-strong shadow">{busy}...</div>
        </div>
      )}
      <div aria-live="polite" className="pointer-events-none fixed bottom-3 right-3 z-[70] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={'pointer-events-auto flex items-start gap-2 rounded border bg-surface-raised p-2.5 shadow-lg ' + (t.kind === 'error' ? 'border-danger' : 'border-border')}>
            {t.kind === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />}
            <span className="min-w-0 break-words text-foreground-strong">{t.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}
