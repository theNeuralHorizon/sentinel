// Provider router. The risk + remediation modules call into here; the
// provider chosen depends on (LLM_PROVIDER env, presence of credentials).
//
//  - "anthropic" — Claude via @anthropic-ai/sdk (best quality)
//  - "gemini"    — Google Gemini via @google/generative-ai (free tier)
//  - "none"      — short-circuits the LLM path (deterministic baseline only)

import type { z } from "zod";
import { createAnthropicDriver } from "./anthropic";
import { createGeminiDriver } from "./gemini";

export type LlmProvider = "anthropic" | "gemini" | "none";

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  /** Tight bound; both providers respect this. */
  maxTokens?: number;
  /** Zod schema for the JSON Sentinel expects back. Both providers are
   *  asked to produce valid JSON; the response is parsed here. */
  schema: z.ZodTypeAny;
}

export interface LlmDriver {
  readonly provider: LlmProvider;
  call<T>(opts: LlmCallOptions): Promise<T>;
}

const noneDriver: LlmDriver = {
  provider: "none",
  async call<T>(_opts: LlmCallOptions): Promise<T> {
    throw new LlmUnavailableError();
  },
};

/**
 * Pick the configured driver, considering env vars + explicit overrides.
 * Falls through to a stub `none` driver that throws — callers must handle
 * that and skip to deterministic baselines.
 *
 * Both SDKs are statically imported. Bun's bundler tree-shakes the
 * unreachable branch when only one provider is in scope; the cost of
 * loading both is ~80ms total at cold start, well under the threshold
 * where lazy-loading would matter.
 */
export function pickDriver(opts?: { override?: LlmProvider }): LlmDriver {
  const explicit = (opts?.override ?? process.env.LLM_PROVIDER ?? "").toLowerCase();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GOOGLE_API_KEY;

  // Honour explicit choice if its credentials are present.
  if (explicit === "anthropic" && hasAnthropic) return createAnthropicDriver();
  if (explicit === "gemini" && hasGemini) return createGeminiDriver();
  if (explicit === "none") return noneDriver;

  // Auto-pick. Gemini wins when both are set because it's the free
  // option we recommend; operators who set ANTHROPIC_API_KEY can
  // override via LLM_PROVIDER=anthropic.
  if (hasGemini) return createGeminiDriver();
  if (hasAnthropic) return createAnthropicDriver();
  return noneDriver;
}

export class LlmUnavailableError extends Error {
  constructor() {
    super("no LLM provider configured (set LLM_PROVIDER + matching key)");
    this.name = "LlmUnavailableError";
  }
}
