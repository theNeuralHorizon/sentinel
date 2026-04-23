<script lang="ts">
  import { api } from "$lib/api";

  let query = $state("");
  let ecosystem = $state("");
  let results = $state<Array<Record<string, unknown>>>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function search(): Promise<void> {
    if (!query.trim()) return;
    busy = true;
    error = null;
    try {
      const res = await api.similaritySearch(query, 20, ecosystem || undefined);
      results = res.results;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function onSubmit(ev: SubmitEvent): void {
    ev.preventDefault();
    search();
  }
</script>

<div class="flex flex-col gap-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Semantic Component Search</h1>
    <p class="text-sm text-[var(--color-fg-muted)]">
      Ask Sentinel in plain English. Results are ranked by pgvector cosine similarity against the component embedding graph.
    </p>
  </header>

  <form class="card p-4 flex flex-col gap-3" onsubmit={onSubmit}>
    <label class="flex flex-col gap-1 text-sm">
      Query
      <input
        class="hairline px-3 py-3 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] text-base"
        bind:value={query}
        placeholder="logging library similar to log4j, anything with prototype pollution, models from huggingface with apache-2.0 licenses…"
      />
    </label>
    <div class="flex items-center gap-3">
      <label class="flex flex-col gap-1 text-xs w-40">
        Ecosystem
        <select class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]" bind:value={ecosystem}>
          <option value="">any</option>
          <option value="npm">npm</option>
          <option value="pypi">pypi</option>
          <option value="gomodules">gomodules</option>
          <option value="cargo">cargo</option>
          <option value="maven">maven</option>
          <option value="ml_model">ml_model</option>
          <option value="dataset">dataset</option>
          <option value="mcp_server">mcp_server</option>
        </select>
      </label>
      <button
        class="chip bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-transparent self-end"
        disabled={busy}
      >{busy ? "searching…" : "search"}</button>
    </div>
  </form>

  {#if error}
    <div class="card p-4 text-[var(--color-danger)]">Error: {error}</div>
  {/if}

  <section class="card p-4">
    <header class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">{results.length} match{results.length === 1 ? "" : "es"}</span>
    </header>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[var(--color-fg-subtle)] text-xs uppercase">
          <th class="py-1">Component</th>
          <th>Ecosystem</th>
          <th>License</th>
          <th class="text-right">Similarity</th>
        </tr>
      </thead>
      <tbody>
        {#each results as r}
          <tr class="border-t border-[var(--color-border)]">
            <td class="py-2">
              <div class="flex flex-col">
                <span class="font-mono">{r.name}<span class="text-[var(--color-fg-subtle)]">@{r.version}</span></span>
                <span class="text-xs text-[var(--color-fg-muted)] font-mono truncate max-w-[400px]">{r.purl}</span>
              </div>
            </td>
            <td class="font-mono text-xs">{r.ecosystem}</td>
            <td class="font-mono text-xs">{r.license ?? "—"}</td>
            <td class="text-right tabular-nums">{(Number(r.similarity) * 100).toFixed(1)}%</td>
          </tr>
        {:else}
          <tr><td colspan="4" class="py-10 text-center text-[var(--color-fg-muted)]">Nothing yet — try a search above.</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>
