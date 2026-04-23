<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import SeverityBadge from "$lib/components/SeverityBadge.svelte";

  let rows = $state<Array<Record<string, unknown>>>([]);
  let filter = $state<"all" | "critical" | "high" | "medium" | "low">("all");
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
</script>

<div class="flex flex-col gap-6">
  <header class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Vulnerabilities</h1>
      <p class="text-sm text-[var(--color-fg-muted)]">AI-enriched view: CVSS, EPSS, business impact, exploitability.</p>
    </div>
    <div class="flex items-center gap-2">
      {#each ["all", "critical", "high", "medium", "low"] as f}
        <button
          class="chip"
          class:bg-[var(--color-accent)]={filter === f}
          class:text-[var(--color-accent-fg)]={filter === f}
          onclick={() => (filter = f as typeof filter)}
        >{f}</button>
      {/each}
    </div>
  </header>

  <section class="card p-4">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[var(--color-fg-subtle)] text-xs uppercase">
          <th class="py-1">Advisory</th>
          <th>Component</th>
          <th>Project</th>
          <th>Severity</th>
          <th class="text-right">CVSS</th>
          <th class="text-right">AI risk</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as v}
          <tr class="border-t border-[var(--color-border)]">
            <td class="py-2 font-mono text-[var(--color-accent)]">{v.advisoryId ?? "—"}</td>
            <td>
              <div class="flex flex-col">
                <span>{v.componentName}<span class="text-[var(--color-fg-subtle)]">@{v.componentVersion}</span></span>
                <span class="text-xs text-[var(--color-fg-muted)] font-mono">{v.ecosystem}</span>
              </div>
            </td>
            <td class="font-mono text-xs text-[var(--color-fg-muted)]">{v.projectSlug}</td>
            <td><SeverityBadge severity={(v.severity ?? "info") as any} /></td>
            <td class="text-right tabular-nums">{v.cvssScore ?? "—"}</td>
            <td class="text-right tabular-nums font-semibold">{v.aiRiskScore ?? "—"}</td>
          </tr>
        {:else}
          <tr><td colspan="6" class="py-10 text-center text-[var(--color-fg-muted)]">
            {loading ? "Loading…" : "No vulnerabilities found."}
          </td></tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>
