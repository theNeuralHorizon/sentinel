// Embedding abstraction. Voyage / OpenAI / local are all possible backends.
// Default: a deterministic pseudo-embedding for offline/CI runs, so the system
// is fully functional without an API key.

export interface EmbeddingClient {
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

// Deterministic hash-based embedder — unit vector in a stable direction per text.
// Good enough for tests and local dev; swap in Voyage/OpenAI for prod.
export function createHashEmbedder(dimensions = DIMENSIONS): EmbeddingClient {
  return {
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => hashToVector(text, dimensions));
    },
  };
}

function hashToVector(text: string, dimensions: number): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  // Simple mix — bucket characters into dimensions with XorShift-ish spread.
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x100000001b3 & 0xffffffff) >>> 0;
    vec[h1 % dimensions]! += 1;
    vec[h2 % dimensions]! -= 1;
  }
  // L2 normalise — pgvector cosine ops expect unit-ish vectors.
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export function componentEmbeddingText(input: {
  name: string;
  version: string;
  ecosystem: string;
  purl: string;
  license?: string | null;
  supplier?: string | null;
  description?: string | null;
}): string {
  const parts = [
    `name: ${input.name}`,
    `version: ${input.version}`,
    `ecosystem: ${input.ecosystem}`,
    `purl: ${input.purl}`,
    input.license ? `license: ${input.license}` : null,
    input.supplier ? `supplier: ${input.supplier}` : null,
    input.description ? `description: ${input.description}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

// Hook up Voyage / other providers here when credentials are present.
export function createDefaultEmbedder(): EmbeddingClient {
  // If in the future VOYAGE_API_KEY or similar is set, return that client.
  // For now the deterministic embedder is the default so the whole platform
  // works offline with zero external dependencies.
  return createHashEmbedder();
}
