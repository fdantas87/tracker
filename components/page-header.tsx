export function PageHeader({
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  if (!children) return null
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      {children}
    </div>
  )
}

/** Marcador honesto para as telas que ainda não foram construídas. */
export function PhasePlaceholder({
  phase,
  children,
}: {
  phase: string
  children: React.ReactNode
}) {
  return (
    <div className="glass flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
      <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
        {phase}
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
