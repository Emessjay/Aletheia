import { describe, expect, it } from "vitest";
import {
  RESOURCES_CORPORA,
  corpusIdForWork,
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

  it("maps work slugs back to their landing category", () => {
    expect(corpusIdForWork("anf01.justin-martyr")).toBe("anf");
    expect(corpusIdForWork("npnf104.chrysostom")).toBe("npnf");
    expect(corpusIdForWork("luther_bondage")).toBe("reformers");
    expect(corpusIdForWork("summa")).toBe("base");
    expect(corpusIdForWork("unknown-work")).toBeNull();
  });

  it("narrows corpus ids", () => {
    expect(isResourcesCorpusId("anf")).toBe(true);
    expect(isResourcesCorpusId("commentaries")).toBe(false);
  });
});
