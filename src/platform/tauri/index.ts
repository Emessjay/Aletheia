// Tauri platform assembly. Aggregates the per-capability adapters into a
// single Platform instance that getPlatform() returns.

import type { Platform } from "../types";
import { tauriCorpus } from "./corpus";
import { tauriUserData } from "./userData";
import { tauriAudio } from "./audio";
import { tauriPreferences } from "./preferences";
import { tauriInfo } from "./info";

export const tauriPlatform: Platform = {
  corpus: tauriCorpus,
  userData: tauriUserData,
  audio: tauriAudio,
  preferences: tauriPreferences,
  info: tauriInfo,
};
