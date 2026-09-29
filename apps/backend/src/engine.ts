import { v4 as uuid } from 'uuid';
import type { Game, Elimination, WSServerMessage, ChatMessage, ChatChannel } from '@manhunt/types';
import { games } from './store.js';
import { isInsideZone } from './geo.js';
import { broadcastToAll, broadcastToHunters, broadcastToPreys, sendToPlayer } from './broadcast.js';
import { gameSnapshot, playerSnapshot } from './snapshot.js';

interface GameTimers {
  graceTimeout?: ReturnType<typeof setTimeout>;
  preyBroadcastInterval?: ReturnType<typeof setInterval>;
  hunterBroadcastInterval?: ReturnType<typeof setInterval>;
  gameEndTimeout?: ReturnType<typeof setTimeout>;
  outOfZoneChecks?: ReturnType<typeof setInterval>;
  criticalPreyBroadcast?: ReturnType<typeof setInterval>;
  purgeTimeout?: ReturnType<typeof setTimeout>;
}

const timers = new Map<string, GameTimers>();
const outOfZoneTimestamps = new Map<string, number>();
const ELIMINATION_TIMEOUT_MS = 60_000;
const RECONNECT_WINDOW_MS = 120_000;
const OUT_OF_ZONE_WARNING_MS = 15_000;
const OUT_OF_ZONE_CRITICAL_MS = 30_000;
const PURGE_DELAY_MS = 5 * 60_000;

function getTimers(code: string): GameTimers {
  let t = timers.get(code);
  if (!t) {
    t = {};
    timers.set(code, t);
  }
  return t;
}

function clearGameTimers(code: string) {
  const t = timers.get(code);
  if (!t) return;
  if (t.graceTimeout) clearTimeout(t.graceTimeout);
  if (t.preyBroadcastInterval) clearInterval(t.preyBroadcastInterval);
  if (t.hunterBroadcastInterval) clearInterval(t.hunterBroadcastInterval);
  if (t.gameEndTimeout) clearTimeout(t.gameEndTimeout);
  if (t.outOfZoneChecks) clearInterval(t.outOfZoneChecks);
  if (t.criticalPreyBroadcast) clearInterval(t.criticalPreyBroadcast);
  timers.delete(code);
}

export function startGame(game: Game) {
  game.status = 'EN_COURS';
  game.startedAt = Date.now();

  const preys = Object.values(game.players).filter((p) => p.role === 'PROIE');
  game.initialPreyCount = preys.length;
  game.initialPreyPingInterval = game.preyPingInterval;

  for (const p of Object.values(game.players)) {
    game.positionHistory[p.sessionId] = [];
  }

  const t = getTimers(game.code);

  broadcastToAll(game, { type: 'game_started', startedAt: game.startedAt });

  t.hunterBroadcastInterval = setInterval(() => {
    broadcastHunterPositions(game);
  }, 1_000);

  t.graceTimeout = setTimeout(() => {
    broadcastToAll(game, { type: 'grace_period_ended' });
    startPreyBroadcast(game);
    startOutOfZoneChecks(game);
  }, game.gracePeriod * 1000);

  t.gameEndTimeout = setTimeout(() => {
    endGame(game, 'time_up');
  }, game.maxDuration * 1000);
}

function startPreyBroadcast(game: Game) {
  const t = getTimers(game.code);
  broadcastPreyPositions(game);
  t.preyBroadcastInterval = setInterval(() => {
    broadcastPreyPositions(game);
  }, game.preyPingInterval * 1000);
}

function startOutOfZoneChecks(game: Game) {
  if (!game.zone) return;
  const t = getTimers(game.code);
  t.outOfZoneChecks = setInterval(() => {
    checkOutOfZone(game);
  }, 1_000);
}

function broadcastHunterPositions(game: Game) {
  if (game.status !== 'EN_COURS') return;
  const positions: WSServerMessage & { type: 'hunter_positions' } = {
    type: 'hunter_positions',
    positions: [],
  };
  for (const p of Object.values(game.players)) {
    if (p.role === 'CHASSEUR' && p.status === 'LIBRE' && p.position) {
      positions.positions.push({
        sessionId: p.sessionId,
        pseudo: p.pseudo,
        latitude: p.position.latitude,
        longitude: p.position.longitude,
        timestamp: p.position.timestamp,
      });
    }
  }
  broadcastToHunters(game, positions);
}

