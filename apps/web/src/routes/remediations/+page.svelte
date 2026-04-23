<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";

  type Remediation = {
    id: string;
    kind: string;
    state: string;
    createdAt: string;
    proposalReasoning?: string;
    parameters: Record<string, unknown>;
  };
  let rows = $state<Remediation[]>([]);
  let loading = $state(true);
  let busy = $state<string | null>(null);

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await api.listRemediations();
      rows = res.remediations as Remediation[];
    } finally {
      loading = false;
    }
  }

  async function approve(id: string): Promise<void> {
    busy = id;
    try {
      await api.approveRemediation(id, "analyst@sentinel.local");
      await load();
    } finally {
      busy = null;
    }
  }

  onMount(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  });
</script>

<div class="flex flex-col gap-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Autonomous Remediations</h1>
    <p class="text-sm text-[var(--color-fg-muted)]">AI-proposed fixes awaiting your approval. Approved remediations dispatch to n8n workflows.</p>
  </header>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each rows as r (r.id)}
      <article class="card p-4 flex flex-col gap-3">
        <header class="flex items-center justify-between">
          <span class="chip font-mono uppercase">{r.kind}</span>
          <span class="chip border-0 bg-[var(--color-surface-3)] text-[var(--color-fg-muted)]">{r.state}</span>
        </header>
        <p class="text-sm leading-relaxed">{r.proposalReasoning ?? "No reasoning available."}</p>
        {#if r.parameters && Object.keys(r.parameters).length > 0}
          <pre class="text-xs font-mono text-[var(--color-fg-muted)] bg-[var(--color-surface-2)] p-2 rounded-[var(--radius-md)] overflow-x-auto">{JSON.stringify(r.parameters, null, 2)}</pre>
        {/if}
        <footer class="flex items-center justify-between text-xs text-[var(--color-fg-subtle)]">
          <span>{new Date(r.createdAt).toLocaleString()}</span>
          {#if r.state === "proposed"}
            <button
              class="chip bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-transparent"
              onclick={() => approve(r.id)}
              disabled={busy === r.id}
            >
              {busy === r.id ? "dispatching…" : "approve & dispatch"}
            </button>
          {/if}
        </footer>
      </article>
    {:else}
      <div class="card p-10 text-center text-[var(--color-fg-muted)] md:col-span-2">
        {loading ? "Loading…" : "No remediations yet — the analyzer will propose them as vulnerabilities land."}
      </div>
    {/each}
  </section>
</div>
