<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { sessionStore, logout } from '$lib/stores/session.svelte';
  import { connectWs, sendWs, disconnectWs } from '$lib/api/ws';
  import { gameStore, initGameListeners } from '$lib/stores/game.svelte';
  import type { Role, PlayerSnapshot, ChatChannel } from '@manhunt/types';
  import GameMap from '$lib/components/GameMap.svelte';

  let geoWatchId: number | null = null;
  let unsub: (() => void) | null = null;
  let error = $state('');
  let timer = $state('');
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let shuffling = $state(false);

  let myPosition = $state<{ latitude: number; longitude: number } | null>(null);
  let zoneRadius = $state(500);

  let chatOpen = $state(false);
  let chatInput = $state('');
  let activeChannel = $state<ChatChannel>('tous');
  let chatEndRef: HTMLDivElement | undefined = $state();

  let objectiveTitle = $state('');
  let objectiveTarget = $state<'proies' | 'chasseurs' | 'tous'>('tous');

  let eventDesc = $state('');
  let graceTimer = $state('');

  let isHost = $derived(sessionStore.data?.sessionId === gameStore.game?.hostSessionId);
  let myPlayer = $derived(gameStore.game?.players.find((p: PlayerSnapshot) => p.sessionId === sessionStore.data?.sessionId));
  let visibleChannels = $derived<ChatChannel[]>(
    myPlayer?.role === 'CHASSEUR' ? ['chasseurs', 'tous'] : myPlayer?.role === 'PROIE' ? ['proies', 'tous'] : ['tous']
  );
  let filteredMessages = $derived(
    gameStore.chatMessages.filter((m) => m.channel === activeChannel)
  );

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
          myPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
      graceTimer = '';
      return;
    }
    const elapsed = Math.floor((Date.now() - g.startedAt) / 1000);
    const remaining = Math.max(0, g.maxDuration - elapsed);
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    timer = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    if (gameStore.gracePeriodActive) {
      const graceRemaining = Math.max(0, g.gracePeriod - elapsed);
      const gm = Math.floor(graceRemaining / 60);
      const gs = graceRemaining % 60;
      graceTimer = `${gm.toString().padStart(2, '0')}:${gs.toString().padStart(2, '0')}`;
    } else {
      graceTimer = '';
    }
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

  function setZoneFromPosition() {
    if (!myPosition) return;
    sendWs({
      type: 'update_config',
      zone: {
        type: 'cercle',
        centre: { latitude: myPosition.latitude, longitude: myPosition.longitude },
        rayon: zoneRadius,
      },
    });
  }

  function updateZoneRadius(r: number) {
    zoneRadius = r;
    if (gameStore.game?.zone?.centre) {
      sendWs({
        type: 'update_config',
        zone: {
          type: 'cercle',
          centre: gameStore.game.zone.centre,
          rayon: r,
        },
      });
    }
  }

  function clearZone() {
    sendWs({ type: 'update_config', zone: undefined });
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    sendWs({ type: 'chat_message', channel: activeChannel, text });
    chatInput = '';
    setTimeout(() => chatEndRef?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function addObjective() {
    if (!objectiveTitle.trim()) return;
    sendWs({ type: 'add_objective', title: objectiveTitle.trim(), assignedTo: objectiveTarget });
    objectiveTitle = '';
  }

  function removeObjective(id: string) {
    sendWs({ type: 'remove_objective', objectiveId: id });
  }

  function completeObjective(id: string) {
    sendWs({ type: 'complete_objective', objectiveId: id });
  }

  function validateEvent() {
    if (!eventDesc.trim()) return;
    sendWs({ type: 'validate_event', description: eventDesc.trim() });
    eventDesc = '';
  }

  function exportPositionHistory() {
    if (!gameStore.positionHistory || !gameStore.game) return;
    const data = {
      gameCode: gameStore.game.code,
      startedAt: gameStore.game.startedAt,
      endedAt: Date.now(),
      tracks: gameStore.positionHistory,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manhunt-${gameStore.game.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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

      <div class="card">
        <h2>Zone de jeu</h2>
        {#if game.zone?.centre}
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            Centre : {game.zone.centre.latitude.toFixed(5)}, {game.zone.centre.longitude.toFixed(5)}
            — Rayon : {game.zone.rayon ?? 0} m
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <label>
              <span style="color: var(--text-muted); font-size: 0.85rem;">Rayon</span>
              <select value={String(game.zone.rayon ?? 500)} onchange={(e) => updateZoneRadius(Number((e.target as HTMLSelectElement).value))}>
                <option value="100">100 m</option>
                <option value="250">250 m</option>
                <option value="500">500 m</option>
                <option value="1000">1 km</option>
                <option value="2000">2 km</option>
                <option value="5000">5 km</option>
              </select>
            </label>
            <button class="btn-secondary" onclick={clearZone} style="font-size: 0.85rem;">
              Supprimer la zone
            </button>
          </div>
        {:else}
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">
            Aucune zone définie. Les joueurs peuvent aller où ils veulent.
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <label>
              <span style="color: var(--text-muted); font-size: 0.85rem;">Rayon</span>
              <select bind:value={zoneRadius}>
                <option value={100}>100 m</option>
                <option value={250}>250 m</option>
                <option value={500}>500 m</option>
                <option value={1000}>1 km</option>
                <option value={2000}>2 km</option>
                <option value={5000}>5 km</option>
              </select>
            </label>
            <button class="btn-primary" onclick={setZoneFromPosition} disabled={!myPosition} style="font-size: 0.85rem;">
              {myPosition ? 'Utiliser ma position comme centre' : 'GPS en cours...'}
            </button>
          </div>
        {/if}
      </div>

      <div class="card">
        <h2>Objectifs (optionnel)</h2>
        {#if game.objectives.length > 0}
          <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.75rem;">
            {#each game.objectives as obj}
              <div class="flex-between" style="padding: 0.4rem; border-radius: var(--radius); background: var(--bg); font-size: 0.85rem;">
                <div>
                  <span>{obj.title}</span>
                  <span class="badge" style="margin-left: 0.4rem; font-size: 0.65rem;">
                    {obj.assignedTo === 'tous' ? 'Tous' : obj.assignedTo === 'proies' ? 'Proies' : 'Chasseurs'}
                  </span>
                </div>
                <button class="btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.75rem; color: var(--accent);"
                  onclick={() => removeObjective(obj.id)}>✕</button>
              </div>
            {/each}
          </div>
        {/if}
        <div style="display: flex; gap: 0.5rem; align-items: end;">
          <div style="flex: 1;">
            <input type="text" placeholder="Nouvel objectif..." bind:value={objectiveTitle}
              onkeydown={(e) => { if (e.key === 'Enter') addObjective(); }}
              style="padding: 0.5rem; font-size: 0.85rem;" />
          </div>
          <select bind:value={objectiveTarget} style="width: auto; padding: 0.5rem; font-size: 0.85rem;">
            <option value="tous">Tous</option>
            <option value="proies">Proies</option>
            <option value="chasseurs">Chasseurs</option>
          </select>
          <button class="btn-primary" onclick={addObjective} style="padding: 0.5rem 0.75rem; font-size: 0.85rem;"
            disabled={!objectiveTitle.trim()}>+</button>
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
        <div style="font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums;">
          ⏳ {graceTimer}
        </div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">Délai de grâce — Les Proies se cachent !</div>
      </div>
    {/if}

    <GameMap
      hunterPositions={gameStore.hunterPositions}
      preyPositions={gameStore.preyPositions}
      {myPosition}
      mySessionId={sessionStore.data?.sessionId ?? ''}
      myRole={myPlayer?.role ?? 'CHASSEUR'}
      zone={game.zone}
      gracePeriodActive={gameStore.gracePeriodActive}
    />

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
        {#if myPlayer?.status === 'LIBRE'}
          <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
            <input type="text" placeholder="Signaler un événement..." bind:value={eventDesc}
              onkeydown={(e) => { if (e.key === 'Enter') validateEvent(); }}
              style="flex: 1; padding: 0.5rem; font-size: 0.85rem;" />
            <button class="btn-primary" onclick={validateEvent} disabled={!eventDesc.trim()}
              style="padding: 0.5rem 0.75rem; font-size: 0.85rem;">Valider</button>
          </div>
        {/if}
      </div>
    {/if}

    {#if game.objectives.length > 0}
      <div class="card">
        <h2>Objectifs</h2>
        {#each game.objectives.filter((o) => o.assignedTo === 'tous' || (o.assignedTo === 'proies' && myPlayer?.role === 'PROIE') || (o.assignedTo === 'chasseurs' && myPlayer?.role === 'CHASSEUR')) as obj}
          {@const done = obj.completedBy.includes(sessionStore.data?.sessionId ?? '')}
          <div class="flex-between" style="padding: 0.4rem 0; font-size: 0.9rem;">
            <span style:opacity={done ? 0.5 : 1} style:text-decoration={done ? 'line-through' : 'none'}>
              {obj.title}
            </span>
            {#if !done && myPlayer?.status === 'LIBRE'}
              <button class="btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;"
                onclick={() => completeObjective(obj.id)}>Fait</button>
            {:else if done}
              <span style="color: var(--success); font-size: 0.75rem;">✓</span>
            {/if}
          </div>
        {/each}
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

    <!-- CHAT -->
    <div class="card">
      <button type="button" class="flex-between" style="margin-bottom: 0.5rem; cursor: pointer; width: 100%; background: none; border: none; padding: 0; color: inherit;" onclick={() => chatOpen = !chatOpen}>
        <h2 style="margin-bottom: 0;">Chat</h2>
        <span style="color: var(--text-muted); font-size: 0.85rem;">{chatOpen ? '▲' : '▼'}</span>
      </button>
      {#if chatOpen}
        <div style="display: flex; gap: 0.4rem; margin-bottom: 0.5rem;">
          {#each visibleChannels as ch}
            <button class:btn-primary={activeChannel === ch} class:btn-secondary={activeChannel !== ch}
              style="padding: 0.3rem 0.6rem; font-size: 0.75rem; flex: 1;"
              onclick={() => activeChannel = ch}>
              {ch === 'tous' ? 'Tous' : ch === 'proies' ? 'Proies' : 'Chasseurs'}
            </button>
          {/each}
        </div>
        <div style="max-height: 200px; overflow-y: auto; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
          {#each filteredMessages as msg}
            <div style="font-size: 0.8rem;">
              <span style="color: var(--text-muted);">{formatTime(msg.timestamp)}</span>
              <span style="font-weight: 600;">{msg.pseudo}</span>
              <span>{msg.text}</span>
            </div>
          {/each}
          {#if filteredMessages.length === 0}
            <p style="color: var(--text-muted); font-size: 0.8rem; text-align: center;">Aucun message</p>
          {/if}
          <div bind:this={chatEndRef}></div>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <input type="text" placeholder="Message..." bind:value={chatInput}
            onkeydown={(e) => { if (e.key === 'Enter') sendChat(); }}
            style="flex: 1; padding: 0.5rem; font-size: 0.85rem;" />
          <button class="btn-primary" onclick={sendChat} disabled={!chatInput.trim()}
            style="padding: 0.5rem 0.75rem; font-size: 0.85rem;">Envoyer</button>
        </div>
      {/if}
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

      {#if game.events.length > 0}
        <div class="card">
          <h2>Événements</h2>
          {#each game.events as evt}
            <div style="padding: 0.25rem 0; font-size: 0.85rem;">
              <span style="color: var(--text-muted);">{formatTime(evt.timestamp)}</span>
              <span style="color: var(--prey); font-weight: 600;">{evt.pseudo}</span>
              <span>{evt.description}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if game.objectives.length > 0}
        <div class="card">
          <h2>Objectifs</h2>
          {#each game.objectives as obj}
            <div style="padding: 0.25rem 0; font-size: 0.9rem;">
              <span>{obj.title}</span>
              <span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 0.4rem;">
                ({obj.completedBy.length} complétion{obj.completedBy.length > 1 ? 's' : ''})
              </span>
            </div>
          {/each}
        </div>
      {/if}

      {#if gameStore.positionHistory}
        <button class="btn-secondary" style="margin-top: 0.5rem; width: 100%;" onclick={exportPositionHistory}>
          Exporter les trajets (JSON)
        </button>
      {/if}

      <button class="btn-primary" style="margin-top: 0.5rem; width: 100%;" onclick={() => { logout(); goto('/'); }}>
        Retour à l'accueil
      </button>
    </div>
  {/if}

  {#if error}
    <p class="error" style="margin-top: 1rem;">{error}</p>
  {/if}
</div>
