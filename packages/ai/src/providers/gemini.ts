import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractJson } from "../json";
import type { LlmCallOptions, LlmDriver } from "./index";

// Free-tier Gemini driver. Sign up at https://aistudio.google.com/apikey,
// set GOOGLE_API_KEY, and (optionally) override the model with
// GOOGLE_MODEL. Defaults to gemini-2.0-flash — the free quota is 15 RPM
// and 1M tokens/day, plenty for risk-enrichment + remediation planning.

export function createGeminiDriver(): LlmDriver {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY required for gemini driver");
  const modelName = process.env.GOOGLE_MODEL ?? "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    provider: "gemini",
    async call<T>(opts: LlmCallOptions): Promise<T> {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: opts.systemPrompt,
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1024,
          // Force JSON output so we can parse without prose.
          responseMimeType: "application/json",
        },
      });
      const result = await model.generateContent(opts.userPrompt);
      const text = result.response.text();
      if (!text) throw new Error("gemini: empty response");
      return opts.schema.parse(extractJson(text)) as T;
    },
  };
}
