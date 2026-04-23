<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import SeverityBadge from "$lib/components/SeverityBadge.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";

  type Severity = "all" | "critical" | "high" | "medium" | "low";

  let rows = $state<Array<Record<string, unknown>>>([]);
  let filter = $state<Severity>("all");
  let loading = $state(true);

  async function load(): Promise<void> {
    loading = true;
    try {
      const summary = await api.summary();
      rows = summary.topRisks;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  const filtered = $derived(
    filter === "all" ? rows : rows.filter((r) => r.severity === filter),
  );
  const counts = $derived.by(() => ({
    all: rows.length,
    critical: rows.filter((r) => r.severity === "critical").length,
    high: rows.filter((r) => r.severity === "high").length,
    medium: rows.filter((r) => r.severity === "medium").length,
    low: rows.filter((r) => r.severity === "low").length,
  }));
</script>

<div class="flex flex-col gap-7">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="eyebrow">Risk Intelligence</span>
      <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Vulnerabilities</h1>
      <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
        AI-enriched view: CVSS + EPSS + license risk + transitive + fix availability roll into one business-aware score.
      </p>
    </div>
  </header>

  <!-- Filter pills -->
  <div class="flex items-center gap-2 flex-wrap">
    {#each (["all", "critical", "high", "medium", "low"] as Severity[]) as f}
      {@const active = filter === f}
      <button
        class="chip transition-colors"
        class:chip-critical={active && f === "critical"}
        class:chip-danger={active && f === "high"}
        class:chip-warn={active && f === "medium"}
        class:chip-info={active && f === "low"}
        class:chip-brand={active && f === "all"}
        onclick={() => (filter = f)}
      >
        <span class="uppercase">{f}</span>
        <span class="opacity-70 numeric">{counts[f]}</span>
      </button>
    {/each}
  </div>

  <section class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Advisory</th>
            <th>Component</th>
            <th>Project</th>
            <th>Severity</th>
            <th class="text-right">CVSS</th>
            <th class="text-right">AI risk</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as v}
            <tr>
              <td class="font-mono text-[var(--color-brand)] text-xs">{v.advisoryId ?? "—"}</td>
              <td>
                <div class="flex flex-col">
                  <span>{v.componentName}<span class="text-[var(--color-fg-subtle)]">@{v.componentVersion}</span></span>
                  <span class="text-[10px] text-[var(--color-fg-subtle)] font-mono uppercase">{v.ecosystem}</span>
                </div>
              </td>
              <td class="font-mono text-xs text-[var(--color-fg-muted)]">{v.projectSlug}</td>
              <td><SeverityBadge severity={(v.severity ?? "info") as any} /></td>
              <td class="text-right numeric text-[var(--color-fg-muted)]">{v.cvssScore ?? "—"}</td>
              <td class="text-right">
                <span class="display numeric text-base text-[var(--color-fg)]">{v.aiRiskScore ?? "—"}</span>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="py-16 text-center text-[var(--color-fg-muted)]">
                <div class="flex flex-col items-center gap-2">
                  <span class="text-[var(--color-brand)] opacity-60"><NavIcon name="check" size={24} /></span>
                  <span class="text-lg">No {filter === "all" ? "vulnerabilities" : filter + " issues"} found.</span>
                  {#if !loading && rows.length === 0}
                    <span class="text-xs">Trigger a scan from Projects to populate this view.</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
