import Anthropic from "@anthropic-ai/sdk";

export interface AiClientConfig {
  apiKey: string;
  model: string;
  maxRetries?: number;
  timeout?: number;
}

export function createAiClient(config?: Partial<AiClientConfig>): Anthropic {
  const apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  return new Anthropic({
    apiKey,
    maxRetries: config?.maxRetries ?? 3,
    timeout: config?.timeout ?? 60_000,
  });
}

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
