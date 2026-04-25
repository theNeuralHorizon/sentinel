// Provider router. The risk + remediation modules call into here; the
// provider chosen depends on (LLM_PROVIDER env, presence of credentials).
//
//  - "anthropic" — Claude via @anthropic-ai/sdk (best quality)
//  - "gemini"    — Google Gemini via @google/generative-ai (free tier)
//  - "none"      — short-circuits the LLM path (deterministic baseline only)

import type { z } from "zod";

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

/**
 * Pick the configured driver, considering env vars + explicit overrides.
 * Falls through to a stub `none` driver that throws — callers must handle
 * that and skip to deterministic baselines.
 */
export function pickDriver(opts?: { override?: LlmProvider }): LlmDriver {
  const explicit = (opts?.override ?? process.env.LLM_PROVIDER ?? "").toLowerCase();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GOOGLE_API_KEY;

  // Honour explicit choice if its credentials are present.
  if (explicit === "anthropic" && hasAnthropic) return loadAnthropic();
  if (explicit === "gemini" && hasGemini) return loadGemini();
  if (explicit === "none") return loadNone();

  // Auto-pick if anything is configured. Gemini is preferred when both
  // are set because it's the free choice we encourage for students;
  // operators who set ANTHROPIC_API_KEY can opt-in via LLM_PROVIDER.
  if (hasGemini) return loadGemini();
  if (hasAnthropic) return loadAnthropic();
  return loadNone();
}

// Lazy loads keep the unused SDK out of the cold-start path.
function loadAnthropic(): LlmDriver {
  // require() at top-level via dynamic import — Bun loads it fast either way.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./anthropic").createAnthropicDriver();
}
function loadGemini(): LlmDriver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./gemini").createGeminiDriver();
}
function loadNone(): LlmDriver {
  return {
    provider: "none",
    async call<T>(_opts: LlmCallOptions): Promise<T> {
      throw new LlmUnavailableError();
    },
  };
}

export class LlmUnavailableError extends Error {
  constructor() {
    super("no LLM provider configured (set LLM_PROVIDER + matching key)");
    this.name = "LlmUnavailableError";
  }
}
