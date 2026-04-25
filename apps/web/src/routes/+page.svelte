<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import StatCard from "$lib/components/StatCard.svelte";
  import RiskMeter from "$lib/components/RiskMeter.svelte";
  import LiveFeed from "$lib/components/LiveFeed.svelte";
  import SeverityBadge from "$lib/components/SeverityBadge.svelte";
  import AiSupplyChainCard from "$lib/components/AiSupplyChainCard.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";

  type Summary = Awaited<ReturnType<typeof api.summary>>;
  let summary = $state<Summary | null>(null);
  let loading = $state(true);
  let lastRefreshed = $state<number | null>(null);

  async function refresh(): Promise<void> {
    try {
      loading = true;
      summary = await api.summary();
      lastRefreshed = Date.now();
    } catch {
      // API offline / not yet wired — leave previous summary in place
      // and let the empty-zero state render naturally. No alarm bells.
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  });

  const overall     = $derived(summary?.overall ?? {});
  const avgRisk     = $derived(Number(overall.avg_risk ?? 0));
  const topRisks    = $derived(summary?.topRisks ?? []);
  const byEcosystem = $derived(summary?.byEcosystem ?? []);
  const severity    = $derived.by(() => ({
    critical: Number(overall.critical ?? 0),
    high:     Number(overall.high ?? 0),
    medium:   Number(overall.medium ?? 0),
    low:      Number(overall.low ?? 0),
  }));
  const totalVulns = $derived(
    (severity.critical + severity.high + severity.medium + severity.low) || 1,
  );

  function formatTimeAgo(ts: number | null): string {
    if (!ts) return "–";
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }
</script>

