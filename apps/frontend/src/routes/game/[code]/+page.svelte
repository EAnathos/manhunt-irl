<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { sessionStore, logout } from '$lib/stores/session.svelte';
  import { connectWs, sendWs, disconnectWs } from '$lib/api/ws';
  import { gameStore, initGameListeners } from '$lib/stores/game.svelte';
  import type { Role, PlayerSnapshot } from '@manhunt/types';

  let geoWatchId: number | null = null;
  let unsub: (() => void) | null = null;
  let error = $state('');
  let timer = $state('');
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let shuffling = $state(false);

  let isHost = $derived(sessionStore.data?.sessionId === gameStore.game?.hostSessionId);
  let myPlayer = $derived(gameStore.game?.players.find((p: PlayerSnapshot) => p.sessionId === sessionStore.data?.sessionId));

  onMount(() => {
    if (!sessionStore.data) {
      goto('/');
      return;
    }
    unsub = initGameListeners();
    connectWs($page.params.code as string, sessionStore.data.sessionId);

    if ('geolocation' in navigator) {
      geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          sendWs({
            type: 'position',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          error = 'Géolocalisation requise pour jouer';
        },
        { enableHighAccuracy: true, maximumAge: 1000 },
      );
    }

    timerInterval = setInterval(updateTimer, 1000);
  });

  onDestroy(() => {
    disconnectWs();
    if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId);
    if (unsub) unsub();
    if (timerInterval) clearInterval(timerInterval);
  });

  function updateTimer() {
    const g = gameStore.game;
    if (!g?.startedAt || g.status !== 'EN_COURS') {
      timer = '';
      return;
    }
    const elapsed = Math.floor((Date.now() - g.startedAt) / 1000);
    const remaining = Math.max(0, g.maxDuration - elapsed);
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    timer = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function assignRole(targetSessionId: string, role: Role) {
    sendWs({ type: 'assign_role', targetSessionId, role });
  }

  function startGame() {
    sendWs({ type: 'start_game' });
  }

  function randomizeRoles() {
    if (shuffling) return;
    shuffling = true;
    const players = gameStore.game?.players ?? [];
    const preyCount = Math.max(1, Math.floor(players.length / 3));
    sendWs({ type: 'randomize_roles', preyCount });
    setTimeout(() => { shuffling = false; }, 600);
  }

  function dissolve() {
    sendWs({ type: 'dissolve_game' });
    logout();
    goto('/');
  }

  function declareElimination(preySessionId: string) {
    sendWs({ type: 'declare_elimination', preySessionId });
  }

  function confirmElim(id: string) {
    sendWs({ type: 'confirm_elimination', eliminationId: id });
  }

  function contestElim(id: string) {
    sendWs({ type: 'contest_elimination', eliminationId: id });
  }

  function arbitrate(id: string, confirmed: boolean) {
    sendWs({ type: 'arbitrate_elimination', eliminationId: id, confirmed });
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m} min` : `${seconds} s`;
  }
</script>

<div class="container">
  {#if !gameStore.game}
    <div class="card" style="text-align: center;">
      <p>Connexion à la partie...</p>
    </div>

  {:else if gameStore.game.status === 'LOBBY'}
    {@const game = gameStore.game}
    <!-- LOBBY -->
    <div class="flex-between" style="margin-bottom: 1rem;">
      <h1>Lobby</h1>
      <div style="text-align: right;">
        <div style="font-size: 2rem; letter-spacing: 0.15em; font-weight: 700; color: var(--accent);">
          {game.code}
        </div>
        <div style="color: var(--text-muted); font-size: 0.8rem;">Code de partie</div>
      </div>
    </div>

    <div class="card" class:shuffling>
      <div class="flex-between" style="margin-bottom: 0.75rem;">
        <h2 style="margin-bottom: 0;">Joueurs ({game.players.length}/20)</h2>
        {#if isHost && game.players.length >= 2}
          <button class="btn-shuffle" style="padding: 0.4rem 0.9rem; font-size: 0.85rem;" onclick={randomizeRoles} disabled={shuffling}>
            <span class="dice">🎲</span> Aléatoire
          </button>
        {/if}
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        {#each game.players as player}
          <div class="flex-between" style="padding: 0.5rem; border-radius: var(--radius); background: var(--bg);">
            <div>
              <span>{player.pseudo}</span>
              {#if player.sessionId === game.hostSessionId}
                <span style="color: var(--warning); font-size: 0.75rem; margin-left: 0.25rem;">★ Hôte</span>
              {/if}
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge" class:badge-hunter={player.role === 'CHASSEUR'} class:badge-prey={player.role === 'PROIE'}>
                {player.role === 'CHASSEUR' ? 'Chasseur' : 'Proie'}
              </span>
              {#if isHost && player.sessionId !== sessionStore.data?.sessionId}
                <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                  onclick={() => assignRole(player.sessionId, player.role === 'CHASSEUR' ? 'PROIE' : 'CHASSEUR')}>
                  ↔
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if isHost}
      <div class="card">
        <h2>Configuration</h2>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <label>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Durée de la partie</span>
            <select onchange={(e) => sendWs({ type: 'update_config', maxDuration: Number((e.target as HTMLSelectElement).value) })}>
              <option value="900">15 min</option>
              <option value="1800" selected>30 min</option>
              <option value="2700">45 min</option>
              <option value="3600">1 heure</option>
              <option value="5400">1h30</option>
              <option value="7200">2 heures</option>
            </select>
          </label>
          <label>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Délai de grâce</span>
            <select onchange={(e) => sendWs({ type: 'update_config', gracePeriod: Number((e.target as HTMLSelectElement).value) })}>
              <option value="30">30 s</option>
              <option value="60" selected>1 min</option>
              <option value="120">2 min</option>
              <option value="180">3 min</option>
              <option value="300">5 min</option>
            </select>
          </label>
          <label>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Intervalle ping Proies</span>
            <select onchange={(e) => sendWs({ type: 'update_config', preyPingInterval: Number((e.target as HTMLSelectElement).value) })}>
              <option value="3">3 s</option>
              <option value="10">10 s</option>
              <option value="30">30 s</option>
              <option value="60">1 min</option>
              <option value="120" selected>2 min</option>
              <option value="300">5 min</option>
              <option value="600">10 min</option>
              <option value="1200">20 min</option>
            </select>
          </label>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">
        <button class="btn-primary" onclick={startGame}
          disabled={!game.players.some((p: PlayerSnapshot) => p.role === 'PROIE') || game.players.length < 2}>
          Lancer la partie
        </button>
        <button class="btn-secondary" onclick={dissolve} style="color: var(--accent);">
          Dissoudre la partie
        </button>
      </div>
    {:else}
      <div class="card" style="text-align: center; color: var(--text-muted);">
        En attente du lancement par l'hôte...
      </div>
    {/if}

  {:else if gameStore.game.status === 'EN_COURS'}
    {@const game = gameStore.game}
    <!-- ACTIVE GAME -->
    <div class="flex-between" style="margin-bottom: 0.5rem;">
      <div>
        <span class="badge" class:badge-hunter={myPlayer?.role === 'CHASSEUR'} class:badge-prey={myPlayer?.role === 'PROIE'}>
          {myPlayer?.role === 'CHASSEUR' ? 'Chasseur' : 'Proie'}
        </span>
      </div>
      {#if timer}
        <div style="font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums;">
          {timer}
        </div>
      {/if}
    </div>

    {#if gameStore.gracePeriodActive}
      <div class="card" style="text-align: center; border-color: var(--warning); color: var(--warning);">
        ⏳ Délai de grâce — Les Proies se cachent !
      </div>
    {/if}

    {#if gameStore.outOfZoneWarning != null}
      <div class="card" style="text-align: center; border-color: var(--accent); color: var(--accent); font-weight: 700;">
        ⚠ Hors zone ! Retourne dans la zone ({gameStore.outOfZoneWarning}s restantes)
      </div>
    {/if}

    {#if gameStore.pendingElimination && myPlayer}
      {@const pending = gameStore.pendingElimination}
      <div class="card" style="border-color: var(--warning);">
        <h2 style="color: var(--warning);">Élimination déclarée</h2>
        <p>{pending.hunterPseudo} → {pending.preyPseudo}</p>
        {#if pending.preyId === sessionStore.data?.sessionId && pending.status === 'EN_ATTENTE'}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <button class="btn-primary" style="flex: 1; background: var(--success);" onclick={() => confirmElim(pending.id)}>
              Confirmer
            </button>
            <button class="btn-primary" style="flex: 1;" onclick={() => contestElim(pending.id)}>
              Contester
            </button>
          </div>
        {/if}
        {#if isHost && pending.status === 'CONTESTEE'}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <button class="btn-primary" style="flex: 1; background: var(--success);" onclick={() => arbitrate(pending.id, true)}>
              Valider
            </button>
            <button class="btn-primary" style="flex: 1;" onclick={() => arbitrate(pending.id, false)}>
              Rejeter
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if myPlayer?.role === 'CHASSEUR'}
      <div class="card">
        <h2>Chasseurs</h2>
        {#each gameStore.hunterPositions as h}
          <div class="flex-between" style="padding: 0.25rem 0; font-size: 0.9rem;">
            <span style="color: var(--hunter);">{h.pseudo}</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">
              {h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}
            </span>
          </div>
        {/each}
        {#if gameStore.hunterPositions.length === 0}
          <p style="color: var(--text-muted); font-size: 0.85rem;">En attente de positions...</p>
        {/if}
      </div>

      {#if !gameStore.gracePeriodActive}
        <div class="card">
          <h2>Proies</h2>
          {#each gameStore.preyPositions as p}
            <div class="flex-between" style="padding: 0.25rem 0; font-size: 0.9rem;">
              <span style="color: var(--prey);">{p.pseudo}</span>
              <span style="color: var(--text-muted); font-size: 0.8rem;">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </span>
            </div>
          {/each}
          {#if gameStore.preyPositions.length === 0}
            <p style="color: var(--text-muted); font-size: 0.85rem;">Prochain ping dans {formatDuration(game.preyPingInterval)}</p>
          {/if}
        </div>
      {/if}

      <div class="card">
        <h2>Éliminer une Proie</h2>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          {#each game.players.filter((p: PlayerSnapshot) => p.role === 'PROIE' && p.status === 'LIBRE') as prey}
            <button class="btn-secondary" onclick={() => declareElimination(prey.sessionId)}>
              🎯 {prey.pseudo}
            </button>
          {/each}
          {#if game.players.filter((p: PlayerSnapshot) => p.role === 'PROIE' && p.status === 'LIBRE').length === 0}
            <p style="color: var(--text-muted); font-size: 0.85rem;">Toutes les Proies sont éliminées</p>
          {/if}
        </div>
      </div>
    {:else}
      <div class="card" style="text-align: center;">
        <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">🏃 Reste en mouvement !</p>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Ta position est envoyée toutes les {formatDuration(game.preyPingInterval)}</p>
      </div>
    {/if}

    <div class="card">
      <h2>Joueurs</h2>
      {#each game.players as player}
        <div class="flex-between" style="padding: 0.25rem 0; font-size: 0.9rem;">
          <span style:opacity={player.status === 'ELIMINE' ? 0.4 : 1}>
            {player.pseudo}
          </span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span class="badge" class:badge-hunter={player.role === 'CHASSEUR'} class:badge-prey={player.role === 'PROIE'}>
              {player.role === 'CHASSEUR' ? '🔴' : '🔵'}
            </span>
            {#if player.status === 'ELIMINE'}
              <span style="color: var(--text-muted); font-size: 0.75rem;">Éliminé</span>
            {:else if player.status === 'DECONNECTE'}
              <span style="color: var(--warning); font-size: 0.75rem;">Déco</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

  {:else if gameStore.game.status === 'TERMINEE'}
    {@const game = gameStore.game}
    <!-- GAME OVER -->
    <div style="text-align: center; padding-top: 2rem;">
      <h1 style="font-size: 2rem; margin-bottom: 0.5rem;">Partie terminée</h1>
      {#if gameStore.gameOver}
        {@const over = gameStore.gameOver}
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
          {over.reason === 'time_up' ? 'Temps écoulé — Les Proies survivantes gagnent !' : 'Toutes les Proies éliminées — Les Chasseurs gagnent !'}
        </p>
        <div class="card">
          <h2 style="color: var(--success);">Vainqueurs</h2>
          {#each over.winners as w}
            <div style="padding: 0.25rem 0;">
              <span>{w.pseudo}</span>
              <span class="badge" class:badge-hunter={w.role === 'CHASSEUR'} class:badge-prey={w.role === 'PROIE'} style="margin-left: 0.5rem;">
                {w.role === 'CHASSEUR' ? 'Chasseur' : 'Proie'}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="card">
        <h2>Résumé</h2>
        {#each game.players as player}
          <div class="flex-between" style="padding: 0.25rem 0; font-size: 0.9rem;">
            <span>{player.pseudo}</span>
            <span class="badge" class:badge-hunter={player.role === 'CHASSEUR'} class:badge-prey={player.role === 'PROIE'}>
              {player.role === 'CHASSEUR' ? 'Chasseur' : 'Proie'} — {player.status === 'ELIMINE' ? 'Éliminé' : 'Libre'}
            </span>
          </div>
        {/each}
      </div>

      {#if game.eliminations.length > 0}
        <div class="card">
          <h2>Éliminations</h2>
          {#each game.eliminations.filter((e) => e.status === 'CONFIRMEE') as elim}
            {@const hunter = game.players.find((p: PlayerSnapshot) => p.sessionId === elim.hunterId)}
            {@const prey = game.players.find((p: PlayerSnapshot) => p.sessionId === elim.preyId)}
            <div style="padding: 0.25rem 0; font-size: 0.9rem; color: var(--text-muted);">
              <span style="color: var(--hunter);">{hunter?.pseudo ?? '?'}</span>
              → <span style="color: var(--prey);">{prey?.pseudo ?? '?'}</span>
            </div>
          {/each}
        </div>
      {/if}

      <button class="btn-primary" style="margin-top: 1rem; width: 100%;" onclick={() => { logout(); goto('/'); }}>
        Retour à l'accueil
      </button>
    </div>
  {/if}

  {#if error}
    <p class="error" style="margin-top: 1rem;">{error}</p>
  {/if}
</div>
