<script lang="ts">
  import { api } from "$lib/api";
  import NavIcon from "$lib/components/NavIcon.svelte";

  let query = $state("");
  let ecosystem = $state("");
  let results = $state<Array<Record<string, unknown>>>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let ran = $state(false);

  const examples = [
    "logging library similar to log4j",
    "anything with prototype pollution",
    "huggingface models under apache-2.0",
    "transitive deps affected by lodash",
  ];

  async function search(): Promise<void> {
    if (!query.trim()) return;
    busy = true;
    error = null;
    try {
      const res = await api.similaritySearch(query, 20, ecosystem || undefined);
      results = res.results;
      ran = true;
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

  function useExample(e: string): void {
    query = e;
    search();
  }
</script>

<div class="flex flex-col gap-7">
  <header class="flex flex-col gap-1">
    <span class="eyebrow">Natural Language</span>
    <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Semantic Component Search</h1>
    <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
      Ask Sentinel in plain English. Results rank by pgvector cosine similarity against the component embedding graph.
    </p>
  </header>

  <form class="card p-5 flex flex-col gap-3" onsubmit={onSubmit}>
    <div class="flex items-center gap-2">
      <span class="text-[var(--color-brand)]"><NavIcon name="search" size={16} /></span>
      <input
        class="input flex-1 text-base py-3"
        bind:value={query}
        placeholder="yaml parsers, copyleft deps in my api project, models with unknown provenance…"
        autofocus
      />
    </div>

    <div class="flex items-center gap-3 flex-wrap">
      <label class="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
        Ecosystem:
        <select class="input py-1.5 text-xs w-40" bind:value={ecosystem}>
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

      <button class="btn btn-primary ml-auto" disabled={busy}>
        <NavIcon name="search" size={14} />
        {busy ? "searching…" : "Search"}
      </button>
    </div>

    <div class="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border)]">
      <span class="text-xs text-[var(--color-fg-subtle)] self-center">Try:</span>
      {#each examples as ex}
        <button type="button" class="chip hover:chip-brand transition-colors" onclick={() => useExample(ex)}>
          {ex}
        </button>
      {/each}
    </div>
  </form>

  {#if error}
    <div class="card p-4 border-[var(--color-danger)] text-[var(--color-danger)] text-sm">Error: {error}</div>
  {/if}

  {#if ran || results.length > 0}
    <section class="card overflow-hidden">
      <header class="flex items-center justify-between p-5 pb-3">
        <div class="flex items-center gap-2">
          <NavIcon name="search" size={14} />
          <span class="eyebrow">{results.length} match{results.length === 1 ? "" : "es"}</span>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Ecosystem</th>
              <th>License</th>
              <th class="text-right">Similarity</th>
            </tr>
          </thead>
          <tbody>
            {#each results as r}
              {@const sim = Number(r.similarity)}
              <tr>
                <td>
                  <div class="flex flex-col">
                    <span class="font-mono">{r.name}<span class="text-[var(--color-fg-subtle)]">@{r.version}</span></span>
                    <span class="text-[10px] text-[var(--color-fg-subtle)] font-mono truncate max-w-[360px]">{r.purl}</span>
                  </div>
                </td>
                <td class="font-mono text-xs uppercase">{r.ecosystem}</td>
                <td class="font-mono text-xs">{r.license ?? "—"}</td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <span class="h-1 w-24 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
                      <span class="block h-full bg-[var(--color-brand)]" style:width="{sim * 100}%"></span>
                    </span>
                    <span class="numeric text-[var(--color-fg)]">{(sim * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            {:else}
              <tr><td colspan="4" class="py-10 text-center text-[var(--color-fg-muted)]">Nothing matched — try a different query.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {:else}
    <section class="card p-12 text-center flex flex-col items-center gap-3">
      <span class="text-[var(--color-fg-subtle)]"><NavIcon name="search" size={32} /></span>
      <span class="text-[var(--color-fg)]">Start typing above.</span>
      <span class="text-xs text-[var(--color-fg-muted)]">pgvector HNSW cosine search across every indexed component.</span>
    </section>
  {/if}
</div>
