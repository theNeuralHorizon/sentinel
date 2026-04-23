import { describe, it, expect } from "bun:test";
import { parsePurl, formatPurl, purlFor } from "../src/purl";

describe("parsePurl", () => {
  it("parses a simple npm purl", () => {
    const p = parsePurl("pkg:npm/left-pad@1.3.0");
    expect(p.type).toBe("npm");
    expect(p.name).toBe("left-pad");
    expect(p.version).toBe("1.3.0");
    expect(p.namespace).toBeUndefined();
  });

  it("parses scoped packages with namespace", () => {
    const p = parsePurl("pkg:npm/%40angular/core@17.0.0");
    expect(p.type).toBe("npm");
    expect(p.namespace).toBe("@angular");
    expect(p.name).toBe("core");
  });

  it("round-trips via formatPurl", () => {
    const input = "pkg:golang/github.com/gin-gonic/gin@v1.10.0";
    const parsed = parsePurl(input);
    expect(parsed.type).toBe("golang");
    expect(parsed.namespace).toBe("github.com/gin-gonic");
    expect(parsed.name).toBe("gin");
    expect(parsed.version).toBe("v1.10.0");
  });

  it("rejects malformed input", () => {
    expect(() => parsePurl("not-a-purl")).toThrow();
    expect(() => parsePurl("pkg:")).toThrow();
  });
});

describe("purlFor", () => {
  it("maps aliased ecosystems", () => {
    expect(purlFor("gomodules", "gin", "v1.10.0", "github.com/gin-gonic")).toBe(
      "pkg:golang/github.com/gin-gonic/gin@v1.10.0",
    );
    expect(purlFor("rubygems", "rails", "7.0.0")).toBe("pkg:gem/rails@7.0.0");
    expect(purlFor("mcp_server", "context7", "1.0.0")).toBe("pkg:mcp/context7@1.0.0");
  });
});
