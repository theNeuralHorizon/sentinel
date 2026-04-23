import { describe, it, expect } from "bun:test";
import {
  EventSubjects,
  ScanCompletedEventSchema,
  VulnerabilityDiscoveredEventSchema,
  PolicyViolatedEventSchema,
} from "../src/events";

describe("EventSubjects", () => {
  it("namespaces every subject under sentinel.", () => {
    for (const value of Object.values(EventSubjects)) {
      expect(value.startsWith("sentinel.")).toBe(true);
    }
  });

  it("uses dotted subject convention", () => {
    for (const value of Object.values(EventSubjects)) {
      // sentinel.<domain>.<action>
      expect(value.split(".").length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("event schemas", () => {
  it("accepts a well-formed ScanCompleted event", () => {
    const parsed = ScanCompletedEventSchema.parse({
      scanId: "11111111-1111-1111-1111-111111111111",
      projectId: "22222222-2222-2222-2222-222222222222",
      componentCount: 42,
      vulnCount: 3,
      riskScore: 76,
      durationMs: 1234,
      completedAt: new Date().toISOString(),
    });
    expect(parsed.componentCount).toBe(42);
  });

  it("rejects malformed uuid", () => {
    expect(() =>
      VulnerabilityDiscoveredEventSchema.parse({
        scanId: "not-a-uuid",
        projectId: "22222222-2222-2222-2222-222222222222",
        componentId: "33333333-3333-3333-3333-333333333333",
        vulnerabilityId: "44444444-4444-4444-4444-444444444444",
        advisoryId: "CVE-2024-0001",
        severity: "critical",
        componentPurl: "pkg:npm/x@1.0.0",
        discoveredAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("accepts flexible policy context shapes", () => {
    const parsed = PolicyViolatedEventSchema.parse({
      policyId: "11111111-1111-1111-1111-111111111111",
      policySlug: "block-agpl",
      action: "block",
      context: { license: "AGPL-3.0", component: "pkg:npm/x@1.0.0" },
    });
    expect(parsed.policySlug).toBe("block-agpl");
  });
});
