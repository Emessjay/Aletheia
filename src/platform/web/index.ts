// Web platform assembly. Mirrors src/platform/tauri/index.ts; the runtime
// selector in src/platform/index.ts picks whichever Platform matches the
// host environment, so feature code only sees the Platform interface.

import type { Platform } from "../types";
import { webCorpus } from "./corpus";
import { webUserData } from "./userData";
import { webAudio } from "./audio";
import { webPreferences } from "./preferences";
import { webInfo } from "./info";

export const webPlatform: Platform = {
  corpus: webCorpus,
  userData: webUserData,
  audio: webAudio,
  preferences: webPreferences,
  info: webInfo,
};
