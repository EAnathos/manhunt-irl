<script lang="ts">
  interface Props {
    size?: number;
    /** Show the radar wave pulsing from the center */
    pulse?: boolean;
  }

  let { size = 96, pulse = true }: Props = $props();
</script>

<svg class="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
  {#if pulse}
    <circle class="wave" cx="256" cy="256" r="120" />
  {/if}
  <circle class="ring" cx="256" cy="256" r="180" stroke-width="18" opacity="0.3" />
  <circle class="ring" cx="256" cy="256" r="120" stroke-width="14" opacity="0.6" />
  <circle class="ring" cx="256" cy="256" r="60" stroke-width="10" />
  <g class="cross">
    <line x1="256" y1="30" x2="256" y2="160" />
    <line x1="256" y1="352" x2="256" y2="482" />
    <line x1="30" y1="256" x2="160" y2="256" />
    <line x1="352" y1="256" x2="482" y2="256" />
  </g>
  <circle cx="256" cy="256" r="14" fill="#ff4444" />
</svg>

<style>
  .logo {
    overflow: visible;
    display: block;
  }
  .ring {
    fill: none;
    stroke: #ff4444;
  }
  .cross {
    stroke: #ff4444;
    stroke-width: 10;
    stroke-linecap: round;
  }
  .wave {
    fill: none;
    stroke: #ff4444;
    stroke-width: 4;
    transform-origin: 256px 256px;
    animation: wave 2.4s ease-out infinite;
    opacity: 0;
  }
  @keyframes wave {
    0% { opacity: 0.6; transform: scale(0.3); }
    70%, 100% { opacity: 0; transform: scale(1.9); }
  }
  @media (prefers-reduced-motion: reduce) {
    .wave { display: none; }
  }
</style>
