import { z } from "zod";
import { pickDriver, type LlmDriver } from "./providers";
import { REMEDIATION_SYSTEM, buildRemediationUserPrompt } from "./prompts/remediation";

export const RemediationPlanSchema = z.object({
  kind: z.enum([
    "pr_bump",
    "pr_swap",
    "issue_ticket",
    "notify_slack",
    "rotate_secret",
    "escalate_oncall",
    "custom_n8n",
    "none",
  ]),
  requires_approval: z.boolean(),
  parameters: z.record(z.unknown()),
  reasoning: z.string().max(1000),
});
export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;

export interface RemediationInput {
  advisoryId: string;
  severity: string;
  aiRiskScore?: number | null;
  exploitability?: string | null;
  componentName: string;
  componentVersion: string;
  componentEcosystem: string;
  fixedVersions: string[];
  licenseRisk?: string | null;
  hasSlack: boolean;
  hasPagerDuty: boolean;
  hasIssueTracker: boolean;
}

export async function proposeRemediation(
  input: RemediationInput,
  options?: { driver?: LlmDriver },
): Promise<RemediationPlan> {
  const driver = options?.driver ?? pickDriver();
  return driver.call<RemediationPlan>({
    systemPrompt: REMEDIATION_SYSTEM,
    userPrompt: buildRemediationUserPrompt(input),
    maxTokens: 1024,
    schema: RemediationPlanSchema,
  });
}
