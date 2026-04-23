<script lang="ts">
  import NavIcon from "./NavIcon.svelte";

  let {
    byEcosystem = [],
  }: { byEcosystem?: Array<{ ecosystem: string; components: number; vulnerabilities: number }> } = $props();

  const aiEcosystems = new Set(["ml_model", "dataset", "mcp_server"]);
  const aiRows = $derived(byEcosystem.filter((r) => aiEcosystems.has(r.ecosystem)));
  const totals = $derived.by(() => {
    const components = aiRows.reduce((acc, r) => acc + Number(r.components ?? 0), 0);
    const vulns      = aiRows.reduce((acc, r) => acc + Number(r.vulnerabilities ?? 0), 0);
    return { components, vulns };
  });

  const meta: Record<string, { label: string; hint: string }> = {
    ml_model:   { label: "Models",      hint: "HuggingFace, Ollama, custom"   },
    dataset:    { label: "Datasets",    hint: "Training + fine-tune corpora"  },
    mcp_server: { label: "MCP Servers", hint: "Model Context Protocol agents" },
  };
</script>

<div class="card p-5 flex flex-col gap-4 scanline">
  <header class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-[var(--color-brand)]"><NavIcon name="cpu" size={16} /></span>
      <span class="eyebrow">AI Supply Chain</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="chip chip-brand">CycloneDX 1.6 ML-BOM</span>
      <span class="text-xs text-[var(--color-fg-subtle)] numeric">{totals.components} tracked</span>
    </div>
  </header>

  <p class="text-xs text-[var(--color-fg-muted)] leading-relaxed">
    Models, datasets, and MCP servers live as first-class components. 62% of teams don't know where their LLMs live — Sentinel does.
  </p>

  <div class="grid grid-cols-3 gap-3">
    {#each ["ml_model", "dataset", "mcp_server"] as eco}
      {@const row = aiRows.find((r) => r.ecosystem === eco)}
      {@const count = row?.components ?? 0}
      {@const vulns = row?.vulnerabilities ?? 0}
      <div class="rounded-[var(--radius-md)] p-3 flex flex-col gap-1.5 hairline-strong bg-[color-mix(in_oklch,var(--color-surface-2)_80%,transparent)]">
        <span class="eyebrow text-[10px]">{meta[eco]!.label}</span>
        <span class="display text-3xl numeric"
              style:color={count > 0 ? "var(--color-fg)" : "var(--color-fg-subtle)"}>
          {count}
        </span>
        <div class="flex items-center justify-between gap-1">
          <span class="text-[10px] text-[var(--color-fg-subtle)] truncate">{meta[eco]!.hint}</span>
          {#if vulns > 0}
            <span class="chip chip-warn text-[10px] py-0 px-1.5 shrink-0">{vulns} vuln</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
