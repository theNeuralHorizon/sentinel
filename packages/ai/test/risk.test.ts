import { describe, it, expect } from "bun:test";
import { extractJson } from "../src/risk";
import { createHashEmbedder, componentEmbeddingText } from "../src/embeddings";

describe("extractJson", () => {
  it("parses pure JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts JSON from markdown fences", () => {
    const input = "Here is my answer:\n```json\n{\"risk\": 42}\n```\nDone.";
    expect(extractJson(input)).toEqual({ risk: 42 });
  });

  it("throws on invalid", () => {
    expect(() => extractJson("not json at all")).toThrow();
  });
});

describe("hash embedder", () => {
  it("produces unit vectors of correct dimension", async () => {
    const e = createHashEmbedder(128);
    const [v] = await e.embed(["hello"]);
    expect(v).toHaveLength(128);
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("is deterministic", async () => {
    const e = createHashEmbedder(64);
    const [a] = await e.embed(["repeat-me"]);
    const [b] = await e.embed(["repeat-me"]);
    expect(a).toEqual(b!);
  });

  it("distinguishes different inputs", async () => {
    const e = createHashEmbedder(128);
    const [a, b] = await e.embed(["foo", "bar"]);
    expect(a).not.toEqual(b!);
  });
});

describe("componentEmbeddingText", () => {
  it("composes a stable embedding text", () => {
    const text = componentEmbeddingText({
      name: "log4j-core",
      version: "2.14.1",
      ecosystem: "maven",
      purl: "pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1",
      license: "Apache-2.0",
    });
    expect(text).toContain("log4j-core");
    expect(text).toContain("Apache-2.0");
    expect(text).toContain("maven");
  });
});