function broadcastPreyPositions(game: Game) {
  if (game.status !== 'EN_COURS') return;
  if (isInGracePeriod(game)) return;

  const positions: WSServerMessage & { type: 'prey_positions' } = {
    type: 'prey_positions',
    positions: [],
  };
  for (const p of Object.values(game.players)) {
    if (p.role === 'PROIE' && p.status === 'LIBRE' && p.position) {
      positions.positions.push({
        sessionId: p.sessionId,
        pseudo: p.pseudo,
        latitude: p.position.latitude,
        longitude: p.position.longitude,
        timestamp: p.position.timestamp,
      });
    }
  }
  broadcastToHunters(game, positions);
}

function isInGracePeriod(game: Game): boolean {
  if (!game.startedAt) return false;
  return Date.now() - game.startedAt < game.gracePeriod * 1000;
}

const criticalBroadcastActive = new Set<string>();

function checkOutOfZone(game: Game) {
  if (game.status !== 'EN_COURS' || !game.zone) return;
  const now = Date.now();
  const t = getTimers(game.code);

  for (const p of Object.values(game.players)) {
    if (p.role !== 'PROIE' || p.status !== 'LIBRE' || !p.position) continue;

    const key = `${game.code}:${p.sessionId}`;
    const inside = isInsideZone(p.position.latitude, p.position.longitude, game.zone);

    if (!inside) {
      const since = outOfZoneTimestamps.get(key);
      if (!since) {
        outOfZoneTimestamps.set(key, now);
        sendToPlayer(p.sessionId, { type: 'out_of_zone_warning', secondsRemaining: 30, phase: 'warning' });
      } else {
        const elapsed = now - since;
        if (elapsed >= OUT_OF_ZONE_CRITICAL_MS) {
          p.status = 'ELIMINE';
          outOfZoneTimestamps.delete(key);
          criticalBroadcastActive.delete(key);
          stopCriticalBroadcastIfDone(game);
          broadcastToAll(game, {
            type: 'player_eliminated',
            sessionId: p.sessionId,
            pseudo: p.pseudo,
          });
          checkAllPreyEliminated(game);
        } else if (elapsed >= OUT_OF_ZONE_WARNING_MS) {
          const remaining = Math.ceil((OUT_OF_ZONE_CRITICAL_MS - elapsed) / 1000);
          sendToPlayer(p.sessionId, { type: 'out_of_zone_warning', secondsRemaining: remaining, phase: 'critical' });
          if (!criticalBroadcastActive.has(key)) {
            criticalBroadcastActive.add(key);
            startCriticalPreyBroadcast(game, t);
          }
        } else {
          const remaining = Math.ceil((OUT_OF_ZONE_CRITICAL_MS - elapsed) / 1000);
          sendToPlayer(p.sessionId, { type: 'out_of_zone_warning', secondsRemaining: remaining, phase: 'warning' });
        }
      }
    } else {
      if (outOfZoneTimestamps.has(key)) {
        outOfZoneTimestamps.delete(key);
        criticalBroadcastActive.delete(key);
        stopCriticalBroadcastIfDone(game);
        sendToPlayer(p.sessionId, { type: 'out_of_zone_warning', secondsRemaining: 0, phase: 'warning' });
      }
    }
  }
}

function startCriticalPreyBroadcast(game: Game, t: GameTimers) {
  if (t.criticalPreyBroadcast) return;
  t.criticalPreyBroadcast = setInterval(() => {
    broadcastPreyPositions(game);
  }, 1_000);
}

function stopCriticalBroadcastIfDone(game: Game) {
  const hasAnyCritical = [...criticalBroadcastActive].some((k) => k.startsWith(game.code + ':'));
  if (!hasAnyCritical) {
    const t = getTimers(game.code);
    if (t.criticalPreyBroadcast) {
      clearInterval(t.criticalPreyBroadcast);
      t.criticalPreyBroadcast = undefined;
    }
  }
}

