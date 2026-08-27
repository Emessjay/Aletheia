import { describe, expect, it } from "vitest";
import {
  RESOURCES_CORPORA,
  isResourcesCorpusId,
  workMatchesCorpus,
} from "./resourcesCorpora";

describe("resourcesCorpora", () => {
  it("lists the four landing categories", () => {
    expect(RESOURCES_CORPORA.map((c) => c.id)).toEqual([
      "anf",
      "npnf",
      "reformers",
      "base",
    ]);
  });

  it("matches ANF / NPNF / reformers / base slugs", () => {
    expect(workMatchesCorpus("anf01.justin-martyr", "anf")).toBe(true);
    expect(workMatchesCorpus("npnf104.chrysostom", "npnf")).toBe(true);
    expect(workMatchesCorpus("luther_bondage", "reformers")).toBe(true);
    expect(workMatchesCorpus("calvin_institutes", "reformers")).toBe(true);
    expect(workMatchesCorpus("summa", "base")).toBe(true);
    expect(workMatchesCorpus("creeds3", "base")).toBe(true);
    expect(workMatchesCorpus("summa", "anf")).toBe(false);
    expect(workMatchesCorpus("anf01.justin-martyr", "base")).toBe(false);
  });

  it("narrows corpus ids", () => {
    expect(isResourcesCorpusId("anf")).toBe(true);
    expect(isResourcesCorpusId("commentaries")).toBe(false);
  });
});
