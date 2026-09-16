export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </header>
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
