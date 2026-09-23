"use client"

import { PulsingBorder } from "@paper-design/shaders-react"
import { cn } from "cn"

/**
 * Borda animada com shader WebGL (PulsingBorder).
 *
 * Renderiza um canvas com `mix-blend-mode: screen` sobre o card,
 * tornando o fundo preto do shader invisível e deixando apenas
 * o brilho verde pulsante visível.
 *
 * Uso: envolver o conteúdo do card ou colocar como filho direto
 * de um container com `position: relative` e `overflow: hidden`.
 *
 * @example
 * ```tsx
 * <div className="relative overflow-hidden rounded-3xl ...">
 *   <ShaderCard roundness="lg" />
 *   <div className="relative z-10">...conteúdo...</div>
 * </div>
 * ```
 */
export function ShaderCard({
  /** "lg" = rounded-3xl (Chip), "md" = rounded-2xl (SmallChip) */
  roundness = "lg",
  className,
}: {
  roundness?: "lg" | "md"
  className?: string
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-[1] pointer-events-none mix-blend-screen",
        className
      )}
    >
      <PulsingBorder
        style={{ width: "100%", height: "100%" }}
        colors={["#79fd0d", "#6bebba"]}
        colorBack="#000000"
        roundness={roundness === "lg" ? 0.45 : 0.35}
        thickness={0.02}
        softness={1}
        intensity={0.2}
        bloom={0.25}
        spots={4}
        spotSize={0.5}
        pulse={0.25}
        smoke={0.3}
        smokeSize={0.6}
        speed={1}
        scale={1}
      />
    </div>
  )
}
