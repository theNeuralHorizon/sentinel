<script lang="ts">
  import { onMount } from "svelte";
  import { api, getToken } from "$lib/api";
  import NavIcon from "$lib/components/NavIcon.svelte";

  type Project = { id: string; slug: string; name: string; description?: string; createdAt: string };

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let createForm = $state({ slug: "", name: "", repoUrl: "" });
  let scanForm = $state({ projectSlug: "", workDir: "/workspace" });
  let busy = $state(false);
  let banner = $state<{ kind: "ok" | "err"; text: string } | null>(null);

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
    busy = true;
    banner = null;
    try {
      const token = getToken();
      const res = await fetch("http://localhost:4000/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      banner = { kind: "ok", text: `Project ${createForm.slug} created.` };
      createForm = { slug: "", name: "", repoUrl: "" };
      await load();
    } catch (err) {
      banner = { kind: "err", text: err instanceof Error ? err.message : String(err) };
    } finally {
      busy = false;
    }
  }

  async function triggerScan(): Promise<void> {
    if (!scanForm.projectSlug) return;
    busy = true;
    banner = null;
    try {
      await api.triggerScan(scanForm);
      banner = { kind: "ok", text: `Scan queued for ${scanForm.projectSlug}.` };
      scanForm = { projectSlug: "", workDir: "/workspace" };
    } catch (err) {
      banner = { kind: "err", text: err instanceof Error ? err.message : String(err) };
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<div class="flex flex-col gap-7">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="eyebrow">Inventory</span>
      <h1 class="display text-[32px] text-[var(--color-fg)] leading-tight">Projects</h1>
      <p class="text-sm text-[var(--color-fg-muted)] max-w-2xl">
        Create projects, trigger scans, inspect drift between releases.
      </p>
    </div>
  </header>

  {#if banner}
    <div
      class="card p-3 flex items-center gap-3"
      class:border-[var(--color-brand-dim)]={banner.kind === "ok"}
      class:border-[var(--color-danger)]={banner.kind === "err"}
    >
      <span class:text-[var(--color-brand)]={banner.kind === "ok"} class:text-[var(--color-danger)]={banner.kind === "err"}>
        <NavIcon name={banner.kind === "ok" ? "check" : "shield-alert"} size={14} />
      </span>
      <span class="text-sm">{banner.text}</span>
    </div>
  {/if}

  <!-- Two-up forms -->
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <form class="card p-5 flex flex-col gap-3" onsubmit={create}>
      <header class="flex items-center gap-2">
        <NavIcon name="folder" size={14} />
        <span class="eyebrow">New Project</span>
      </header>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>Slug <span class="text-[var(--color-fg-subtle)]">(url-safe)</span></span>
        <input class="input font-mono" bind:value={createForm.slug}
               placeholder="payments-api" required pattern="[a-z0-9][a-z0-9-]*" />
      </label>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>Name</span>
        <input class="input" bind:value={createForm.name} placeholder="Payments API" required />
      </label>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>Repo URL <span class="text-[var(--color-fg-subtle)]">(optional)</span></span>
        <input class="input" bind:value={createForm.repoUrl} placeholder="https://github.com/org/payments-api" />
      </label>

      <button class="btn btn-primary self-start mt-1" disabled={busy}>
        <NavIcon name="check" size={14} />
        {busy ? "creating…" : "Create project"}
      </button>
    </form>

    <div class="card p-5 flex flex-col gap-3">
      <header class="flex items-center gap-2">
        <NavIcon name="zap" size={14} />
        <span class="eyebrow">Trigger Scan</span>
      </header>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>Project</span>
        <select class="input" bind:value={scanForm.projectSlug}>
          <option value="">— choose —</option>
          {#each projects as p}
            <option value={p.slug}>{p.name}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--color-fg-muted)]">
        <span>Working directory <span class="text-[var(--color-fg-subtle)]">(on scanner)</span></span>
        <input class="input font-mono" bind:value={scanForm.workDir} placeholder="/workspace/payments-api" />
      </label>

      <button class="btn btn-primary self-start mt-1" onclick={triggerScan} disabled={busy || !scanForm.projectSlug}>
        <NavIcon name="zap" size={14} />
        {busy ? "queuing…" : "Queue scan"}
      </button>
    </div>
  </section>

  <!-- Projects list -->
  <section class="card overflow-hidden">
    <header class="flex items-center justify-between p-5 pb-3">
      <div class="flex items-center gap-2">
        <NavIcon name="folder" size={14} />
        <span class="eyebrow">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
      </div>
    </header>
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Name</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each projects as p}
            <tr>
              <td class="font-mono text-[var(--color-brand)] text-xs">{p.slug}</td>
              <td>{p.name}</td>
              <td class="text-[var(--color-fg-muted)] text-xs">{new Date(p.createdAt).toLocaleString()}</td>
              <td class="text-right">
                <a class="btn btn-ghost text-xs" href="/projects/{p.slug}">
                  View <NavIcon name="chevron-right" size={12} />
                </a>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="4" class="py-12 text-center text-[var(--color-fg-muted)]">
                {#if loading}Loading…{:else}No projects yet. Create one above.{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
