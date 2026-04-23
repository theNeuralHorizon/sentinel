import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdDiff } from "../src/commands/diff";

describe("cmdDiff", () => {
  it("reports added/removed/changed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-"));
    const base = {
      components: [
        { purl: "pkg:npm/a@1.0.0", name: "a", version: "1.0.0" },
        { purl: "pkg:npm/b@1.0.0", name: "b", version: "1.0.0" },
      ],
    };
    const head = {
      components: [
        { purl: "pkg:npm/a@1.0.0", name: "a", version: "1.0.0" },
        { purl: "pkg:npm/b@2.0.0", name: "b", version: "2.0.0" },
        { purl: "pkg:npm/c@1.0.0", name: "c", version: "1.0.0" },
      ],
    };
    const basePath = join(dir, "base.cdx.json");
    const headPath = join(dir, "head.cdx.json");
    writeFileSync(basePath, JSON.stringify(base));
    writeFileSync(headPath, JSON.stringify(head));

    // This test only verifies that the command runs; diff output goes to stdout.
    await expect(cmdDiff({ base: basePath, head: headPath })).resolves.toBeUndefined();
  });
});
