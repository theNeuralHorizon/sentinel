<script lang="ts">
  let {
    byEcosystem = [],
  }: { byEcosystem?: Array<{ ecosystem: string; components: number; vulnerabilities: number }> } = $props();

  const aiEcosystems = new Set(["ml_model", "dataset", "mcp_server"]);

  const aiRows = $derived(byEcosystem.filter((r) => aiEcosystems.has(r.ecosystem)));

  const totals = $derived.by(() => {
    const components = aiRows.reduce((acc, r) => acc + Number(r.components ?? 0), 0);
    const vulns = aiRows.reduce((acc, r) => acc + Number(r.vulnerabilities ?? 0), 0);
    return { components, vulns };
  });

  const label: Record<string, string> = {
    ml_model: "models",
    dataset: "datasets",
    mcp_server: "MCP servers",
  };
</script>

<div class="card p-4 flex flex-col gap-3 scanline">
  <header class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">AI supply chain</span>
      <span class="chip">CycloneDX 1.6 ML-BOM</span>
    </div>
    <span class="text-xs text-[var(--color-fg-muted)] font-mono">{totals.components} tracked</span>
  </header>

  <p class="text-xs text-[var(--color-fg-muted)] leading-relaxed">
    Sentinel tracks models, datasets, and MCP servers as first-class components — the
    62% of teams that don't know where their AI lives aren't asking the right tool.
  </p>

  <div class="grid grid-cols-3 gap-3">
    {#each ["ml_model", "dataset", "mcp_server"] as eco}
      {@const row = aiRows.find((r) => r.ecosystem === eco)}
      <div class="hairline rounded-[var(--radius-md)] p-3 flex flex-col gap-1">
        <span class="font-mono text-xs text-[var(--color-fg-subtle)]">{label[eco]}</span>
        <span class="text-2xl font-semibold tabular-nums">{row?.components ?? 0}</span>
        <span class="text-xs text-[var(--color-fg-muted)]">{row?.vulnerabilities ?? 0} vulns</span>
      </div>
    {/each}
  </div>
</div>
