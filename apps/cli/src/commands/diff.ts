import { readFileSync } from "node:fs";

export async function cmdDiff(opts: { base: string; head: string }): Promise<void> {
  const base = readCdx(opts.base);
  const head = readCdx(opts.head);

  const baseMap = indexByPurl(base.components);
  const headMap = indexByPurl(head.components);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ purl: string; from: string; to: string }> = [];

  for (const [purl, h] of headMap) {
    const b = baseMap.get(purl);
    if (!b) {
      added.push(purl);
    } else if (b.version !== h.version) {
      changed.push({ purl: h.name, from: b.version, to: h.version });
    }
  }
  for (const [purl] of baseMap) {
    if (!headMap.has(purl)) removed.push(purl);
  }

  console.log(`SBOM diff`);
  console.log(`  base: ${opts.base} (${baseMap.size} components)`);
  console.log(`  head: ${opts.head} (${headMap.size} components)`);
  console.log(`  added:   ${added.length}`);
  console.log(`  removed: ${removed.length}`);
  console.log(`  changed: ${changed.length}`);

  if (added.length) {
    console.log("\n+ Added:");
    added.slice(0, 20).forEach((p) => console.log(`    ${p}`));
    if (added.length > 20) console.log(`    ... and ${added.length - 20} more`);
  }
  if (removed.length) {
    console.log("\n- Removed:");
    removed.slice(0, 20).forEach((p) => console.log(`    ${p}`));
  }
  if (changed.length) {
    console.log("\n~ Changed:");
    changed.slice(0, 20).forEach((c) => console.log(`    ${c.purl}: ${c.from} → ${c.to}`));
  }
}

type CdxComponent = { purl: string; name: string; version: string };

function readCdx(path: string): { components: CdxComponent[] } {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as { components?: CdxComponent[] };
  if (!parsed.components) {
    throw new Error(`${path} is not a CycloneDX document with components`);
  }
  return { components: parsed.components };
}

function indexByPurl(components: CdxComponent[]): Map<string, CdxComponent> {
  const m = new Map<string, CdxComponent>();
  for (const c of components) {
    if (c.purl) m.set(c.purl, c);
  }
  return m;
}
