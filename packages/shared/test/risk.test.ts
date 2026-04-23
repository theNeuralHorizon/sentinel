import { describe, it, expect } from "bun:test";
import { computeBaselineRisk, aggregateProjectRisk } from "../src/risk";

describe("computeBaselineRisk", () => {
  it("scores critical CVE with high CVSS near 100", () => {
    const score = computeBaselineRisk({
      severity: "critical",
      cvssScore: 9.8,
      epssScore: 0.9,
    });
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores info-level vuln with no CVSS below 20", () => {
    const score = computeBaselineRisk({ severity: "info" });
    expect(score).toBeLessThan(20);
  });

  it("penalises unfixable critical", () => {
    const a = computeBaselineRisk({ severity: "critical", cvssScore: 7, fixAvailable: true });
    const b = computeBaselineRisk({ severity: "critical", cvssScore: 7, fixAvailable: false });
    expect(b).toBeGreaterThan(a);
  });

  it("caps at 100", () => {
    const score = computeBaselineRisk({
      severity: "critical",
      cvssScore: 10,
      epssScore: 1,
      licenseRisk: "critical",
      componentPopularity: 1,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("aggregateProjectRisk", () => {
  it("returns 0 for empty", () => {
    expect(aggregateProjectRisk([])).toBe(0);
  });

  it("is dominated by peak", () => {
    const low = aggregateProjectRisk([10, 10, 10, 10, 10]);
    const peaked = aggregateProjectRisk([10, 10, 10, 10, 95]);
    expect(peaked).toBeGreaterThan(low);
    expect(peaked).toBeGreaterThan(60);
  });
});
