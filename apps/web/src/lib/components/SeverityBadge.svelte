<script lang="ts">
  type Severity = "critical" | "high" | "medium" | "low" | "info";
  let { severity, score }: { severity: Severity; score?: number } = $props();

  const colors: Record<Severity, string> = {
    critical: "bg-[oklch(25%_0.1_15)] text-[oklch(78%_0.2_15)] border-[oklch(40%_0.2_15/0.5)]",
    high:     "bg-[oklch(25%_0.08_25)] text-[oklch(78%_0.19_25)] border-[oklch(40%_0.19_25/0.5)]",
    medium:   "bg-[oklch(25%_0.08_85)] text-[oklch(85%_0.15_85)] border-[oklch(40%_0.15_85/0.5)]",
    low:      "bg-[oklch(25%_0.08_235)] text-[oklch(80%_0.14_235)] border-[oklch(40%_0.14_235/0.5)]",
    info:     "bg-[oklch(25%_0.02_260)] text-[oklch(75%_0.01_260)] border-[oklch(40%_0.02_260/0.5)]",
  };
</script>

<span class="chip border {colors[severity]} font-mono uppercase">
  {severity}
  {#if score !== undefined}
    <span class="opacity-70 ml-1">{score}</span>
  {/if}
</span>
