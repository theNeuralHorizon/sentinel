<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import StatCard from "$lib/components/StatCard.svelte";
  import RiskMeter from "$lib/components/RiskMeter.svelte";
  import LiveFeed from "$lib/components/LiveFeed.svelte";
  import SeverityBadge from "$lib/components/SeverityBadge.svelte";
  import AiSupplyChainCard from "$lib/components/AiSupplyChainCard.svelte";

  type Summary = Awaited<ReturnType<typeof api.summary>>;
  let summary = $state<Summary | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      loading = true;
      error = null;
      summary = await api.summary();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  });

  const overall = $derived(summary?.overall ?? {});
  const avgRisk = $derived(Number(overall.avg_risk ?? 0));
  const topRisks = $derived(summary?.topRisks ?? []);
  const byEcosystem = $derived(summary?.byEcosystem ?? []);
</script>

<div class="flex flex-col gap-6">
  <header class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Supply Chain Overview</h1>
      <p class="text-sm text-[var(--color-fg-muted)]">
        Real-time view of your software + AI supply chain risk. CycloneDX 1.6 / SPDX 3.0 compatible.
      </p>
    </div>
    <button
      class="chip hover:bg-[var(--color-surface-3)]"
      onclick={refresh}
      disabled={loading}
    >
      {loading ? "refreshing…" : "refresh"}
    </button>
  </header>

  {#if error}
    <div class="card p-4 border-[var(--color-danger)] text-[var(--color-danger)]">
      API unreachable: {error}
    </div>
  {/if}

  <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <StatCard label="Projects" value={String(overall.projects ?? 0)} />
    <StatCard label="Scans" value={String(overall.total_scans ?? 0)} />
    <StatCard label="Components" value={String(overall.total_components ?? 0)} />
    <StatCard label="Vulnerabilities" value={String(overall.total_vulns ?? 0)} accent />
  </section>

  <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <AiSupplyChainCard byEcosystem={byEcosystem} />
    <LiveFeed topics={["global"]} />
  </section>

  <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <RiskMeter score={avgRisk} label="Avg project risk" />
    <div class="card p-4 flex flex-col gap-2 col-span-1 lg:col-span-2">
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">Severity distribution</span>
        <span class="text-xs text-[var(--color-fg-muted)] font-mono">open vulns</span>
      </div>
      <div class="grid grid-cols-4 gap-2 mt-1">
        <div class="flex flex-col items-center gap-1">
          <span class="severity-critical text-2xl font-semibold tabular-nums">{overall.critical ?? 0}</span>
          <SeverityBadge severity="critical" />
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="severity-high text-2xl font-semibold tabular-nums">{overall.high ?? 0}</span>
          <SeverityBadge severity="high" />
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="severity-medium text-2xl font-semibold tabular-nums">{overall.medium ?? 0}</span>
          <SeverityBadge severity="medium" />
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="severity-low text-2xl font-semibold tabular-nums">{overall.low ?? 0}</span>
          <SeverityBadge severity="low" />
        </div>
      </div>
    </div>
  </section>

  <section class="card p-4">
    <header class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">Top risks</span>
      <a href="/vulnerabilities" class="text-xs text-[var(--color-accent)] hover:underline">See all →</a>
    </header>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[var(--color-fg-subtle)] text-xs uppercase">
          <th class="py-1">Advisory</th>
          <th>Component</th>
          <th>Sev</th>
          <th class="text-right">Risk</th>
        </tr>
      </thead>
      <tbody>
        {#each topRisks as v}
          <tr class="border-t border-[var(--color-border)]">
            <td class="py-2 font-mono text-[var(--color-accent)]">{v.advisoryId ?? "—"}</td>
            <td class="truncate max-w-[200px]">
              <span>{v.componentName}</span>
              <span class="text-[var(--color-fg-subtle)]">@{v.componentVersion}</span>
            </td>
            <td><SeverityBadge severity={(v.severity ?? "info") as any} /></td>
            <td class="text-right tabular-nums">{v.aiRiskScore ?? Math.round(Number(v.cvssScore ?? 0) * 10)}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" class="py-8 text-center text-[var(--color-fg-muted)]">
              No vulnerabilities yet — trigger a scan from Projects.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="card p-4">
    <header class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">By ecosystem</span>
    </header>
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {#each byEcosystem as row}
        <div class="hairline rounded-[var(--radius-md)] p-3 flex flex-col gap-1">
          <span class="font-mono text-xs text-[var(--color-fg-subtle)]">{row.ecosystem}</span>
          <span class="text-xl font-semibold tabular-nums">{row.components}</span>
          <span class="text-xs text-[var(--color-fg-muted)]">{row.vulnerabilities} vulns</span>
        </div>
      {:else}
        <span class="text-sm text-[var(--color-fg-muted)]">No data yet.</span>
      {/each}
    </div>
  </section>
</div>
