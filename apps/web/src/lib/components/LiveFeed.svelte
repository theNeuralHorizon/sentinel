<script lang="ts">
  import { createLiveFeed } from "$lib/stores.svelte";
  import SeverityBadge from "./SeverityBadge.svelte";

  let { topics = ["global"] }: { topics?: string[] } = $props();
  const feed = createLiveFeed(topics);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour12: false });
  }
</script>

<div class="card p-4 scanline">
  <header class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">Live activity</span>
      <span class:pulse-dot={feed.connected}></span>
    </div>
    <span class="text-xs text-[var(--color-fg-muted)] font-mono">{feed.entries.length}</span>
  </header>
  <ul class="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
    {#each feed.entries as entry (entry.id)}
      <li class="text-sm flex items-center gap-2 py-1 border-b border-[var(--color-border)] last:border-0">
        <span class="font-mono text-xs text-[var(--color-fg-subtle)] w-16">{formatTime(entry.ts)}</span>
        {#if entry.severity}
          <SeverityBadge severity={entry.severity} />
        {/if}
        <span class="flex-1 truncate text-[var(--color-fg)]">{entry.label}</span>
        <span class="text-xs text-[var(--color-fg-subtle)] font-mono hidden md:inline">{entry.kind}</span>
      </li>
    {:else}
      <li class="text-sm text-[var(--color-fg-muted)] py-6 text-center">
        Waiting for events — trigger a scan to see real-time activity.
      </li>
    {/each}
  </ul>
</div>
