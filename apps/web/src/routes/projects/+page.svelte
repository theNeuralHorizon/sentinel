<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";

  type Project = { id: string; slug: string; name: string; description?: string; createdAt: string };
  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let createForm = $state({ slug: "", name: "", repoUrl: "" });
  let scanForm = $state({ projectSlug: "", workDir: "/workspace" });

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await api.listProjects();
      projects = res.projects;
    } finally {
      loading = false;
    }
  }

  async function create(ev: SubmitEvent): Promise<void> {
    ev.preventDefault();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sentinel.token")}` };
    await fetch("/v1/projects", { method: "POST", headers, body: JSON.stringify(createForm) });
    createForm = { slug: "", name: "", repoUrl: "" };
    await load();
  }

  async function triggerScan(): Promise<void> {
    if (!scanForm.projectSlug) return;
    await api.triggerScan(scanForm);
    scanForm = { projectSlug: "", workDir: "/workspace" };
  }

  onMount(load);
</script>

<div class="flex flex-col gap-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
    <p class="text-sm text-[var(--color-fg-muted)]">Create projects, trigger scans, and inspect drift across releases.</p>
  </header>

  <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form class="card p-4 flex flex-col gap-3" onsubmit={create}>
      <h2 class="text-sm uppercase tracking-wider text-[var(--color-fg-subtle)]">New project</h2>
      <label class="flex flex-col gap-1 text-sm">
        Slug
        <input class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]"
               bind:value={createForm.slug} placeholder="payments-api" required pattern="[a-z0-9][a-z0-9-]*"/>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Name
        <input class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]"
               bind:value={createForm.name} placeholder="Payments API" required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Repo URL <span class="text-[var(--color-fg-subtle)]">(optional)</span>
        <input class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]"
               bind:value={createForm.repoUrl} placeholder="https://github.com/org/payments-api" />
      </label>
      <button class="chip bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-transparent self-start">Create</button>
    </form>

    <div class="card p-4 flex flex-col gap-3">
      <h2 class="text-sm uppercase tracking-wider text-[var(--color-fg-subtle)]">Trigger scan</h2>
      <label class="flex flex-col gap-1 text-sm">
        Project
        <select class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)]"
                bind:value={scanForm.projectSlug}>
          <option value="">— choose —</option>
          {#each projects as p}
            <option value={p.slug}>{p.name}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Working directory (on scanner)
        <input class="hairline px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] font-mono"
               bind:value={scanForm.workDir} placeholder="/workspace/payments-api" />
      </label>
      <button class="chip bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-transparent self-start"
              onclick={triggerScan}>Scan</button>
    </div>
  </section>

  <section class="card p-4">
    <header class="flex items-center justify-between mb-3">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {projects.length} project{projects.length === 1 ? "" : "s"}
      </span>
    </header>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[var(--color-fg-subtle)] text-xs uppercase">
          <th class="py-1">Slug</th>
          <th>Name</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each projects as p}
          <tr class="border-t border-[var(--color-border)]">
            <td class="py-2 font-mono text-[var(--color-accent)]">{p.slug}</td>
            <td>{p.name}</td>
            <td class="text-[var(--color-fg-muted)]">{new Date(p.createdAt).toLocaleString()}</td>
            <td class="text-right"><a class="chip hover:bg-[var(--color-surface-3)]" href="/projects/{p.slug}">View →</a></td>
          </tr>
        {:else}
          {#if loading}
            <tr><td colspan="4" class="py-8 text-center text-[var(--color-fg-muted)]">Loading…</td></tr>
          {:else}
            <tr><td colspan="4" class="py-8 text-center text-[var(--color-fg-muted)]">No projects yet. Create one above.</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </section>
</div>
