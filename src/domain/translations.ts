import type { CorpusLanguage } from "@/db/types";

export const TRANSLATION_LABELS: Record<CorpusLanguage, string> = {
  he: "Hebrew",
  gk: "Greek",
  en_bsb: "English (Modern)",
  en_kjv: "English (King James)",
  en_brenton: "Brenton",
  en_web: "World English Bible",
  la: "Latin",
};

export function isEnglish(lang: CorpusLanguage): boolean {
  return (
    lang === "en_bsb" ||
    lang === "en_kjv" ||
    lang === "en_brenton" ||
    lang === "en_web"
  );
}
