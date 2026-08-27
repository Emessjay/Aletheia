import { useQuery } from "@tanstack/react-query";
import {
  CORPUS_PACKS,
  tabRequiresPack,
  type CorpusPackId,
  type CorpusPackStatus,
} from "@/domain/corpusPacks";
import { getPlatform } from "@/platform";

const PACKS_QUERY_KEY = ["corpus-packs"] as const;

export function useCorpusPacks() {
  return useQuery({
    queryKey: PACKS_QUERY_KEY,
    queryFn: () => getPlatform().corpusPacks.list(),
    staleTime: 60_000,
  });
}

export function installedPackIds(
  statuses: CorpusPackStatus[] | undefined,
): Set<string> {
  const set = new Set<string>();
  if (!statuses) {
    // Until the first status fetch resolves, assume full content so we don't
    // flash-hide tabs on every cold start. Missing packs hide after load.
    for (const p of CORPUS_PACKS) set.add(p.id);
    return set;
  }
  for (const s of statuses) {
    if (s.installed) set.add(s.id);
  }
  return set;
}

export function isPackInstalled(
  statuses: CorpusPackStatus[] | undefined,
  id: CorpusPackId,
): boolean {
  return installedPackIds(statuses).has(id);
}

/** Whether a main-nav tab should render given pack install state. */
export function isTabAllowedByPacks(
  tabId: string,
  statuses: CorpusPackStatus[] | undefined,
): boolean {
  const required = tabRequiresPack(tabId);
  if (!required) return true;
  return isPackInstalled(statuses, required);
}
