<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  let { children } = $props();

  // Safety net: never leave .reveal content hidden if the splash script didn't run.
  onMount(() => {
    const t = setTimeout(() => document.documentElement.classList.add('app-ready'), 3000);
    document.addEventListener('focusout', clearUndoHistory, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('focusout', clearUndoHistory, true);
    };
  });

  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number']);

  /**
   * iOS "Shake to Undo" pops up whenever the page has undoable typing, which
   * happens constantly while running with the phone. Web pages can't disable it,
   * but WebKit drops the undo history when a field's value is set from script:
   * do a no-op change when leaving a text field so there's nothing left to undo.
   */
  function clearUndoHistory(e: FocusEvent) {
    const el = e.target;
    const isText = el instanceof HTMLTextAreaElement
      || (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type));
    if (!isText) return;
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    const value = field.value;
    try {
      field.value = `${value} `;
      field.value = value;
    } catch { /* number inputs reject non-numeric values */ }
  }
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