export function declareElimination(game: Game, hunterId: string, preyId: string): Elimination | null {
  const hunter = game.players[hunterId];
  const prey = game.players[preyId];

  if (!hunter || hunter.role !== 'CHASSEUR' || hunter.status !== 'LIBRE') return null;
  if (!prey || prey.role !== 'PROIE' || prey.status !== 'LIBRE') return null;

  const elimination: Elimination = {
    id: uuid(),
    hunterId,
    preyId,
    timestamp: Date.now(),
    status: 'EN_ATTENTE',
  };

  game.eliminations.push(elimination);

  broadcastToAll(game, {
    type: 'elimination_declared',
    elimination,
    hunterPseudo: hunter.pseudo,
    preyPseudo: prey.pseudo,
  });

  setTimeout(() => {
    const elim = game.eliminations.find((e) => e.id === elimination.id);
    if (elim && elim.status === 'EN_ATTENTE') {
      sendToPlayer(game.hostSessionId, {
        type: 'error',
        message: `Elimination timeout: ${prey.pseudo} did not respond. Host must arbitrate.`,
      });
    }
  }, ELIMINATION_TIMEOUT_MS);

  return elimination;
}

export function confirmElimination(game: Game, eliminationId: string, sessionId: string): boolean {
  const elim = game.eliminations.find((e) => e.id === eliminationId);
  if (!elim || elim.status !== 'EN_ATTENTE') return false;
  if (elim.preyId !== sessionId) return false;

  elim.status = 'CONFIRMEE';
  const prey = game.players[elim.preyId];
  if (prey) prey.status = 'ELIMINE';

  broadcastToAll(game, { type: 'elimination_confirmed', eliminationId });
  broadcastToAll(game, {
    type: 'player_eliminated',
    sessionId: elim.preyId,
    pseudo: prey?.pseudo ?? 'Unknown',
  });

  checkAllPreyEliminated(game);
  return true;
}

export function contestElimination(game: Game, eliminationId: string, sessionId: string): boolean {
  const elim = game.eliminations.find((e) => e.id === eliminationId);
  if (!elim || elim.status !== 'EN_ATTENTE') return false;
  if (elim.preyId !== sessionId) return false;

  elim.status = 'CONTESTEE';
  broadcastToAll(game, { type: 'elimination_contested', eliminationId });
  return true;
}

export function arbitrateElimination(game: Game, eliminationId: string, confirmed: boolean): boolean {
  const elim = game.eliminations.find((e) => e.id === eliminationId);
  if (!elim || (elim.status !== 'CONTESTEE' && elim.status !== 'EN_ATTENTE')) return false;

  if (confirmed) {
    elim.status = 'CONFIRMEE';
    const prey = game.players[elim.preyId];
    if (prey) prey.status = 'ELIMINE';

    broadcastToAll(game, { type: 'elimination_arbitrated', eliminationId, confirmed: true });
    broadcastToAll(game, {
      type: 'player_eliminated',
      sessionId: elim.preyId,
      pseudo: prey?.pseudo ?? 'Unknown',
    });
    checkAllPreyEliminated(game);
  } else {
    elim.status = 'CONTESTEE';
    broadcastToAll(game, { type: 'elimination_arbitrated', eliminationId, confirmed: false });
  }

  return true;
}

function updatePreyPingInterval(game: Game) {
  if (!game.initialPreyCount || !game.initialPreyPingInterval) return;
  const freePreys = Object.values(game.players).filter(
    (p) => p.role === 'PROIE' && p.status === 'LIBRE'
  );
  const newInterval = Math.max(
    3,
    Math.round(game.initialPreyPingInterval * (freePreys.length / game.initialPreyCount))
  );
  if (newInterval === game.preyPingInterval) return;
  game.preyPingInterval = newInterval;

  const t = getTimers(game.code);
  if (t.preyBroadcastInterval) {
    clearInterval(t.preyBroadcastInterval);
    t.preyBroadcastInterval = setInterval(() => {
      broadcastPreyPositions(game);
    }, game.preyPingInterval * 1000);
  }

  broadcastToAll(game, { type: 'ping_interval_updated', newInterval });
}

function checkAllPreyEliminated(game: Game) {
  const freePreys = Object.values(game.players).filter(
    (p) => p.role === 'PROIE' && p.status === 'LIBRE'
  );
  if (freePreys.length === 0) {
    endGame(game, 'all_eliminated');
  } else {
    updatePreyPingInterval(game);
  }
}