<div class="flex flex-col gap-7">
  <!-- Page header -->
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="eyebrow">Overview</span>
      <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Supply Chain Posture</h1>
      <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
        Real-time risk picture across your SBOM + AI supply chain. Agentic governance, CycloneDX 1.6, SPDX 3.0 compatible.
      </p>
    </div>

    <div class="flex items-center gap-3 text-xs text-[var(--color-fg-subtle)]">
      <span class="font-mono">last sync {formatTimeAgo(lastRefreshed)}</span>
      <button class="btn btn-ghost" onclick={refresh} disabled={loading} aria-label="refresh">
        <span class:animate-spin={loading}><NavIcon name="refresh" size={14} /></span>
        <span>{loading ? "syncing…" : "refresh"}</span>
      </button>
    </div>
  </header>

  {#if error}
    <div class="card p-4 border-[var(--color-danger)] flex items-center gap-3">
      <span class="text-[var(--color-danger)]"><NavIcon name="shield-alert" size={16} /></span>
      <div class="flex flex-col">
        <span class="text-sm text-[var(--color-danger)]">API unreachable</span>
        <span class="text-xs text-[var(--color-fg-subtle)] font-mono">{error}</span>
      </div>
    </div>
  {/if}

  <!-- KPI row -->
  <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <StatCard label="Projects"        value={overall.projects ?? 0}         icon="folder"       sub="active" />
    <StatCard label="Scans"           value={overall.total_scans ?? 0}      icon="refresh"      sub="lifetime" />
    <StatCard label="Components"      value={overall.total_components ?? 0} icon="cpu"          sub="across ecosystems" />
    <StatCard label="Vulnerabilities" value={overall.total_vulns ?? 0}      icon="shield-alert" accent sub="open + enriched" />
  </section>

  <!-- Risk + AI + feed -->
  <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <RiskMeter score={avgRisk} label="Avg project risk" sub="Peak-weighted across completed scans" />
    <AiSupplyChainCard {byEcosystem} />
    <LiveFeed topics={["global"]} />
  </section>

  <!-- Severity distribution -->
  <section class="card p-5 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <NavIcon name="shield-alert" size={14} />
        <span class="eyebrow">Severity Distribution</span>
      </div>
      <span class="text-xs text-[var(--color-fg-subtle)] numeric">
        {totalVulns > 1 ? totalVulns : 0} open vulns
      </span>
    </header>

    <div class="flex h-2.5 rounded-full overflow-hidden bg-[var(--color-surface-3)]">
      {#if severity.critical > 0}
        <div class="h-full" style:width="{(severity.critical / totalVulns) * 100}%" style:background="var(--color-critical)"></div>
      {/if}
      {#if severity.high > 0}
        <div class="h-full" style:width="{(severity.high / totalVulns) * 100}%" style:background="var(--color-danger)"></div>
      {/if}
      {#if severity.medium > 0}
        <div class="h-full" style:width="{(severity.medium / totalVulns) * 100}%" style:background="var(--color-warn)"></div>
      {/if}
      {#if severity.low > 0}
        <div class="h-full" style:width="{(severity.low / totalVulns) * 100}%" style:background="var(--color-info)"></div>
      {/if}
    </div>

    <div class="grid grid-cols-4 gap-3">
      {#each [
        { key: "critical", label: "Critical", color: "var(--color-critical)" },
        { key: "high",     label: "High",     color: "var(--color-danger)"   },
        { key: "medium",   label: "Medium",   color: "var(--color-warn)"     },
        { key: "low",      label: "Low",      color: "var(--color-info)"     },
      ] as band}
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full" style:background={band.color}></span>
            <span class="text-xs text-[var(--color-fg-muted)]">{band.label}</span>
          </div>
          <span class="display numeric text-2xl" style:color={band.color}>
            {severity[band.key as keyof typeof severity]}
          </span>
        </div>
      {/each}
    </div>
  </section>

  <!-- Top risks -->
  <section class="card overflow-hidden">
    <header class="flex items-center justify-between p-5 pb-3">
      <div class="flex items-center gap-2">
        <span class="text-[var(--color-brand)]"><NavIcon name="trend-up" size={14} /></span>
        <span class="eyebrow">Top Risks</span>
      </div>
      <a href="/vulnerabilities" class="text-xs text-[var(--color-brand)] hover:underline inline-flex items-center gap-0.5">
        See all <NavIcon name="chevron-right" size={12} />
      </a>
    </header>
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
          {#each topRisks as v}
            <tr>
              <td class="font-mono text-[var(--color-brand)] text-xs">{v.advisoryId ?? "—"}</td>
              <td>
                <div class="flex flex-col">
                  <span class="text-[var(--color-fg)]">
                    {v.componentName}<span class="text-[var(--color-fg-subtle)]">@{v.componentVersion}</span>
                  </span>
                  <span class="text-[10px] text-[var(--color-fg-subtle)] font-mono uppercase">{v.ecosystem}</span>
                </div>
              </td>
              <td class="font-mono text-xs text-[var(--color-fg-muted)]">{v.projectSlug ?? "—"}</td>
              <td><SeverityBadge severity={(v.severity ?? "info") as any} /></td>
              <td class="text-right numeric text-[var(--color-fg-muted)]">{v.cvssScore ?? "—"}</td>
              <td class="text-right">
                <span class="display numeric text-base text-[var(--color-fg)]">{v.aiRiskScore ?? "—"}</span>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="py-12 text-center text-[var(--color-fg-muted)]">
                <div class="flex flex-col items-center gap-2">
                  <span class="chip text-[10px]">empty</span>
                  <span>No vulnerabilities yet. Trigger a scan from Projects →</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- By ecosystem -->
  <section class="card p-5">
    <header class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <NavIcon name="dashboard" size={14} />
        <span class="eyebrow">Components by Ecosystem</span>
      </div>
    </header>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {#each byEcosystem as row}
        {@const vulnRatio = row.components > 0 ? Math.min(100, (row.vulnerabilities / row.components) * 100) : 0}
        <div class="hairline-strong rounded-[var(--radius-md)] p-3 flex flex-col gap-2 bg-[color-mix(in_oklch,var(--color-surface-2)_70%,transparent)] card-interactive">
          <span class="font-mono text-[10px] uppercase text-[var(--color-fg-subtle)] tracking-wider">{row.ecosystem.replace("_", " ")}</span>
          <span class="display text-2xl numeric">{row.components}</span>
          <div class="flex items-center gap-1.5 text-[10px]">
            <span class="h-1.5 flex-1 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
              <span class="block h-full"
                    style:width="{vulnRatio}%"
                    style:background={row.vulnerabilities > 0 ? "var(--color-danger)" : "var(--color-brand)"}></span>
            </span>
            <span class="text-[var(--color-fg-subtle)] numeric">{row.vulnerabilities}</span>
          </div>
        </div>
      {:else}
        <div class="col-span-full text-sm text-[var(--color-fg-muted)] py-6 text-center">No components scanned yet.</div>
      {/each}
    </div>
  </section>
</div>
