import { Monitor } from "lucide-react"

/**
 * Telas de configuração (credenciais, tokens, código de GTM) são trabalho de
 * computador: ninguém cola um signing secret pelo celular. Abaixo de `md`, em
 * vez de um layout espremido, um aviso honesto.
 *
 * Só CSS, sem `useIsMobile`: o hook devolve "desktop" no servidor, então o
 * conteúdo apareceria e sumiria na hidratação. Com `hidden md:contents` o
 * navegador já pinta a versão certa no primeiro quadro.
 */
export function DesktopOnly({
  acao = "configurar",
  children,
}: {
  /** Completa a frase "Para ___, abra no computador." */
  acao?: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="glass flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center md:hidden">
        <Monitor className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Para {acao}, abra no computador.</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Esta tela lida com credenciais e códigos de instalação, e foi feita para uma tela maior.
        </p>
      </div>
      <div className="hidden md:contents">{children}</div>
    </>
  )
}
