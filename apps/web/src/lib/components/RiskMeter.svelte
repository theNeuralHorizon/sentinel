<script lang="ts">
  let { score, label = "Risk", sub }: { score: number; label?: string; sub?: string } = $props();

  const clamped = $derived(Math.max(0, Math.min(100, Math.round(score))));
  const tier = $derived.by(() => {
    if (clamped >= 85) return { color: "oklch(62% 0.27 15)",  name: "Critical" };
    if (clamped >= 65) return { color: "oklch(70% 0.22 25)",  name: "High" };
    if (clamped >= 40) return { color: "oklch(80% 0.17 85)",  name: "Medium" };
    if (clamped >= 15) return { color: "oklch(74% 0.14 235)", name: "Low" };
    return                   { color: "oklch(82% 0.19 145)", name: "Minimal" };
  });

  const stroke = 10;
  const size = 140;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = $derived(circumference - (clamped / 100) * circumference);
</script>

<div class="card p-5 flex items-center gap-5">
  <div class="relative" style:width="{size}px" style:height="{size}px">
    <svg width={size} height={size} viewBox="0 0 {size} {size}" class="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius}
              stroke="var(--color-surface-3)" stroke-width={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius}
              stroke={tier.color} stroke-width={stroke} fill="none"
              stroke-linecap="round" stroke-dasharray={circumference}
              stroke-dashoffset={offset}
              style="transition: stroke-dashoffset 800ms cubic-bezier(0.25,0.8,0.25,1), stroke 300ms ease;
                     filter: drop-shadow(0 0 8px {tier.color}80);" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="display numeric text-3xl" style:color={tier.color}>{clamped}</span>
      <span class="eyebrow text-[10px] mt-0.5">/ 100</span>
    </div>
  </div>

  <div class="flex flex-col gap-1">
    <span class="eyebrow">{label}</span>
    <span class="display text-2xl" style:color={tier.color}>{tier.name}</span>
    {#if sub}
      <span class="text-xs text-[var(--color-fg-muted)]">{sub}</span>
    {/if}
  </div>
</div>
