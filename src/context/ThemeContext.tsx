import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type ThemePreference = "system" | "light" | "dark"

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const storageKey = "pathly-theme-preference"

function initialPreference(): ThemePreference {
  const stored = window.localStorage.getItem(storageKey)
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference)

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved = preference === "system" ? (query.matches ? "dark" : "light") : preference
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    query.addEventListener("change", apply)
    window.localStorage.setItem(storageKey, preference)
    return () => query.removeEventListener("change", apply)
  }, [preference])

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme must be used within ThemeProvider")
  return value
}
