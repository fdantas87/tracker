"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Envolve o app com next-themes. Tema escuro é o padrão do produto;
 * o toggle permite alternar para claro. Sem `enableSystem`: a escolha
 * é sempre explícita (dark por padrão), não segue o SO.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={["dark", "light"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
