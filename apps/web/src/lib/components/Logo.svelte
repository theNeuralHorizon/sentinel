<script lang="ts">
  let { size = 28 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sentinel-logo-a" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="oklch(82% 0.19 145)"/>
      <stop offset="1" stop-color="oklch(70% 0.17 185)"/>
    </linearGradient>
  </defs>
  <path
    d="M16 2 L28 7 L28 16 Q28 24.5 16 30 Q4 24.5 4 16 L4 7 Z"
    fill="none"
    stroke="url(#sentinel-logo-a)"
    stroke-width="2"
    stroke-linejoin="round"
  />
  <path
    d="M11 14 L15 18 L22 11"
    stroke="url(#sentinel-logo-a)"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
