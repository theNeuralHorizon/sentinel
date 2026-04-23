import { describe, it, expect } from "bun:test";
import { ComponentSchema, ScanRequestSchema, ScanResultSchema } from "../src/sbom";

describe("ComponentSchema", () => {
  it("accepts a minimal component", () => {
    const c = ComponentSchema.parse({
      ecosystem: "npm",
      name: "lodash",
      version: "4.17.21",
      purl: "pkg:npm/lodash@4.17.21",
    });
    expect(c.isTransitive).toBe(false);
    expect(c.directDependents).toEqual([]);
  });

  it("rejects empty name or version", () => {
    expect(() =>
      ComponentSchema.parse({ ecosystem: "npm", name: "", version: "1.0.0", purl: "pkg:npm/-@1.0.0" }),
    ).toThrow();
    expect(() =>
      ComponentSchema.parse({ ecosystem: "npm", name: "x", version: "", purl: "pkg:npm/x@" }),
    ).toThrow();
  });

  it("rejects bad ecosystems", () => {
    expect(() =>
      ComponentSchema.parse({ ecosystem: "unobtainium", name: "x", version: "1", purl: "pkg:x/x@1" }),
    ).toThrow();
  });
});

describe("ScanRequestSchema", () => {
  it("defaults kind and triggeredBy", () => {
    const req = ScanRequestSchema.parse({
      projectId: "11111111-1111-1111-1111-111111111111",
      workDir: "/workspace",
    });
    expect(req.kind).toBe("full");
    expect(req.triggeredBy).toBe("api");
  });
});

describe("ScanResultSchema", () => {
  it("accepts a valid result envelope", () => {
    const r = ScanResultSchema.parse({
      scanId: "11111111-1111-1111-1111-111111111111",
      status: "completed",
      componentCount: 1,
      vulnCount: 0,
      components: [
        {
          ecosystem: "npm",
          name: "x",
          version: "1.0.0",
          purl: "pkg:npm/x@1.0.0",
        },
      ],
      vulnerabilities: [],
      sbomFormat: "cyclonedx-1.6",
      sbomContent: "{}",
      durationMs: 42,
    });
    expect(r.status).toBe("completed");
  });
});
