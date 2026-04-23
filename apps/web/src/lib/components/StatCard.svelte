<script lang="ts">
  let {
    label,
    value,
    sub,
    accent = false,
  }: { label: string; value: string | number; sub?: string; accent?: boolean } = $props();
</script>

<div class="card p-4 flex flex-col gap-1">
  <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">{label}</span>
  <span
    class="text-3xl font-semibold tabular-nums"
    style:color={accent ? "var(--color-accent)" : "var(--color-fg)"}
  >
    {value}
  </span>
  {#if sub}
    <span class="text-xs text-[var(--color-fg-muted)]">{sub}</span>
  {/if}
</div>
