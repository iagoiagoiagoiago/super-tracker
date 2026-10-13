import type { ReactNode } from 'react'

export function Page({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="pt-safe mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pb-28">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          {eyebrow && <p className="text-[13px] text-faint">{eyebrow}</p>}
          <h1 className="text-[30px] font-extrabold tracking-tight">{title}</h1>
        </div>
        {action}
      </header>
      {children}
    </main>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] bg-surface p-4 ${className}`}>{children}</section>
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[15px] font-bold">{children}</h2>
      {aside && <span className="text-[11px] text-faint">{aside}</span>}
    </div>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[26px] font-bold leading-tight">{value}</div>
      <div className="mt-0.5 text-[11px] text-faint">{label}</div>
    </div>
  )
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line px-6 py-10 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  )
}

export function PhaseTag({ phase }: { phase: number }) {
  return (
    <span className="rounded-md bg-raised px-2 py-0.5 text-[10px] font-bold tracking-wider text-faint">
      PHASE {phase}
    </span>
  )
}