export function endGame(game: Game, reason: 'all_eliminated' | 'time_up') {
  if (game.status === 'TERMINEE') return;
  game.status = 'TERMINEE';

  const winners = Object.values(game.players)
    .filter((p) => {
      if (reason === 'time_up') return p.role === 'PROIE' && p.status === 'LIBRE';
      return p.role === 'CHASSEUR';
    })
    .map(playerSnapshot);

  broadcastToAll(game, { type: 'game_over', reason, winners });

  const tracks = Object.values(game.players).map((p) => ({
    sessionId: p.sessionId,
    pseudo: p.pseudo,
    role: p.role,
    positions: (game.positionHistory[p.sessionId] ?? []).map((pos) => ({
      latitude: pos.latitude,
      longitude: pos.longitude,
      timestamp: pos.timestamp,
    })),
  }));
  broadcastToAll(game, { type: 'position_history', tracks });

  clearGameTimers(game.code);
  schedulePurge(game.code);
}

export function dissolveGame(game: Game) {
  broadcastToAll(game, { type: 'game_dissolved' });
  clearGameTimers(game.code);
  games.delete(game.code);
}

function schedulePurge(code: string) {
  const t = getTimers(code);
  t.purgeTimeout = setTimeout(() => {
    games.delete(code);
    timers.delete(code);
  }, PURGE_DELAY_MS);
}

export function handleReconnect(game: Game, sessionId: string): boolean {
  const player = game.players[sessionId];
  if (!player) return false;

  if (player.status === 'DECONNECTE') {
    const elapsed = Date.now() - player.lastSeen;
    if (elapsed > RECONNECT_WINDOW_MS) return false;
    player.status = 'LIBRE';
  }

  player.lastSeen = Date.now();
  sendToPlayer(sessionId, { type: 'game_state', game: gameSnapshot(game) });

  if (game.chatMessages.length > 0) {
    const visible = game.chatMessages.filter((m) => {
      if (m.channel === 'tous') return true;
      if (m.channel === 'proies' && player.role === 'PROIE') return true;
      if (m.channel === 'chasseurs' && player.role === 'CHASSEUR') return true;
      return false;
    }).slice(-50);
    if (visible.length > 0) {
      sendToPlayer(sessionId, { type: 'chat_history', messages: visible });
    }
  }

  return true;
}

export function handleDisconnect(game: Game, sessionId: string) {
  const player = game.players[sessionId];
  if (!player) return;
  player.lastSeen = Date.now();
  if (game.status === 'EN_COURS' && player.status === 'LIBRE') {
    player.status = 'DECONNECTE';
    broadcastToAll(game, { type: 'player_left', sessionId });
  }
}

export function handleChatMessage(game: Game, sessionId: string, channel: ChatChannel, text: string): boolean {
  const player = game.players[sessionId];
  if (!player) return false;
  if (channel === 'proies' && player.role !== 'PROIE') return false;
  if (channel === 'chasseurs' && player.role !== 'CHASSEUR') return false;
  if (text.trim().length === 0 || text.length > 500) return false;

  const msg: ChatMessage = {
    id: uuid(),
    sessionId,
    pseudo: player.pseudo,
    channel,
    text: text.trim(),
    timestamp: Date.now(),
  };

  game.chatMessages.push(msg);
  if (game.chatMessages.length > 200) {
    game.chatMessages = game.chatMessages.slice(-200);
  }

  const wsMsg = { type: 'chat_message' as const, message: msg };
  if (channel === 'tous') {
    broadcastToAll(game, wsMsg);
  } else if (channel === 'proies') {
    broadcastToPreys(game, wsMsg);
  } else {
    broadcastToHunters(game, wsMsg);
  }

  return true;
}

export function recordPosition(game: Game, sessionId: string, latitude: number, longitude: number) {
  const pos = { latitude, longitude, timestamp: Date.now() };
  const player = game.players[sessionId];
  if (player) {
    player.position = pos;
    player.lastSeen = Date.now();
  }
  if (game.positionHistory[sessionId]) {
    game.positionHistory[sessionId].push(pos);
  }
}
