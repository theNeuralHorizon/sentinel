<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import NavIcon from "$lib/components/NavIcon.svelte";

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

  const kindLabels: Record<string, string> = {
    pr_bump: "PR • Bump version",
    pr_swap: "PR • Swap dep",
    issue_ticket: "File issue",
    notify_slack: "Slack alert",
    rotate_secret: "Rotate secret",
    escalate_oncall: "Page on-call",
    custom_n8n: "Custom workflow",
    none: "No action",
  };

  const stateClass: Record<string, string> = {
    proposed: "chip-brand",
    queued: "chip-info",
    dispatched: "chip-warn",
    succeeded: "chip chip-brand",
    failed: "chip-danger",
    rolled_back: "chip-warn",
  };
</script>

<div class="flex flex-col gap-7">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="eyebrow">Agentic Governance</span>
      <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Autonomous Remediations</h1>
      <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
        AI-proposed fixes awaiting your approval. Approved remediations dispatch to n8n workflows.
      </p>
    </div>
  </header>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each rows as r (r.id)}
      <article class="card card-interactive p-5 flex flex-col gap-3 fade-in">
        <header class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-[var(--color-brand)] font-mono text-xs">{r.kind}</span>
            <span class="text-[var(--color-fg)]">{kindLabels[r.kind] ?? r.kind}</span>
          </div>
          <span class="chip {stateClass[r.state] ?? ''}">{r.state}</span>
        </header>

        {#if r.proposalReasoning}
          <p class="text-sm text-[var(--color-fg-muted)] leading-relaxed">
            {r.proposalReasoning}
          </p>
        {/if}

        {#if r.parameters && Object.keys(r.parameters).length > 0}
          <pre class="text-[11px] font-mono text-[var(--color-fg-muted)] bg-[var(--color-surface-2)] p-2.5 rounded-[var(--radius-sm)] overflow-x-auto hairline">{JSON.stringify(r.parameters, null, 2)}</pre>
        {/if}

        <footer class="flex items-center justify-between text-xs text-[var(--color-fg-subtle)] pt-1">
          <span class="font-mono">{new Date(r.createdAt).toLocaleString()}</span>
          {#if r.state === "proposed"}
            <button class="btn btn-primary" onclick={() => approve(r.id)} disabled={busy === r.id}>
              <NavIcon name="check" size={12} />
              {busy === r.id ? "dispatching…" : "Approve & dispatch"}
            </button>
          {/if}
        </footer>
      </article>
    {:else}
      <div class="card p-12 text-center col-span-full flex flex-col items-center gap-3">
        <span class="text-[var(--color-fg-subtle)]"><NavIcon name="wand" size={32} /></span>
        <span class="text-[var(--color-fg)]">No remediations yet.</span>
        <span class="text-xs text-[var(--color-fg-muted)] max-w-md">
          {loading ? "Loading…" : "The analyzer proposes remediations as new vulnerabilities land. Trigger a scan to seed this view."}
        </span>
      </div>
    {/each}
  </section>
</div>
