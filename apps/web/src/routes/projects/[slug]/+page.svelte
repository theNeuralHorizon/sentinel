<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api";
  import SeverityBadge from "$lib/components/SeverityBadge.svelte";
  import LiveFeed from "$lib/components/LiveFeed.svelte";

  // SvelteKit always populates a route param, but the type is technically
  // string | undefined. Narrow once and bail otherwise.
  const slug = $derived($page.params.slug ?? "");
  let project = $state<Record<string, unknown> | null>(null);
  let scans = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);

  async function load(): Promise<void> {
    if (!slug) return;
    loading = true;
    try {
      const [proj, scn] = await Promise.all([
        api.getProject(slug),
        api.listScans(slug),
      ]);
      project = proj.project;
      scans = scn.scans;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (slug) load();
  });

  onMount(() => {
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  });
</script>

<div class="flex flex-col gap-6">
  <header class="flex items-end justify-between">
    <div>
      <a href="/projects" class="text-xs text-[var(--color-accent)] hover:underline">← all projects</a>
      <h1 class="text-2xl font-semibold tracking-tight font-mono">{slug}</h1>
      {#if project}
        <p class="text-sm text-[var(--color-fg-muted)]">{String(project.description ?? "")}</p>
      {/if}
    </div>
  </header>

  <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div class="card p-4 lg:col-span-2">
      <header class="flex items-center justify-between mb-3">
        <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">Recent scans</span>
        <span class="text-xs text-[var(--color-fg-muted)] font-mono">{scans.length}</span>
      </header>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[var(--color-fg-subtle)] text-xs uppercase">
            <th class="py-1">Scan</th>
            <th>Status</th>
            <th>Components</th>
            <th>Vulns</th>
            <th class="text-right">Risk</th>
          </tr>
        </thead>
        <tbody>
          {#each scans as s}
            <tr class="border-t border-[var(--color-border)]">
              <td class="py-2 font-mono text-[var(--color-accent)]">{String(s.id).slice(0, 8)}…</td>
              <td>{String(s.status)}</td>
              <td class="tabular-nums">{s.componentCount ?? 0}</td>
              <td class="tabular-nums">
                {#if Number(s.criticalCount) > 0}
                  <SeverityBadge severity="critical" score={Number(s.criticalCount)} />
                {:else if Number(s.highCount) > 0}
                  <SeverityBadge severity="high" score={Number(s.highCount)} />
                {:else}
                  {s.vulnCount ?? 0}
                {/if}
              </td>
              <td class="text-right tabular-nums">{s.riskScore ?? 0}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="py-8 text-center text-[var(--color-fg-muted)]">
              {loading ? "Loading…" : "No scans yet — trigger one from the Projects page."}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <LiveFeed topics={project ? [`project:${String(project.id)}`] : ["global"]} />
  </section>
</div>
