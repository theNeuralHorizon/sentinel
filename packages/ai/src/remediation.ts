import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createAiClient, DEFAULT_MODEL } from "./client";
import { REMEDIATION_SYSTEM, buildRemediationUserPrompt } from "./prompts/remediation";
import { extractJson } from "./risk";

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
  options?: { client?: Anthropic; model?: string },
): Promise<RemediationPlan> {
  const client = options?.client ?? createAiClient();
  const model = options?.model ?? DEFAULT_MODEL;

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: REMEDIATION_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildRemediationUserPrompt(input) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in remediation response");
  }
  return RemediationPlanSchema.parse(extractJson(textBlock.text));
}
