<script lang="ts">
  import { goto } from '$app/navigation';
  import { createGame, joinGame } from '$lib/api/http';
  import { sessionStore, login, logout } from '$lib/stores/session.svelte';

  let pseudo = $state('');
  let joinCode = $state('');
  let mode = $state<'menu' | 'create' | 'join'>('menu');
  let error = $state('');
  let loading = $state(false);
  let deferredPrompt = $state<any>(null);
  let isStandalone = $state(false);
  let isIOS = $state(false);
  let iosHintDismissed = $state(false);

  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import Logo from '$lib/components/Logo.svelte';

  onMount(() => {
    isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    // iOS never fires beforeinstallprompt: installation is manual via the Share menu.
    isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    try {
      iosHintDismissed = localStorage.getItem('manhunt_ios_hint') === '1';
      pseudo = localStorage.getItem('manhunt_pseudo') ?? '';
    } catch { /* ignore */ }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
    });
  });

  function rememberPseudo() {
    try { localStorage.setItem('manhunt_pseudo', pseudo.trim()); } catch { /* ignore */ }
  }

  function back() {
    mode = 'menu';
    error = '';
  }

  function dismissIosHint() {
    iosHintDismissed = true;
    try { localStorage.setItem('manhunt_ios_hint', '1'); } catch { /* ignore */ }
  }

  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
  }

  async function handleCreate() {
    if (!pseudo.trim()) return;
    error = '';
    loading = true;
    try {
      rememberPseudo();
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
      if (sessionStore.data?.code === code && sessionStore.data.pseudo.toLowerCase() === pseudo.trim().toLowerCase()) {
        goto(`/game/${code}`);
        return;
      }
      rememberPseudo();
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

<div class="home">
  <div class="glow" aria-hidden="true"></div>

  <header class="hero reveal">
    <Logo size={mode === 'menu' ? 104 : 64} />
    <h1 class="wordmark"><span>Man</span>Hunt</h1>
    <p class="tagline">Chasse en conditions réelles</p>
  </header>

  <main class="panel">
    {#if mode === 'menu'}
      <div class="stack" in:fade={{ duration: 200 }}>
        {#if sessionStore.data}
          <div class="resume reveal" style="--d: 0.05s">
            <div class="resume-info">
              <span class="live-dot"></span>
              <span>Partie <strong class="code">{sessionStore.data.code}</strong> · {sessionStore.data.pseudo}</span>
            </div>
            <button class="btn-primary" onclick={() => goto(`/game/${sessionStore.data!.code}`)}>Reprendre la partie</button>
            <button class="link-btn" onclick={logout}>Oublier cette partie</button>
          </div>
        {/if}

        <div class="stack reveal" style="--d: 0.1s">
          <button class="btn-primary btn-lg" onclick={() => mode = 'create'}>Créer une partie</button>
          <button class="btn-secondary btn-lg" onclick={() => mode = 'join'}>Rejoindre une partie</button>
        </div>

        <div class="row reveal" style="--d: 0.18s">
          <button class="btn-ghost" onclick={() => goto('/rules')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>
            Règles du jeu
          </button>
          {#if deferredPrompt && !isStandalone}
            <button class="btn-ghost btn-ghost-accent" onclick={installApp}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
              Installer
            </button>
          {/if}
        </div>

        {#if isIOS && !isStandalone && !iosHintDismissed}
          <div class="ios-hint reveal" style="--d: 0.25s">
            <div class="ios-hint-title">Installer sur iPhone</div>
            <ol>
              <li>Ouvre ce site dans <strong>Safari</strong></li>
              <li>Touche <strong>Partager</strong>
                <svg width="13" height="15" viewBox="0 0 14 18" fill="none" stroke="currentColor" stroke-width="1.6" style="vertical-align: -2px;"><path d="M7 1v11M3.5 4.5 7 1l3.5 3.5M4 8H1.5v9h11V8H10"/></svg>
                en bas de l'écran</li>
              <li>Choisis <strong>« Sur l'écran d'accueil »</strong></li>
            </ol>
            <button class="link-btn" onclick={dismissIosHint}>Compris</button>
          </div>
        {/if}
      </div>

    {:else}
      <form class="form-card" in:fly={{ y: 16, duration: 250 }}
        onsubmit={(e) => { e.preventDefault(); if (mode === 'create') handleCreate(); else handleJoin(); }}>
        <h2>{mode === 'create' ? 'Créer une partie' : 'Rejoindre une partie'}</h2>
        <label class="field">
          <span>Pseudo</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={pseudo} placeholder="Ton pseudo" maxlength="20" autocomplete="off" autofocus={!pseudo} />
        </label>
        {#if mode === 'join'}
          <label class="field">
            <span>Code de la partie</span>
            <input class="code-input" bind:value={joinCode} placeholder="ABC123" maxlength="6" autocomplete="off"
              autocapitalize="characters" spellcheck="false" />
          </label>
        {/if}
        {#if error}<p class="error" in:fade>{error}</p>{/if}
        <button class="btn-primary btn-lg" type="submit"
          disabled={loading || !pseudo.trim() || (mode === 'join' && !joinCode.trim())}>
          {#if loading}
            <span class="spinner"></span>
          {:else}
            {mode === 'create' ? 'Créer' : 'Rejoindre'}
          {/if}
        </button>
        <button class="link-btn" type="button" onclick={back}>← Retour</button>
      </form>
    {/if}
  </main>
</div>

<style>
  .home {
    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    max-width: 440px;
    margin: 0 auto;
    padding: calc(1.5rem + env(safe-area-inset-top)) 1.25rem calc(1.5rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  /* Same glow as the splash, dithered with grain so it doesn't band */
  .glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    background:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.06'/></svg>"),
      radial-gradient(120vmax 120vmax at 50% 18%, rgba(255, 68, 68, 0.13), rgba(255, 68, 68, 0.04) 40%, rgba(255, 68, 68, 0) 70%);
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 220px;
    padding: 1rem 0 2rem;
  }
  .wordmark {
    margin: 1.25rem 0 0;
    font-size: 2.6rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .wordmark span {
    color: var(--accent);
  }
  .tagline {
    margin-top: 0.6rem;
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .panel {
    display: flex;
    flex-direction: column;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .row {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-lg {
    width: 100%;
    padding: 1rem 1.5rem;
    font-size: 1.05rem;
    border-radius: 14px;
  }
  .home :global(.btn-primary) {
    box-shadow: 0 6px 24px rgba(255, 68, 68, 0.25);
  }
  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 0.6rem 1rem;
    border-radius: 999px;
  }
  .btn-ghost:active {
    background: var(--surface);
  }
  .btn-ghost-accent {
    color: var(--accent);
  }
  .link-btn {
    background: none;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.4rem;
  }

  .resume {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    border-radius: 16px;
    background: rgba(255, 68, 68, 0.07);
    border: 1px solid rgba(255, 68, 68, 0.35);
    margin-bottom: 0.25rem;
  }
  .resume-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .resume .code {
    color: var(--accent);
    letter-spacing: 0.12em;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.6);
    animation: live 1.6s ease-out infinite;
  }
  @keyframes live {
    0% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.6); }
    100% { box-shadow: 0 0 0 8px rgba(255, 68, 68, 0); }
  }

  .ios-hint {
    margin-top: 0.5rem;
    padding: 1rem 1.1rem 0.6rem;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .ios-hint-title {
    font-weight: 700;
    margin-bottom: 0.4rem;
  }
  .ios-hint ol {
    padding-left: 1.2rem;
    color: var(--text-muted);
    line-height: 1.7;
  }
  .ios-hint .link-btn {
    width: 100%;
    margin-top: 0.25rem;
  }

  .form-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.25rem;
    border-radius: 18px;
    background: rgba(26, 26, 26, 0.85);
    border: 1px solid var(--border);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .form-card h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field span {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .field input {
    border-radius: 12px;
    background: var(--bg);
    font-size: 16px; /* >= 16px: iOS doesn't zoom on focus */
  }
  .code-input {
    text-transform: uppercase;
    letter-spacing: 0.35em;
    text-align: center;
    font-size: 1.4rem !important;
    font-weight: 700;
  }
  .spinner {
    display: inline-block;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
