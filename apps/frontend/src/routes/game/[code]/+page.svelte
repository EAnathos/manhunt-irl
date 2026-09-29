<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { sessionStore, logout } from '$lib/stores/session.svelte';
  import { connectWs, sendWs, disconnectWs } from '$lib/api/ws';
  import { gameStore, initGameListeners, resetUnreadChat } from '$lib/stores/game.svelte';
  import type { Role, PlayerSnapshot, ChatChannel } from '@manhunt/types';
  import GameMap from '$lib/components/GameMap.svelte';
  import BottomSheet from '$lib/components/BottomSheet.svelte';
  import ChatDrawer from '$lib/components/ChatDrawer.svelte';

  let geoWatchId: number | null = null;
  let unsub: (() => void) | null = null;
  let error = $state('');
  let timer = $state('');
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let shuffling = $state(false);

  let myPosition = $state<{ latitude: number; longitude: number } | null>(null);
  let zoneRadius = $state(500);

  let chatOpen = $state(false);
  let activeChannel = $state<ChatChannel>('tous');
  let sheetOpen = $state(false);

  let objectiveTitle = $state('');
  let objectiveTarget = $state<'proies' | 'chasseurs' | 'tous'>('tous');

  let durationInput = $state('30min');
  let graceInput = $state('1min');
  let pingInput = $state('2min');
  let wakeLock: WakeLockSentinel | null = null;
  let musicAudio: HTMLAudioElement | null = null;
  let musicPlaying = $state(false);
  let musicVolume = $state(0.3);

  function parseDuration(input: string): number | null {
    const match = input.trim().match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|min|m|h|heure|heures?)$/i);
    if (!match) return null;
    const value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    if (unit === 's' || unit === 'sec') return Math.round(value);
    if (unit === 'm' || unit === 'min') return Math.round(value * 60);
    if (unit.startsWith('h')) return Math.round(value * 3600);
    return null;
  }

  function formatDurationInput(seconds: number): string {
    if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
    if (seconds >= 60) return `${Math.round(seconds / 60)}min`;
    return `${seconds}s`;
  }

  function applyConfig(field: 'maxDuration' | 'gracePeriod' | 'preyPingInterval', input: string) {
    const seconds = parseDuration(input);
    if (seconds && seconds > 0) {
      sendWs({ type: 'update_config', [field]: seconds });
    }
  }

  let graceTimer = $state('');

  let isHost = $derived(sessionStore.data?.sessionId === gameStore.game?.hostSessionId);
  let myPlayer = $derived(gameStore.game?.players.find((p: PlayerSnapshot) => p.sessionId === sessionStore.data?.sessionId));
  let visibleChannels = $derived<ChatChannel[]>(
    myPlayer?.role === 'CHASSEUR' ? ['chasseurs', 'tous'] : myPlayer?.role === 'PROIE' ? ['proies', 'tous'] : ['tous']
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

    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((wl) => { wakeLock = wl; }).catch(() => {});
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onDestroy(() => {
    disconnectWs();
    if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId);
    if (unsub) unsub();
    if (timerInterval) clearInterval(timerInterval);
    wakeLock?.release();
    stopMusic();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  function startMusic() {
    if (musicAudio) return;
    const audio = new Audio('/hunted.mp3');
    audio.loop = true;
    audio.volume = musicVolume;
    audio.play().catch(() => {});
    musicAudio = audio;
    musicPlaying = true;
  }

  function stopMusic() {
    if (musicAudio) {
      musicAudio.pause();
      musicAudio.src = '';
      musicAudio = null;
    }
    musicPlaying = false;
  }

  function toggleMusic() {
    if (musicPlaying) stopMusic();
    else startMusic();
  }

  function updateMusicVolume(v: number) {
    musicVolume = v;
    if (musicAudio) musicAudio.volume = v;
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((wl) => { wakeLock = wl; }).catch(() => {});
      }
      if (myPosition) {
        sendWs({
          type: 'position',
          latitude: myPosition.latitude,
          longitude: myPosition.longitude,
        });
      }
    }
  }

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
    const preyCount = Math.max(1, Math.floor(players.length / 2));
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

  let zoneDebounce: ReturnType<typeof setTimeout> | null = null;

  function updateZoneRadius(r: number) {
    zoneRadius = r;
    if (gameStore.game?.zone?.centre) {
      if (zoneDebounce) clearTimeout(zoneDebounce);
      zoneDebounce = setTimeout(() => {
        sendWs({
          type: 'update_config',
          zone: {
            type: 'cercle',
            centre: gameStore.game!.zone!.centre,
            rayon: r,
          },
        });
      }, 150);
    }
  }

  function clearZone() {
    sendWs({ type: 'update_config', zone: undefined });
  }

  function sendChat(text: string) {
    sendWs({ type: 'chat_message', channel: activeChannel, text });
  }

  $effect(() => {
    if (chatOpen) resetUnreadChat();
  });

  $effect(() => {
    const g = gameStore.game;
    if (!g) return;
    durationInput = formatDurationInput(g.maxDuration);
    graceInput = formatDurationInput(g.gracePeriod);
    pingInput = formatDurationInput(g.preyPingInterval);
  });

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
              {#if isHost}
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
            <input type="text" bind:value={durationInput} placeholder="ex: 30min, 1h, 45s"
              onblur={() => applyConfig('maxDuration', durationInput)}
              onkeydown={(e) => { if (e.key === 'Enter') applyConfig('maxDuration', durationInput); }}
              style="font-size: 0.9rem;" />
          </label>
          <label>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Délai de grâce</span>
            <input type="text" bind:value={graceInput} placeholder="ex: 1min, 30s, 5min"
              onblur={() => applyConfig('gracePeriod', graceInput)}
              onkeydown={(e) => { if (e.key === 'Enter') applyConfig('gracePeriod', graceInput); }}
              style="font-size: 0.9rem;" />
          </label>
          <label>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Intervalle ping Proies</span>
            <input type="text" bind:value={pingInput} placeholder="ex: 2min, 30s, 10min"
              onblur={() => applyConfig('preyPingInterval', pingInput)}
              onkeydown={(e) => { if (e.key === 'Enter') applyConfig('preyPingInterval', pingInput); }}
              style="font-size: 0.9rem;" />
          </label>
        </div>
      </div>

      <div class="card">
        <h2>Zone de jeu</h2>
        <GameMap
          hunterPositions={[]}
          preyPositions={[]}
          {myPosition}
          mySessionId={sessionStore.data?.sessionId ?? ''}
          myRole={'CHASSEUR'}
          zone={game.zone}
          gracePeriodActive={false}
        />
        {#if game.zone?.centre}
          <div style="margin-top: 0.75rem;">
            <div class="flex-between" style="margin-bottom: 0.5rem;">
              <span style="color: var(--text-muted); font-size: 0.85rem;">Rayon</span>
              <span style="font-weight: 700; font-size: 0.9rem;">{game.zone.rayon ?? 0} m</span>
            </div>
            <input type="range" min="50" max="5000" step="50" value={game.zone.rayon ?? 500}
              oninput={(e) => updateZoneRadius(Number((e.target as HTMLInputElement).value))}
              style="width: 100%; accent-color: var(--accent);" />
            <div class="flex-between" style="margin-top: 0.25rem;">
              <span style="color: var(--text-muted); font-size: 0.7rem;">50 m</span>
              <span style="color: var(--text-muted); font-size: 0.7rem;">5 km</span>
            </div>
          </div>
          <button class="btn-secondary" onclick={clearZone} style="font-size: 0.85rem; margin-top: 0.75rem; width: 100%;">
            Supprimer la zone
          </button>
        {:else}
          <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.75rem 0;">
            Aucune zone définie. Les joueurs peuvent aller où ils veulent.
          </p>
          <button class="btn-primary" onclick={setZoneFromPosition} disabled={!myPosition} style="font-size: 0.85rem; width: 100%;">
            {myPosition ? 'Définir la zone sur ma position' : 'GPS en cours...'}
          </button>
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
    {@const aliveHunters = game.players.filter((p: PlayerSnapshot) => p.role === 'CHASSEUR' && p.status === 'LIBRE').length}
    {@const alivePrey = game.players.filter((p: PlayerSnapshot) => p.role === 'PROIE' && p.status === 'LIBRE').length}
    {@const eliminated = game.players.filter((p: PlayerSnapshot) => p.status === 'ELIMINE').length}
    <!-- ACTIVE GAME — fullscreen map -->
    <GameMap
      hunterPositions={gameStore.hunterPositions}
      preyPositions={gameStore.preyPositions}
      {myPosition}
      mySessionId={sessionStore.data?.sessionId ?? ''}
      myRole={myPlayer?.role ?? 'CHASSEUR'}
      zone={game.zone}
      gracePeriodActive={gameStore.gracePeriodActive}
      fullscreen
    />

    <!-- Top overlay: role + timer -->
    <div class="game-overlay-top">
      <div class="overlay-role">
        <span class="badge" class:badge-hunter={myPlayer?.role === 'CHASSEUR'} class:badge-prey={myPlayer?.role === 'PROIE'}>
          {myPlayer?.role === 'CHASSEUR' ? 'Chasseur' : 'Proie'}
        </span>
      </div>
      {#if timer}
        <div class="overlay-timer">{timer}</div>
      {/if}
    </div>

    <!-- Grace period banner -->
    {#if gameStore.gracePeriodActive}
      <div class="grace-banner">
        <span class="grace-timer">{graceTimer}</span>
        <span class="grace-label">Délai de grâce</span>
      </div>
    {/if}

    <!-- Out of zone warning -->
    {#if gameStore.outOfZoneWarning != null}
      <div class="zone-warning" class:zone-critical={gameStore.outOfZoneWarning.phase === 'critical'}>
        {#if gameStore.outOfZoneWarning.phase === 'critical'}
          🚨 Position révélée ! Élimination dans {gameStore.outOfZoneWarning.secondsRemaining}s
        {:else}
          ⚠ Hors zone ! Retournez dans la zone ({gameStore.outOfZoneWarning.secondsRemaining}s)
        {/if}
      </div>
    {/if}

    <!-- Pending elimination overlay -->
    {#if gameStore.pendingElimination && myPlayer}
      {@const pending = gameStore.pendingElimination}
      <div class="elim-overlay">
        <div class="elim-card">
          <div class="elim-title">Élimination déclarée</div>
          <div class="elim-players">{pending.hunterPseudo} → {pending.preyPseudo}</div>
          {#if pending.preyId === sessionStore.data?.sessionId && pending.status === 'EN_ATTENTE'}
            <div class="elim-actions">
              <button class="btn-primary" style="flex: 1; background: var(--success);" onclick={() => confirmElim(pending.id)}>Confirmer</button>
              <button class="btn-primary" style="flex: 1;" onclick={() => contestElim(pending.id)}>Contester</button>
            </div>
          {/if}
          {#if isHost && pending.status === 'CONTESTEE'}
            <div class="elim-actions">
              <button class="btn-primary" style="flex: 1; background: var(--success);" onclick={() => arbitrate(pending.id, true)}>Valider</button>
              <button class="btn-primary" style="flex: 1;" onclick={() => arbitrate(pending.id, false)}>Rejeter</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Music toggle -->
    <button class="music-toggle" onclick={toggleMusic} aria-label={musicPlaying ? 'Couper la musique' : 'Jouer la musique'}>
      {#if musicPlaying}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.5 4.5 0 0 0 2.5-3.5zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8.5v2.09L16.41 13l.09-.08zM19 12a7 7 0 0 0-4-6.32v1.98A5 5 0 0 1 17 12l2 0zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A7 7 0 0 1 14 18.7v2.06A9 9 0 0 0 18.16 19L19.73 21 21 19.73 4.27 3zM12 4l-1.69 1.69L12 7.38V4z"/></svg>
      {/if}
    </button>
    {#if musicPlaying}
      <div class="volume-control">
        <input type="range" min="0" max="1" step="0.05" value={musicVolume}
          oninput={(e) => updateMusicVolume(Number((e.target as HTMLInputElement).value))}
          style="accent-color: var(--accent);" />
      </div>
    {/if}

    <!-- Chat drawer (right side) -->
    <ChatDrawer
      bind:open={chatOpen}
      messages={gameStore.chatMessages}
      {visibleChannels}
      {activeChannel}
      onChannelChange={(ch) => activeChannel = ch}
      onSend={sendChat}
      unreadCount={gameStore.unreadChatCount}
    />

    <!-- Bottom sheet -->
    <BottomSheet bind:open={sheetOpen}>
      {#snippet peekContent()}
        <div class="peek-bar">
          <div class="peek-title">Partie en cours</div>
          <div class="peek-stats">
            <span class="peek-stat" style="color: var(--hunter);">{aliveHunters} <small>chasseurs</small></span>
            <span class="peek-divider">|</span>
            <span class="peek-stat" style="color: var(--prey);">{alivePrey} <small>proies</small></span>
            {#if eliminated > 0}
              <span class="peek-divider">|</span>
              <span class="peek-stat" style="color: var(--text-muted);">{eliminated} <small>éliminés</small></span>
            {/if}
          </div>
        </div>
      {/snippet}

      <!-- Elimination actions (hunters only) -->
      {#if myPlayer?.role === 'CHASSEUR'}
        {@const freePrey = game.players.filter((p: PlayerSnapshot) => p.role === 'PROIE' && p.status === 'LIBRE')}
        {#if freePrey.length > 0}
          <div class="sheet-section">
            <h3 class="sheet-heading">Éliminer une Proie</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              {#each freePrey as prey}
                <button class="btn-secondary" style="padding: 10px 16px; font-size: 0.9rem;" onclick={() => declareElimination(prey.sessionId)}>
                  🎯 {prey.pseudo}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <div class="sheet-section" style="text-align: center;">
          <div style="font-size: 1.2rem; margin-bottom: 4px;">🏃 Reste en mouvement !</div>
          <div style="color: var(--text-muted); font-size: 0.85rem;">Ping toutes les {formatDuration(game.preyPingInterval)}</div>
        </div>
      {/if}

      <!-- Players list -->
      <div class="sheet-section">
        <h3 class="sheet-heading">Joueurs</h3>
        <div class="player-list">
          {#each game.players as player}
            <div class="player-row">
              <div class="player-info" style:opacity={player.status === 'ELIMINE' ? 0.4 : 1}>
                <span class="player-role-dot" style="background: {player.role === 'CHASSEUR' ? 'var(--hunter)' : 'var(--prey)'}"></span>
                <span>{player.pseudo}</span>
              </div>
              <div class="player-status">
                {#if player.status === 'ELIMINE'}
                  <span style="color: var(--text-muted); font-size: 0.75rem;">Éliminé</span>
                {:else if player.status === 'DECONNECTE'}
                  <span style="color: var(--warning); font-size: 0.75rem;">Déco</span>
                {:else}
                  <span style="color: var(--success); font-size: 0.75rem;">En jeu</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Objectives -->
      {#if game.objectives.length > 0}
        <div class="sheet-section">
          <h3 class="sheet-heading">Objectifs</h3>
          {#each game.objectives.filter((o) => o.assignedTo === 'tous' || (o.assignedTo === 'proies' && myPlayer?.role === 'PROIE') || (o.assignedTo === 'chasseurs' && myPlayer?.role === 'CHASSEUR')) as obj}
            {@const done = obj.completedBy.includes(sessionStore.data?.sessionId ?? '')}
            <div class="objective-row">
              <span style:opacity={done ? 0.5 : 1} style:text-decoration={done ? 'line-through' : 'none'}>
                {obj.title}
              </span>
              {#if !done && myPlayer?.status === 'LIBRE'}
                <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;"
                  onclick={() => completeObjective(obj.id)}>Fait</button>
              {:else if done}
                <span style="color: var(--success); font-size: 0.8rem;">✓</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    </BottomSheet>

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
