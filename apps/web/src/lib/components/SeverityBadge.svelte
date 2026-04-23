<script lang="ts">
  type Severity = "critical" | "high" | "medium" | "low" | "info";
  let { severity, score }: { severity: Severity; score?: number } = $props();

  const cls: Record<Severity, string> = {
    critical: "chip-critical",
    high:     "chip-danger",
    medium:   "chip-warn",
    low:      "chip-info",
    info:     "",
  };
</script>

<span class="chip {cls[severity]} uppercase tracking-wide" style="font-size: 10px;">
  {severity}
  {#if score !== undefined}
    <span class="opacity-75 ml-0.5 font-mono">{score}</span>
  {/if}
</span>
