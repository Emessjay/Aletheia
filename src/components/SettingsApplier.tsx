import { useEffect } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Translates non-CSS-toggleable settings (font size, etc.) into the document.
 * Mounted once at the top of the app, alongside ThemeProvider.
 */
export function SettingsApplier({ children }: { children: React.ReactNode }) {
  const fontSize = useSettingsStore((s) => s.fontSize);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--reader-font-size",
      `${fontSize}px`,
    );
  }, [fontSize]);
  return <>{children}</>;
}
