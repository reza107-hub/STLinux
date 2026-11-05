import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ variant = 'secondary', className = '', ...rest }: BtnProps) {
  const base =
    'inline-flex h-7 items-center justify-center gap-1.5 rounded px-3 font-medium disabled:cursor-not-allowed disabled:opacity-50 '
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    secondary: 'border border-border bg-surface-raised text-foreground-strong hover:bg-hover',
    danger: 'bg-danger text-primary-foreground hover:opacity-90',
    ghost: 'text-foreground hover:bg-hover',
  }[variant]
  return <button type="button" className={base + styles + ' ' + className} {...rest} />
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={
        'flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-foreground-strong disabled:opacity-40 ' +
        className
      }
      {...rest}
    >
      {children}
    </button>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 440,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width, maxWidth: '100%' }}
        className="flex max-h-full flex-col rounded border border-border bg-surface-raised shadow-2xl"
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
          <h2 className="text-[13px] font-semibold text-foreground-strong">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-3 py-2">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'h-7 w-full rounded border border-border bg-background px-2 text-foreground-strong placeholder:text-muted'

export function Check({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={'flex items-center gap-2 ' + (disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  )
}

/** Drag handle. `onDrag` receives the pixel delta since the drag began. */
export function Splitter({
  dir,
  onDrag,
  onStart,
}: {
  dir: 'col' | 'row'
  onDrag: (delta: number) => void
  onStart?: () => void
}) {
  const latest = useRef({ onDrag, onStart })
  useEffect(() => {
    latest.current = { onDrag, onStart }
  })
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  return (
    <div
      role="separator"
      aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'}
      onMouseDown={(e) => {
        const origin = dir === 'col' ? e.clientX : e.clientY
        latest.current.onStart?.()
        const move = (ev: MouseEvent) =>
          latest.current.onDrag((dir === 'col' ? ev.clientX : ev.clientY) - origin)
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          document.body.style.cursor = ''
          stop.current = null
        }
        stop.current = up
        document.body.style.cursor = dir === 'col' ? 'col-resize' : 'row-resize'
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        e.preventDefault()
      }}
      className={
        'z-10 shrink-0 bg-splitter bg-clip-content hover:bg-primary ' +
        (dir === 'col' ? 'w-px cursor-col-resize px-[3px]' : 'h-px cursor-row-resize py-[3px]')
      }
    />
  )
}

export type MenuItem =
  | { label: string; onClick: () => void; hint?: string; disabled?: boolean }
  | { separator: true }

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - items.length * 26 - 10)
  return (
    <div
      role="menu"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[60] min-w-52 rounded border border-border bg-surface-raised py-1 shadow-xl"
    >
      {items.map((it, i) =>
        'separator' in it ? (
          <div key={i} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.onClick()
            }}
            className="flex h-6 w-full items-center justify-between gap-6 px-3 text-left hover:bg-hover disabled:opacity-40"
          >
            <span>{it.label}</span>
            {it.hint && <span className="text-muted">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}

export type BranchGroup = { title: string; names: string[] }

/** Dropdown with checkboxes. Empty selection means "All branches". */
export function BranchMultiSelect({
  selected,
  onChange,
  groups,
}: {
  selected: string[]
  onChange: (v: string[]) => void
  groups: BranchGroup[]
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const toggle = (n: string) =>
    onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n])
  const label =
    selected.length === 0 ? 'All branches' : selected.length === 1 ? selected[0] : `${selected.length} branches`
  const row = 'flex h-6 w-full cursor-pointer items-center gap-2 px-3 text-left hover:bg-hover'
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Branch filter"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-5 max-w-48 truncate rounded border border-border bg-background px-2 text-foreground-strong"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-[60] max-h-80 min-w-52 overflow-y-auto rounded border border-border bg-surface-raised py-1 shadow-xl">
          <button type="button" className={row} onClick={() => onChange([])}>
            <input type="checkbox" className="size-3.5 accent-primary" checked={selected.length === 0} readOnly tabIndex={-1} />
            All branches
          </button>
          {groups.map((g) =>
            g.names.length === 0 ? null : (
              <div key={g.title}>
                <div className="mt-1 border-t border-border px-3 pt-1 text-muted">{g.title}</div>
                {g.names.map((n) => (
                  <label key={n} className={row}>
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={selected.includes(n)}
                      onChange={() => toggle(n)}
                    />
                    <span className="truncate">{n}</span>
                  </label>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className="inline-block animate-spin rounded-full border-2 border-border border-t-primary"
    />
  )
}
