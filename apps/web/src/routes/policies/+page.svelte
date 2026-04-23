<script lang="ts">
  import { onMount } from "svelte";
  import { getToken } from "$lib/api";
  import NavIcon from "$lib/components/NavIcon.svelte";

  type Policy = {
    id: string;
    slug: string;
    name: string;
    enabled: boolean;
    rules: { conditions: Array<{ field: string; op: string; value: unknown }>; action: string };
    tags?: string[];
  };

  let policies = $state<Policy[]>([]);
  let loading = $state(true);

  async function load(): Promise<void> {
    try {
      const token = getToken();
      const res = await fetch("http://localhost:4000/v1/policies", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { policies: Policy[] };
        policies = body.policies;
      }
    } finally {
      loading = false;
    }
  }

  onMount(load);

  const actionClass: Record<string, string> = {
    allow: "chip-brand",
    warn: "chip-warn",
    notify: "chip-info",
    remediate: "chip-brand",
    escalate: "chip-danger",
    block: "chip-critical",
  };

  const opLabel: Record<string, string> = {
    eq: "equals",
    neq: "≠",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    in: "in",
    not_in: "not in",
    contains: "contains",
    matches: "matches",
  };
</script>

<div class="flex flex-col gap-7">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="eyebrow">Governance</span>
      <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Policies</h1>
      <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
        Declarative rules gate scans, trigger notifications, and dispatch remediations. Same engine your legal team can audit.
      </p>
    </div>
  </header>

  {#if loading && policies.length === 0}
    <div class="card p-12 text-center text-[var(--color-fg-muted)]">Loading…</div>
  {:else if policies.length === 0}
    <div class="card p-12 text-center flex flex-col items-center gap-3">
      <span class="text-[var(--color-fg-subtle)]"><NavIcon name="book-lock" size={32} /></span>
      <span class="text-[var(--color-fg)]">No policies yet.</span>
      <span class="text-xs text-[var(--color-fg-muted)] max-w-md">
        POST to <span class="font-mono">/v1/policies</span> or run the seed script to populate three starter policies.
      </span>
    </div>
  {:else}
    <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each policies as p (p.id)}
        <article class="card card-interactive p-5 flex flex-col gap-3">
          <header class="flex items-start justify-between gap-3">
            <div class="flex flex-col gap-1">
              <span class="font-mono text-[var(--color-brand)] text-xs">{p.slug}</span>
              <span class="text-[var(--color-fg)]">{p.name}</span>
            </div>
            <span class="chip {p.enabled ? 'chip-brand' : ''}">
              {#if p.enabled}<span class="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]"></span>enabled{:else}disabled{/if}
            </span>
          </header>

          <div class="hairline rounded-[var(--radius-md)] p-3 flex flex-col gap-1.5 bg-[color-mix(in_oklch,var(--color-surface-2)_80%,transparent)]">
            <span class="eyebrow text-[10px]">When</span>
            {#each p.rules.conditions as cond}
              <div class="flex items-center gap-2 text-[12px]">
                <span class="font-mono text-[var(--color-fg)]">{cond.field}</span>
                <span class="text-[var(--color-fg-subtle)]">{opLabel[cond.op] ?? cond.op}</span>
                <span class="font-mono text-[var(--color-brand)] truncate">{JSON.stringify(cond.value)}</span>
              </div>
            {/each}
          </div>

          <footer class="flex items-center justify-between text-xs">
            <span class="text-[var(--color-fg-subtle)]">then action:</span>
            <span class="chip {actionClass[p.rules.action] ?? ''} uppercase tracking-wide">{p.rules.action}</span>
          </footer>

          {#if p.tags && p.tags.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each p.tags as t}
                <span class="chip text-[10px] py-0 px-1.5">{t}</span>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    </section>
  {/if}
</div>
