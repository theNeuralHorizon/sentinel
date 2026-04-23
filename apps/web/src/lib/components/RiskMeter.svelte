<script lang="ts">
  let { score, label = "Risk" }: { score: number; label?: string } = $props();
  const clamped = $derived(Math.max(0, Math.min(100, score)));
  const tier = $derived.by(() => {
    if (clamped >= 85) return { color: "oklch(58% 0.27 15)", name: "critical" };
    if (clamped >= 65) return { color: "oklch(66% 0.22 25)", name: "high" };
    if (clamped >= 40) return { color: "oklch(78% 0.17 85)", name: "medium" };
    if (clamped >= 15) return { color: "oklch(74% 0.14 235)", name: "low" };
    return { color: "oklch(78% 0.19 145)", name: "minimal" };
  });
  const stroke = 8;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = $derived(circumference - (clamped / 100) * circumference);
</script>

<div class="card p-4 flex items-center gap-4">
  <svg viewBox="0 0 100 100" width="100" height="100" class="-rotate-90">
    <circle cx="50" cy="50" r={radius} stroke="var(--color-surface-3)" stroke-width={stroke} fill="none" />
    <circle
      cx="50" cy="50" r={radius} stroke={tier.color} stroke-width={stroke} fill="none"
      stroke-linecap="round" stroke-dasharray={circumference} stroke-dashoffset={offset}
      style="transition: stroke-dashoffset 600ms ease, stroke 300ms ease"
    />
  </svg>
  <div class="flex flex-col">
    <span class="text-xs uppercase tracking-wider text-[var(--color-fg-subtle)]">{label}</span>
    <span class="text-4xl font-semibold tabular-nums" style:color={tier.color}>{clamped}</span>
    <span class="text-xs text-[var(--color-fg-muted)] capitalize">{tier.name}</span>
  </div>
</div>
