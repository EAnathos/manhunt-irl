<script>
  import '../app.css';
  import { onMount } from 'svelte';
  let { children } = $props();

  // Safety net: never leave .reveal content hidden if the splash script didn't run.
  onMount(() => {
    const t = setTimeout(() => document.documentElement.classList.add('app-ready'), 3000);
    return () => clearTimeout(t);
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#0f0f0f" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ManHunt" />
  <title>ManHunt IRL</title>
</svelte:head>

{@render children()}
