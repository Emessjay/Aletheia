// /api/corpus/{select,selectOne}
//
// Mirror the CorpusAdapter shape — these endpoints are POST (not GET) because
// SQL strings can exceed URL length limits and may contain characters that
// would need escaping. The frontend's web adapter (Wave 3b) will call these
// with the same `{ sql, params }` body shape that the Tauri plugin accepts.

import { Router } from "express";
import type { CorpusHandle } from "../corpus";
import { QueryError } from "../corpus";

interface QueryBody {
  sql?: unknown;
  params?: unknown;
}

function normalizeParams(raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new QueryError("params must be an array", 400);
  }
  return raw;
}

export function corpusRouter(corpus: CorpusHandle): Router {
  const router = Router();

  router.post("/select", (req, res) => {
    const { sql, params } = req.body as QueryBody;
    if (typeof sql !== "string") {
      res.status(400).json({ error: "sql must be a string" });
      return;
    }
    try {
      const rows = corpus.select(sql, normalizeParams(params));
      res.json({ rows });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/selectOne", (req, res) => {
    const { sql, params } = req.body as QueryBody;
    if (typeof sql !== "string") {
      res.status(400).json({ error: "sql must be a string" });
      return;
    }
    try {
      const row = corpus.selectOne(sql, normalizeParams(params));
      res.json({ row });
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}

function handleErr(res: import("express").Response, err: unknown): void {
  if (err instanceof QueryError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: message });
}
