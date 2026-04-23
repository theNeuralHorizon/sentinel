import { z } from "zod";

// Policy rules engine — declarative conditions + actions.
// Kept intentionally small to be auditable; anything exotic goes to n8n.

export const PolicyOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains",
  "matches",
]);
export type PolicyOperator = z.infer<typeof PolicyOperatorSchema>;

export const PolicyConditionSchema = z.object({
  field: z.string(),
  op: PolicyOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});
export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;

export const PolicyActionSchema = z.enum([
  "allow",
  "warn",
  "block",
  "escalate",
  "remediate",
  "notify",
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyRulesSchema = z.object({
  // All conditions must match (AND). Use multiple policies for OR.
  conditions: z.array(PolicyConditionSchema),
  action: PolicyActionSchema,
  remediationKind: z.string().optional(),
  notify: z
    .object({
      channels: z.array(z.string()).default([]),
      severity: z.string().optional(),
    })
    .optional(),
});
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

// Evaluation context — a flat record of values the rules can test.
export type PolicyContext = Record<string, string | number | boolean | string[] | number[] | null | undefined>;

export function evaluateCondition(
  condition: PolicyCondition,
  ctx: PolicyContext,
): boolean {
  const actual = ctx[condition.field];
  const expected = condition.value;

  switch (condition.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "in":
      return Array.isArray(expected) && (expected as readonly unknown[]).includes(actual as unknown);
    case "not_in":
      return Array.isArray(expected) && !(expected as readonly unknown[]).includes(actual as unknown);
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return (actual as unknown[]).includes(expected);
      }
      return false;
    case "matches":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        new RegExp(expected).test(actual)
      );
    default: {
      const _exhaustive: never = condition.op;
      return _exhaustive;
    }
  }
}

export function evaluatePolicy(rules: PolicyRules, ctx: PolicyContext): PolicyAction | null {
  const allMatch = rules.conditions.every((c) => evaluateCondition(c, ctx));
  return allMatch ? rules.action : null;
}
