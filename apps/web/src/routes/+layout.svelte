<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { api, getToken } from "$lib/api";
  import { onMount } from "svelte";
  import Logo from "$lib/components/Logo.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";

  let { children } = $props();

  let username = $state<string | null>(null);
  let authState = $state<"loading" | "ready" | "error">("loading");

  onMount(async () => {
    if (!browser) return;
    try {
      if (!getToken()) {
        await api.devLogin("analyst", "analyst");
      }
      username = "analyst";
      authState = "ready";
    } catch {
      authState = "error";
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

    <!-- Status card -->
    <div class="hairline rounded-[var(--radius-md)] p-3 flex flex-col gap-2 text-xs">
      <div class="flex items-center gap-2">
        {#if authState === "ready"}
          <span class="pulse-dot"></span>
          <span class="text-[var(--color-fg)]">Connected</span>
        {:else if authState === "loading"}
          <span class="h-2 w-2 rounded-full bg-[var(--color-fg-subtle)] animate-pulse"></span>
          <span class="text-[var(--color-fg-muted)]">Authenticating…</span>
        {:else}
          <span class="h-2 w-2 rounded-full bg-[var(--color-danger)]"></span>
          <span class="text-[var(--color-danger)]">API unreachable</span>
        {/if}
      </div>
      {#if username}
        <div class="text-[var(--color-fg-subtle)]">
          Signed in as <span class="text-[var(--color-fg-muted)]">{username}</span>
        </div>
      {/if}
      <div class="pt-1 border-t border-[var(--color-border)] text-[var(--color-fg-subtle)] flex items-center justify-between">
        <span>v0.1.0</span>
        <span class="font-mono">Claude Opus</span>
      </div>
    </div>
  </aside>

  <main class="p-8 max-w-[1400px] w-full fade-in">
    {@render children()}
  </main>
</div>
