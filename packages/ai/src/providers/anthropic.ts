import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../json";
import type { LlmCallOptions, LlmDriver } from "./index";

export function createAnthropicDriver(): LlmDriver {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for anthropic driver");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 });

  return {
    provider: "anthropic",
    async call<T>(opts: LlmCallOptions): Promise<T> {
      const message = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        // Claude system prompts are cached when ephemeral — heavy reuse.
        system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: opts.userPrompt }],
      });
      const block = message.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new Error("anthropic: no text block in response");
      }
      return opts.schema.parse(extractJson(block.text)) as T;
    },
  };
}
