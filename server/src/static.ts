// Static-site host for the production-built React frontend.
//
// `staticDir` is the directory containing `index.html` and the Vite asset
// bundle. In local dev that's `../dist/` relative to the server source; in
// the Docker image it's `/app/public/`. The SPA fallback rewrites any
// non-/api 404 to `index.html` so React Router's client-side routes work on
// direct URL hits (e.g. /reader/bible/john/1).

import { Router, static as expressStatic } from "express";
import { promises as fsp } from "fs";
import path from "path";

export interface StaticHandle {
  router: Router;
  /** Resolved absolute path of the directory being served, for logging. */
  resolved: string | null;
}

export async function mountStatic(staticDir: string): Promise<StaticHandle> {
  const router = Router();
  const indexPath = path.join(staticDir, "index.html");
  let resolved: string | null = null;
  try {
    await fsp.access(indexPath);
    resolved = staticDir;
  } catch {
    // Frontend bundle isn't built — the server still boots so /api routes
    // remain reachable during local dev iterations on the API.
    router.get("/", (_req, res) => {
      res
        .status(503)
        .type("text/plain")
        .send(
          `Frontend bundle not found at ${indexPath}. ` +
            `Run \`npm run build\` in the repo root, or set the working directory so ` +
            `that relative path resolves to a built dist/.\n`,
        );
    });
    return { router, resolved };
  }

  router.use(expressStatic(staticDir, { index: false, fallthrough: true }));
  router.get("*", (_req, res) => {
    res.sendFile(indexPath);
  });
  return { router, resolved };
}
