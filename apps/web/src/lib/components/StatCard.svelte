<script lang="ts">
  import NavIcon from "./NavIcon.svelte";

  let {
    label,
    value,
    sub,
    accent = false,
    icon,
    trend,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    accent?: boolean;
    icon?: string;
    trend?: { dir: "up" | "down" | "flat"; text: string } | undefined;
  } = $props();
</script>

<div class="card card-interactive p-5 flex flex-col gap-2">
  <header class="flex items-center justify-between">
    <span class="eyebrow">{label}</span>
    {#if icon}
      <span class="text-[var(--color-fg-subtle)]"><NavIcon name={icon} size={14} /></span>
    {/if}
  </header>

  <div class="flex items-baseline gap-2 mt-1">
    <span
      class="display text-4xl numeric"
      style:color={accent ? "var(--color-brand)" : "var(--color-fg)"}
    >
      {value}
    </span>
    {#if trend}
      <span
        class="text-xs numeric flex items-center gap-0.5"
        class:text-[var(--color-brand)]={trend.dir === "up"}
        class:text-[var(--color-danger)]={trend.dir === "down"}
        class:text-[var(--color-fg-subtle)]={trend.dir === "flat"}
      >
        {trend.text}
      </span>
    {/if}
  </div>

  {#if sub}
    <span class="text-xs text-[var(--color-fg-muted)]">{sub}</span>
  {/if}
</div>
