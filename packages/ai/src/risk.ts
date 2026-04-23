import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createAiClient, DEFAULT_MODEL } from "./client";
import {
  RISK_ANALYSIS_SYSTEM,
  buildRiskAnalysisUserPrompt,
} from "./prompts/risk-analysis";

const RiskAnalysisResultSchema = z.object({
  ai_risk_score: z.number().int().min(0).max(100),
  exploitability: z.enum(["theoretical", "poc_public", "weaponised", "in_the_wild"]),
  business_impact: z.enum(["none", "minor", "moderate", "significant", "severe"]),
  reasoning: z.string().min(1).max(1500),
});
export type RiskAnalysisResult = z.infer<typeof RiskAnalysisResultSchema>;

export interface RiskAnalysisInput {
  advisoryId: string;
  summary: string;
  details?: string | null;
  severity: string;
  cvssScore?: number | null;
  cvssVector?: string | null;
  epssScore?: number | null;
  componentName: string;
  componentVersion: string;
  componentEcosystem: string;
  componentPurl: string;
  isTransitive: boolean;
  fixedVersions: string[];
  projectContext?: string;
}

// Extract the first valid JSON object from possibly-noisy LLM output.
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path — pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error(`no JSON object found in model output: ${raw.slice(0, 120)}...`);
}

export async function analyzeRisk(
  input: RiskAnalysisInput,
  options?: { client?: Anthropic; model?: string },
): Promise<RiskAnalysisResult> {
  const client = options?.client ?? createAiClient();
  const model = options?.model ?? DEFAULT_MODEL;

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: RISK_ANALYSIS_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildRiskAnalysisUserPrompt(input) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in risk analysis response");
  }

  return RiskAnalysisResultSchema.parse(extractJson(textBlock.text));
}
