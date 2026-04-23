<script lang="ts">
  import { onMount } from "svelte";

  type Policy = {
    id: string;
    slug: string;
    name: string;
    enabled: boolean;
    rules: { conditions: Array<{ field: string; op: string; value: unknown }>; action: string };
  };
  let policies = $state<Policy[]>([]);

  async function load(): Promise<void> {
    const headers = { Authorization: `Bearer ${localStorage.getItem("sentinel.token")}` };
    const res = await fetch("/v1/policies", { headers });
    if (res.ok) {
      const body = (await res.json()) as { policies: Policy[] };
      policies = body.policies;
    }
  }

  onMount(load);

  // Seed example policies on first load so the UI isn't empty.
  const examples: Policy[] = [
    {
      id: "ex1", slug: "block-agpl", name: "Block AGPL in proprietary code", enabled: true,
      rules: { conditions: [{ field: "license", op: "in", value: ["AGPL-3.0", "SSPL-1.0"] }], action: "block" },
    },
    {
      id: "ex2", slug: "escalate-critical-epss", name: "Escalate critical + active exploitation", enabled: true,
      rules: { conditions: [{ field: "severity", op: "eq", value: "critical" }, { field: "epss", op: "gte", value: 0.5 }], action: "escalate" },
    },
    {
      id: "ex3", slug: "warn-unknown-license", name: "Warn on unknown licenses", enabled: true,
      rules: { conditions: [{ field: "licenseRisk", op: "eq", value: "unknown" }], action: "warn" },
    },
  ];
  const shown = $derived(policies.length > 0 ? policies : examples);
</script>

<div class="flex flex-col gap-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Governance Policies</h1>
    <p class="text-sm text-[var(--color-fg-muted)]">Declarative rules gate scans, drive notifications, and dispatch remediations.</p>
  </header>

  <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each shown as p (p.id)}
      <article class="card p-4 flex flex-col gap-3">
        <header class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="font-mono text-[var(--color-accent)] text-sm">{p.slug}</span>
            <span class="text-sm text-[var(--color-fg)]">{p.name}</span>
          </div>
          <span class="chip"
                class:bg-[var(--color-accent)]={p.enabled}
                class:text-[var(--color-accent-fg)]={p.enabled}>
            {p.enabled ? "enabled" : "disabled"}
          </span>
        </header>
        <ul class="flex flex-col gap-1 text-xs font-mono text-[var(--color-fg-muted)]">
          {#each p.rules.conditions as cond}
            <li class="hairline rounded-[var(--radius-sm)] px-2 py-1">
              <span class="text-[var(--color-fg)]">{cond.field}</span>
              <span class="text-[var(--color-fg-subtle)]">{cond.op}</span>
              <span class="text-[var(--color-accent)]">{JSON.stringify(cond.value)}</span>
            </li>
          {/each}
        </ul>
        <footer class="flex items-center justify-between text-xs">
          <span class="text-[var(--color-fg-subtle)]">action:</span>
          <span class="chip uppercase">{p.rules.action}</span>
        </footer>
      </article>
    {/each}
  </section>
</div>
