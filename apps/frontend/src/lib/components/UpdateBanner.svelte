<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { updated } from '$app/state';
  import { gameStore } from '$lib/stores/game.svelte';

  let dismissed = $state(false);
  let updating = $state(false);

  // Don't interrupt a running game: offer the update in the lobby / after the game.
  let visible = $derived(updated.current && !dismissed && gameStore.game?.status !== 'EN_COURS');

  async function checkForUpdate() {
    updated.check().catch(() => {});
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.update().catch(() => {});
  }

  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  /** Drop every cache, fetch the new service worker, then reload on the new version. */
  async function applyUpdate() {
    updating = true;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch { /* reload anyway */ }
    location.reload();
  }
</script>

{#if visible}
  <div class="update-banner" role="status" transition:fly={{ y: -20, duration: 250 }}>
    <div class="update-text">
      <strong>Nouvelle version disponible</strong>
      <span>Mets à jour pour avoir les dernières corrections.</span>
    </div>
    <div class="update-actions">
      <button class="later" onclick={() => dismissed = true} disabled={updating}>Plus tard</button>
      <button class="btn-primary now" onclick={applyUpdate} disabled={updating}>
        {updating ? '…' : 'Mettre à jour'}
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    top: calc(12px + var(--safe-top));
    left: 12px;
    right: 12px;
    max-width: 456px;
    margin: 0 auto;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(26, 26, 26, 0.95);
    border: 1px solid var(--accent);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 68, 68, 0.2);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .update-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
  }
  .update-text span {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .update-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .later {
    background: transparent;
    color: var(--text-muted);
    padding: 0.5rem 0.9rem;
    font-size: 0.85rem;
  }
  .now {
    padding: 0.5rem 1.1rem;
    font-size: 0.85rem;
  }
</style>
