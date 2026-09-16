"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

/**
 * Ambos os ícones ficam sempre no DOM; qual aparece é decidido só por CSS
 * (`dark:` variant), nunca por estado de React — assim o HTML do servidor
 * e o primeiro render do cliente são idênticos (sem mismatch de hidratação,
 * sem precisar de um "mounted" gate).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Alternar tema claro/escuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
    </Button>
  )
}
