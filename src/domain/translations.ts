import type { CorpusLanguage } from "@/db/types";

export const TRANSLATION_LABELS: Record<CorpusLanguage, string> = {
  he: "Hebrew",
  gk: "Greek",
  en_bsb: "BSB",
  en_kjv: "KJV",
  en_brenton: "Brenton",
  la: "Latin",
};

export function isEnglish(lang: CorpusLanguage): boolean {
  return lang === "en_bsb" || lang === "en_kjv" || lang === "en_brenton";
}
