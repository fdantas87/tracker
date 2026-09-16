import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const swatches = [
  { name: "primary", label: "Primária (verde-neon)" },
  { name: "cyan", label: "Accent ciano" },
  { name: "amber", label: "Accent âmbar" },
  { name: "chart-4", label: "Chart 4" },
  { name: "chart-5", label: "Chart 5" },
  { name: "destructive", label: "Destrutivo" },
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Negou Tracking
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Design system
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="glass rounded-2xl p-6">
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">
          Tipografia
        </h2>
        <p className="text-3xl font-semibold tracking-tight">
          Manrope para texto, JetBrains Mono para números
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Fase 1 concluída: fundação do app (Next.js, Tailwind v4, shadcn/ui),
          tema escuro como padrão com toggle claro, e os tokens de cor em HSL
          que vão guiar o resto do painel.
        </p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono">
          <span className="text-4xl font-semibold tabular-nums">
            R$ 128.430,90
          </span>
          <span className="text-lg text-muted-foreground tabular-nums">
            1.024 eventos · 3,42% conversão
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {swatches.map((s) => (
          <div
            key={s.name}
            className="glass flex items-center gap-3 rounded-xl p-4"
          >
            <span
              className="size-8 shrink-0 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: `var(--${s.name})` }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.label}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                --{s.name}
              </p>
            </div>
          </div>
        ))}
      </section>

      <Separator />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Componentes (shadcn/ui + Radix)</CardTitle>
            <CardDescription>
              Botões, badges e cards já herdam a paleta verde-neon/ciano/âmbar
              via variáveis CSS.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button>Primário</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destrutivo</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Ativo</Badge>
              <Badge variant="secondary">Pendente</Badge>
              <Badge variant="outline">Rascunho</Badge>
              <Badge variant="destructive">Erro</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Cartão glass</CardTitle>
            <CardDescription>
              Fundo semi-transparente + blur sobre o gradiente radial do tema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-background/60 p-3 text-xs">
              {`{
  "event_name": "Purchase",
  "value": 297.00,
  "currency": "BRL"
}`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
