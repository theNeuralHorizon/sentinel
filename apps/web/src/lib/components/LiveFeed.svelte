<script lang="ts">
  import { createLiveFeed } from "$lib/stores.svelte";
  import SeverityBadge from "./SeverityBadge.svelte";
  import NavIcon from "./NavIcon.svelte";

  let { topics = ["global"] }: { topics?: string[] } = $props();
  const feed = createLiveFeed(topics);

  function timeAgo(ts: number): string {
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }
</script>

<div class="card p-5 flex flex-col gap-3 h-full scanline">
  <header class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-[var(--color-fg-subtle)]"><NavIcon name="activity" size={14} /></span>
      <span class="eyebrow">Live Activity</span>
    </div>
    <div class="flex items-center gap-2 text-xs">
      {#if feed.connected}
        <span class="pulse-dot"></span>
        <span class="text-[var(--color-brand)]">live</span>
      {:else}
        <span class="h-2 w-2 rounded-full bg-[var(--color-fg-subtle)]"></span>
        <span class="text-[var(--color-fg-subtle)]">idle</span>
      {/if}
      <span class="text-[var(--color-fg-subtle)] numeric">{feed.entries.length}</span>
    </div>
  </header>

  <ul class="flex flex-col gap-1 flex-1 overflow-y-auto pr-1 min-h-[260px]">
    {#each feed.entries as entry (entry.id)}
      <li class="text-sm flex items-start gap-3 py-2 border-b border-[var(--color-border)] last:border-0 fade-in">
        <span class="font-mono text-[11px] text-[var(--color-fg-subtle)] w-16 shrink-0 pt-0.5">
          {timeAgo(entry.ts)}
        </span>
        {#if entry.severity}
          <SeverityBadge severity={entry.severity} />
        {:else}
          <span class="chip text-[10px] py-0 px-1.5">event</span>
        {/if}
        <span class="flex-1 truncate text-[var(--color-fg)]">{entry.label}</span>
      </li>
    {:else}
      <li class="text-sm text-[var(--color-fg-muted)] py-10 text-center flex flex-col items-center gap-3">
        <span class="chip text-[10px] opacity-70">waiting</span>
        <span>No events yet. Trigger a scan to see real-time activity here.</span>
      </li>
    {/each}
  </ul>
</div>
