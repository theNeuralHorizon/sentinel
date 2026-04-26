import { z } from "zod";
import { pickDriver, type LlmDriver } from "./providers";
import { RISK_ANALYSIS_SYSTEM, buildRiskAnalysisUserPrompt } from "./prompts/risk-analysis";

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

/**
 * AI-driven risk analysis. The driver argument is optional — if omitted,
 * we pick one based on env: LLM_PROVIDER + the matching API key. When
 * neither key is present, the driver throws LlmUnavailableError and the
 * caller falls back to the deterministic baseline.
 */
export async function analyzeRisk(
  input: RiskAnalysisInput,
  options?: { driver?: LlmDriver },
): Promise<RiskAnalysisResult> {
  const driver = options?.driver ?? (await pickDriver());
  return driver.call<RiskAnalysisResult>({
    systemPrompt: RISK_ANALYSIS_SYSTEM,
    userPrompt: buildRiskAnalysisUserPrompt(input),
    maxTokens: 1024,
    schema: RiskAnalysisResultSchema,
  });
}
