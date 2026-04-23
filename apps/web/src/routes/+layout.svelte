<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { api, getToken, setToken } from "$lib/api";
  import { onMount } from "svelte";

  let { children } = $props();
  let username = $state<string | null>(null);
  let loginBusy = $state(false);

  onMount(async () => {
    if (!browser) return;
    if (!getToken()) {
      try {
        loginBusy = true;
        await api.devLogin("analyst", "analyst");
        username = "analyst";
      } finally {
        loginBusy = false;
      }
    } else {
      username = "analyst";
    }
  });

  const links = [
    { href: "/", label: "Overview" },
    { href: "/projects", label: "Projects" },
    { href: "/vulnerabilities", label: "Vulnerabilities" },
    { href: "/remediations", label: "Remediations" },
    { href: "/search", label: "NL Query" },
    { href: "/policies", label: "Policies" },
  ];
</script>

<div class="min-h-full grid grid-cols-[240px_1fr]">
  <aside class="border-r border-[var(--color-border)] px-4 py-6 flex flex-col gap-8 bg-[color-mix(in_oklch,var(--color-surface-0)_94%,transparent)]">
    <div class="flex items-center gap-3">
      <div class="pulse-dot"></div>
      <div class="flex flex-col leading-tight">
        <span class="font-semibold tracking-wide text-[var(--color-fg)]">SENTINEL</span>
        <span class="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Supply Chain AI</span>
      </div>
    </div>

    <nav class="flex flex-col gap-1 text-sm">
      {#each links as link}
        {@const active = $page.url.pathname === link.href || ($page.url.pathname.startsWith(link.href) && link.href !== "/")}
        <a
          href={link.href}
          class="rounded-[var(--radius-md)] px-3 py-2 transition-colors"
          class:bg-[var(--color-surface-2)]={active}
          class:text-[var(--color-accent)]={active}
          class:text-[var(--color-fg-muted)]={!active}
          class:hover:bg-[var(--color-surface-2)]={true}
        >
          {link.label}
        </a>
      {/each}
    </nav>

    <div class="mt-auto text-xs text-[var(--color-fg-muted)] flex flex-col gap-1">
      <span>v0.1.0 · Claude Opus 4.7</span>
      {#if username}
        <span>Signed in as <span class="text-[var(--color-accent)]">{username}</span></span>
      {:else if loginBusy}
        <span>Authenticating…</span>
      {:else}
        <span>Offline</span>
      {/if}
    </div>
  </aside>

  <main class="p-6">
    {@render children()}
  </main>
</div>
