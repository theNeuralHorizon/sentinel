<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { api, getToken } from "$lib/api";
  import { onMount } from "svelte";
  import Logo from "$lib/components/Logo.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";

  let { children } = $props();

  // Best-effort silent dev-login on first mount; the rest of the UI handles
  // "no API yet" states locally per page.
  onMount(async () => {
    if (!browser) return;
    try {
      if (!getToken()) await api.devLogin("analyst", "analyst");
    } catch {
      /* swallow — pages render their own empty/error states */
    }
  });

  const nav: Array<{ href: string; label: string; icon: string; badge?: string }> = [
    { href: "/",                label: "Overview",       icon: "dashboard" },
    { href: "/projects",        label: "Projects",       icon: "folder" },
    { href: "/vulnerabilities", label: "Vulnerabilities", icon: "shield-alert" },
    { href: "/remediations",    label: "Remediations",   icon: "wand", badge: "AI" },
    { href: "/search",          label: "NL Query",       icon: "search" },
    { href: "/policies",        label: "Policies",       icon: "book-lock" },
  ];

  function isActive(href: string): boolean {
    const path = $page.url.pathname;
    if (href === "/") return path === "/";
    return path.startsWith(href);
  }
</script>

<div class="min-h-screen grid grid-cols-[260px_1fr]">
  <aside class="sticky top-0 h-screen border-r border-[var(--color-border)] bg-[color-mix(in_oklch,var(--color-bg)_92%,transparent)] backdrop-blur-md px-5 pt-6 pb-5 flex flex-col gap-8">
    <!-- Brand -->
    <a href="/" class="flex items-center gap-3 group">
      <span class="p-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] border border-[var(--color-border)] group-hover:border-[var(--color-brand-dim)] transition-colors">
        <Logo size={22} />
      </span>
      <span class="flex flex-col leading-none">
        <span class="display text-[17px] tracking-tight text-[var(--color-fg)]">Sentinel</span>
        <span class="eyebrow mt-1">Supply&nbsp;Chain&nbsp;AI</span>
      </span>
    </a>

    <!-- Nav -->
    <nav class="flex flex-col gap-0.5">
      {#each nav as link}
        {@const active = isActive(link.href)}
        <a
          href={link.href}
          class="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors group"
          class:text-[var(--color-brand)]={active}
          class:bg-[var(--color-surface-2)]={active}
          class:hairline-strong={active}
          class:text-[var(--color-fg-muted)]={!active}
          class:hover:text-[var(--color-fg)]={!active}
          class:hover:bg-[var(--color-surface-2)]={!active}
        >
          <span class="opacity-80 group-hover:opacity-100 transition-opacity"><NavIcon name={link.icon} /></span>
          <span class="flex-1">{link.label}</span>
          {#if link.badge}
            <span class="chip chip-brand text-[10px] py-0 px-1.5">{link.badge}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Version card -->
    <div class="hairline rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-fg-subtle)]">
      <span class="font-mono">v0.1.0</span>
    </div>
  </aside>

  <main class="p-8 max-w-[1400px] w-full fade-in">
    {@render children()}
  </main>
</div>
