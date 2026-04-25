// Tolerant JSON extractor for LLM output. Most modern providers respect
// `response_mime_type: application/json` (Gemini) or "JSON-only" system
// prompts (Anthropic), but the occasional rogue prefix or fenced code
// block still happens. This keeps a tight schema-validation pass at the
// caller without hand-rolling a recovery path each time.

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path — pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  // Fenced code block?
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // fall through
    }
  }
  // First {...} block in the string.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error(`no JSON object found in model output: ${raw.slice(0, 120)}...`);
}
