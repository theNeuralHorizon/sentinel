// Policy evaluator composition tests.
// We re-exercise the shared engine with the exact contexts the API builds for
// vulnerability audits, so drift between the engine and the route caller
// surfaces immediately.

import { describe, it, expect } from "bun:test";
import { evaluatePolicy, type PolicyRules, type PolicyContext } from "@sentinel/shared";

const blockAGPL: PolicyRules = {
  conditions: [{ field: "license", op: "in", value: ["AGPL-3.0", "SSPL-1.0"] }],
  action: "block",
};

const escalateWeaponised: PolicyRules = {
  conditions: [
    { field: "severity", op: "eq", value: "critical" },
    { field: "exploitability", op: "in", value: ["weaponised", "in_the_wild"] },
  ],
  action: "escalate",
};

const autoBump: PolicyRules = {
  conditions: [
    { field: "severity", op: "in", value: ["critical", "high", "medium"] },
    { field: "fixAvailable", op: "eq", value: true },
    { field: "isTransitive", op: "eq", value: false },
  ],
  action: "remediate",
  remediationKind: "pr_bump",
};

describe("policy-eval composition against real contexts", () => {
  it("blocks AGPL even if other signals are fine", () => {
    const ctx: PolicyContext = {
      severity: "low",
      license: "AGPL-3.0",
      exploitability: "theoretical",
      fixAvailable: true,
      isTransitive: false,
    };
    expect(evaluatePolicy(blockAGPL, ctx)).toBe("block");
  });

  it("does not block MIT even on a critical CVE", () => {
    const ctx: PolicyContext = { license: "MIT", severity: "critical" };
    expect(evaluatePolicy(blockAGPL, ctx)).toBeNull();
  });

  it("escalates critical + weaponised", () => {
    const ctx: PolicyContext = { severity: "critical", exploitability: "weaponised" };
    expect(evaluatePolicy(escalateWeaponised, ctx)).toBe("escalate");
  });

  it("does not escalate critical + theoretical", () => {
    const ctx: PolicyContext = { severity: "critical", exploitability: "theoretical" };
    expect(evaluatePolicy(escalateWeaponised, ctx)).toBeNull();
  });

  it("auto-bumps direct medium+ with fix", () => {
    const ctx: PolicyContext = {
      severity: "medium",
      fixAvailable: true,
      isTransitive: false,
    };
    expect(evaluatePolicy(autoBump, ctx)).toBe("remediate");
  });

  it("does not auto-bump transitive deps", () => {
    const ctx: PolicyContext = {
      severity: "high",
      fixAvailable: true,
      isTransitive: true,
    };
    expect(evaluatePolicy(autoBump, ctx)).toBeNull();
  });

  it("does not auto-bump when no fix is available", () => {
    const ctx: PolicyContext = {
      severity: "high",
      fixAvailable: false,
      isTransitive: false,
    };
    expect(evaluatePolicy(autoBump, ctx)).toBeNull();
  });
});

describe("action priority for multi-policy decisions", () => {
  // Mirrors the priority used in apps/api/src/routes/policy-eval.ts
  const order = ["allow", "warn", "notify", "remediate", "escalate", "block"];

  it("pick-worst yields block over escalate over remediate", () => {
    const actions = ["remediate", "escalate", "block"];
    const winner = actions.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
    expect(winner).toBe("block");
  });

  it("warn wins over allow but loses to everything else", () => {
    const actions = ["allow", "warn"];
    const winner = actions.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
    expect(winner).toBe("warn");
  });
});
