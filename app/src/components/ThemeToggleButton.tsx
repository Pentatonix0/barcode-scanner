import { useEffect, useMemo, useState } from "react";

import { useI18n } from "../i18n";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "barcode_reader_ui_theme";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggleButton() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const nextTheme = theme === "light" ? "dark" : "light";
  const label = useMemo(
    () => (nextTheme === "dark" ? t("theme.toDark") : t("theme.toLight")),
    [nextTheme, t]
  );

  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
      title={label}
    >
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
        </svg>
      )}
    </button>
  );
}
