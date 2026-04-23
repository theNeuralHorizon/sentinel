import { describe, it, expect } from "bun:test";
import { evaluatePolicy } from "../src/policy";

describe("evaluatePolicy", () => {
  it("returns action when all conditions match", () => {
    const action = evaluatePolicy(
      {
        conditions: [
          { field: "severity", op: "eq", value: "critical" },
          { field: "cvss", op: "gte", value: 9.0 },
        ],
        action: "block",
      },
      { severity: "critical", cvss: 9.5 },
    );
    expect(action).toBe("block");
  });

  it("returns null when any condition fails", () => {
    const action = evaluatePolicy(
      {
        conditions: [
          { field: "severity", op: "eq", value: "critical" },
          { field: "cvss", op: "gte", value: 9.0 },
        ],
        action: "block",
      },
      { severity: "high", cvss: 9.5 },
    );
    expect(action).toBeNull();
  });

  it("supports regex matches", () => {
    const action = evaluatePolicy(
      {
        conditions: [{ field: "purl", op: "matches", value: "^pkg:npm/" }],
        action: "warn",
      },
      { purl: "pkg:npm/left-pad@1.0.0" },
    );
    expect(action).toBe("warn");
  });

  it("supports array membership", () => {
    const action = evaluatePolicy(
      {
        conditions: [{ field: "license", op: "in", value: ["AGPL-3.0", "SSPL-1.0"] }],
        action: "block",
      },
      { license: "AGPL-3.0" },
    );
    expect(action).toBe("block");
  });
});
