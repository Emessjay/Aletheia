// Entry point for the web/Railway build.
//
// Wave 3 split Aletheia's host-environment access behind a platform adapter
// (src/platform/). The Tauri build implements that adapter natively; this
// server implements the same surface as JSON-over-HTTP so the upcoming
// browser build (Wave 3b) can run the identical React app against a remote
// corpus.
//
// Boot order:
//   1. open the corpus DB read-only (failing fast if the file is missing —
//      Railway healthcheck won't pass without it),
//   2. mount /api/health, /api/corpus, /api/audio,
//   3. mount static-file serving + SPA fallback last so /api/* takes
//      precedence over any same-named asset.

import express from "express";
import path from "path";
import { openCorpus } from "./corpus";
import { corpusRouter } from "./routes/corpus";
import { audioRouter } from "./routes/audio";
import { mountStatic } from "./static";

function resolveCorpusPath(): string {
  const env = process.env.ALETHEIA_CORPUS_PATH;
  if (env && env.length > 0) return path.resolve(env);
  // Local dev default: server/ is a sibling of data/.
  return path.resolve(__dirname, "..", "..", "data", "Aletheia.sqlite");
}

function resolveAudioCache(): string {
  const env = process.env.ALETHEIA_AUDIO_CACHE;
  return path.resolve(env && env.length > 0 ? env : "/tmp/aletheia-audio");
}

function resolveStaticDir(): string {
  const env = process.env.ALETHEIA_STATIC_DIR;
  if (env && env.length > 0) return path.resolve(env);
  // In the Docker image, the server bundle lives at /app and the frontend
  // bundle is copied to /app/public. In local dev, dist/ sits at the repo
  // root, two levels up from server/dist/.
  const docker = path.resolve(__dirname, "..", "public");
  if (require("fs").existsSync(path.join(docker, "index.html"))) return docker;
  return path.resolve(__dirname, "..", "..", "dist");
}

async function main(): Promise<void> {
  const corpusPath = resolveCorpusPath();
  const audioCache = resolveAudioCache();
  const staticDir = resolveStaticDir();

  console.log(`[aletheia-server] corpus: ${corpusPath}`);
  console.log(`[aletheia-server] audio cache: ${audioCache}`);
  console.log(`[aletheia-server] static dir: ${staticDir}`);

  const corpus = openCorpus(corpusPath);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, corpus: "loaded" });
  });

  app.use("/api/corpus", corpusRouter(corpus));
  app.use("/api/audio", audioRouter(audioCache));

  const staticHandle = await mountStatic(staticDir);
  app.use(staticHandle.router);

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.log(`[aletheia-server] listening on :${port}`);
  });

  // Best-effort clean shutdown so the WAL files don't get left in a weird
  // state if Railway sends SIGTERM during a redeploy.
  const shutdown = (signal: string) => {
    console.log(`[aletheia-server] ${signal} received, closing corpus`);
    try {
      corpus.close();
    } catch {
      // Already closed or never opened; nothing actionable.
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[aletheia-server] fatal:", err);
  process.exit(1);
});
