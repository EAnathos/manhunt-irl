<script lang="ts">
  import { goto } from '$app/navigation';
  import { createGame, joinGame } from '$lib/api/http';
  import { sessionStore, login } from '$lib/stores/session.svelte';

  let pseudo = $state('');
  let joinCode = $state('');
  let mode = $state<'menu' | 'create' | 'join'>('menu');
  let error = $state('');
  let loading = $state(false);

  async function handleCreate() {
    if (!pseudo.trim()) return;
    error = '';
    loading = true;
    try {
      const res = await createGame(pseudo.trim());
      login({ sessionId: res.sessionId, code: res.code, pseudo: pseudo.trim() });
      goto(`/game/${res.code}`);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function handleJoin() {
    if (!pseudo.trim() || !joinCode.trim()) return;
    error = '';
    loading = true;
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await joinGame(code, pseudo.trim());
      login({ sessionId: res.sessionId, code, pseudo: pseudo.trim() });
      goto(`/game/${code}`);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="container">
  <div style="text-align: center; padding-top: 3rem; margin-bottom: 2rem;">
    <h1 style="font-size: 2.5rem; letter-spacing: -0.02em;">
      <span style="color: var(--accent);">Man</span>Hunt
    </h1>
    <p style="color: var(--text-muted);">Chasse en conditions réelles</p>
  </div>

  {#if mode === 'menu'}
    <div class="card" style="display: flex; flex-direction: column; gap: 0.75rem;">
      <button class="btn-primary" onclick={() => mode = 'create'}>Créer une partie</button>
      <button class="btn-secondary" onclick={() => mode = 'join'}>Rejoindre une partie</button>
      <button class="btn-secondary" onclick={() => goto('/rules')}>Règles du jeu</button>
    </div>

  {:else if mode === 'create'}
    <div class="card">
      <h2>Créer une partie</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} style="display: flex; flex-direction: column; gap: 0.75rem;">
        <input bind:value={pseudo} placeholder="Ton pseudo" maxlength="20" autocomplete="off" />
        <button class="btn-primary" type="submit" disabled={loading || !pseudo.trim()}>
          {loading ? 'Création...' : 'Créer'}
        </button>
        <button class="btn-secondary" type="button" onclick={() => { mode = 'menu'; error = ''; }}>Retour</button>
        {#if error}<p class="error">{error}</p>{/if}
      </form>
    </div>

  {:else if mode === 'join'}
    <div class="card">
      <h2>Rejoindre une partie</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} style="display: flex; flex-direction: column; gap: 0.75rem;">
        <input bind:value={pseudo} placeholder="Ton pseudo" maxlength="20" autocomplete="off" />
        <input bind:value={joinCode} placeholder="Code de la partie" maxlength="6" autocomplete="off"
          style="text-transform: uppercase; letter-spacing: 0.2em; text-align: center; font-size: 1.25rem;" />
        <button class="btn-primary" type="submit" disabled={loading || !pseudo.trim() || !joinCode.trim()}>
          {loading ? 'Connexion...' : 'Rejoindre'}
        </button>
        <button class="btn-secondary" type="button" onclick={() => { mode = 'menu'; error = ''; }}>Retour</button>
        {#if error}<p class="error">{error}</p>{/if}
      </form>
    </div>
  {/if}
</div>
