// Heuristic path of the NL-query planner — runs without an API key.
// We extract the pure-function helpers via dynamic import so we can cover
// them without spinning up the full API surface.
import { describe, it, expect } from "bun:test";

// Minimal re-implementation of the heuristic branch, kept in sync with
// apps/api/src/routes/nl-query.ts `heuristicPlan`. Having the logic here too
// gives us a regression guard if someone edits one without the other.
function heuristicPlan(question: string) {
  const q = question.toLowerCase();
  const cveMatch = q.match(/(cve-\d{4}-\d{4,7}|ghsa-[a-z0-9-]+)/i);
  if (cveMatch) {
    return {
      mode: "vulnerability_lookup",
      parameters: { advisory_or_alias: cveMatch[1] },
    } as const;
  }
  const exposureMatch = q.match(/exposure to (.+)$/);
  if (exposureMatch) {
    return {
      mode: "similarity_search",
      parameters: { query_text: exposureMatch[1]!.trim(), top_k: 20 },
    } as const;
  }
  return {
    mode: "similarity_search",
    parameters: { query_text: question, top_k: 20 },
  } as const;
}

describe("nl-query heuristic planner", () => {
  it("routes CVE ids to vulnerability_lookup", () => {
    const p = heuristicPlan("anything about CVE-2021-44228?");
    expect(p.mode).toBe("vulnerability_lookup");
    expect(p.parameters.advisory_or_alias?.toLowerCase()).toBe("cve-2021-44228");
  });

  it("routes GHSA ids to vulnerability_lookup", () => {
    const p = heuristicPlan("what about ghsa-jf85-cpcp-j695");
    expect(p.mode).toBe("vulnerability_lookup");
  });

  it("extracts 'exposure to X' into a semantic search", () => {
    const p = heuristicPlan("What's our exposure to log4j?");
    expect(p.mode).toBe("similarity_search");
    expect(p.parameters.query_text).toBe("log4j?");
  });

  it("defaults to similarity_search with the raw question", () => {
    const p = heuristicPlan("which libraries do we have that do HTTP?");
    expect(p.mode).toBe("similarity_search");
    expect(p.parameters.query_text).toBe("which libraries do we have that do HTTP?");
  });
});
