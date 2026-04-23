import { describe, it, expect } from "bun:test";
import { classifyLicense, pickWorst } from "../src/licenses";

describe("classifyLicense", () => {
  it("classifies known permissive licenses as low", () => {
    expect(classifyLicense("MIT")).toBe("low");
    expect(classifyLicense("Apache-2.0")).toBe("low");
    expect(classifyLicense("BSD-3-Clause")).toBe("low");
  });

  it("classifies AGPL as critical", () => {
    expect(classifyLicense("AGPL-3.0")).toBe("critical");
  });

  it("picks worst in expressions", () => {
    expect(classifyLicense("(MIT OR AGPL-3.0)")).toBe("critical");
    expect(classifyLicense("Apache-2.0 AND MPL-2.0")).toBe("medium");
  });

  it("returns unknown for empty/null", () => {
    expect(classifyLicense("")).toBe("unknown");
    expect(classifyLicense(null)).toBe("unknown");
    expect(classifyLicense(undefined)).toBe("unknown");
  });

  it("handles unknown licenses via keywords", () => {
    expect(classifyLicense("GPL-1.0")).toBe("high");
    expect(classifyLicense("Some non-commercial license")).toBe("critical");
  });
});

describe("pickWorst", () => {
  it("orders risk correctly", () => {
    expect(pickWorst(["low", "medium", "critical", "high"])).toBe("critical");
    expect(pickWorst(["low", "low"])).toBe("low");
    expect(pickWorst([])).toBe("low");
  });
});
