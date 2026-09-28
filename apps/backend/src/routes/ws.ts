import type { FastifyInstance } from 'fastify';
import type { WSClientMessage, Role, Zone } from '@manhunt/types';
import { games } from '../store.js';
import { setWs, removeWs } from '../broadcast.js';
import { broadcastToAll, sendToPlayer } from '../broadcast.js';
import { gameSnapshot, playerSnapshot } from '../snapshot.js';
import {
  startGame,
  declareElimination,
  confirmElimination,
  contestElimination,
  arbitrateElimination,
  dissolveGame,
  handleDisconnect,
  handleReconnect,
} from '../engine.js';

export async function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code')?.toUpperCase();
    const sessionId = url.searchParams.get('sessionId');

    if (!code || !sessionId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing code or sessionId' }));
      socket.close();
      return;
    }

    const game = games.get(code);
    if (!game) {
      socket.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
      socket.close();
      return;
    }

    const player = game.players[sessionId];
    if (!player) {
      socket.send(JSON.stringify({ type: 'error', message: 'Not a member of this game' }));
      socket.close();
      return;
    }

    setWs(sessionId, socket);
    player.lastSeen = Date.now();

    if (player.status === 'DECONNECTE') {
      handleReconnect(game, sessionId);
    } else {
      sendToPlayer(sessionId, { type: 'game_state', game: gameSnapshot(game) });
    }

    if (game.status === 'LOBBY') {
      broadcastToAll(game, { type: 'player_joined', player: playerSnapshot(player) });
    }

    socket.on('message', (raw: Buffer) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendToPlayer(sessionId, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      handleMessage(game, sessionId, msg);
    });

    socket.on('close', () => {
      removeWs(sessionId);
      handleDisconnect(game, sessionId);
    });
  });
}

function handleMessage(game: ReturnType<typeof games.get> & object, sessionId: string, msg: WSClientMessage) {
  const player = game.players[sessionId];
  if (!player) return;

  switch (msg.type) {
    case 'position': {
      if (game.status !== 'EN_COURS') return;
      if (player.status !== 'LIBRE') return;
      player.position = {
        latitude: msg.latitude,
        longitude: msg.longitude,
        timestamp: Date.now(),
      };
      player.lastSeen = Date.now();
      break;
    }

    case 'start_game': {
      if (sessionId !== game.hostSessionId) {
        sendToPlayer(sessionId, { type: 'error', message: 'Only the host can start the game' });
        return;
      }
      if (game.status !== 'LOBBY') {
        sendToPlayer(sessionId, { type: 'error', message: 'Game is not in lobby' });
        return;
      }
      const players = Object.values(game.players);
      if (players.length < 2) {
        sendToPlayer(sessionId, { type: 'error', message: 'Need at least 2 players' });
        return;
      }
      const hasHunter = players.some((p) => p.role === 'CHASSEUR');
      const hasPrey = players.some((p) => p.role === 'PROIE');
      if (!hasHunter || !hasPrey) {
        sendToPlayer(sessionId, { type: 'error', message: 'Need at least 1 hunter and 1 prey' });
        return;
      }
      startGame(game);
      break;
    }

    case 'assign_role': {
      if (sessionId !== game.hostSessionId) {
        sendToPlayer(sessionId, { type: 'error', message: 'Only the host can assign roles' });
        return;
      }
      if (game.status !== 'LOBBY') return;
      const target = game.players[msg.targetSessionId];
      if (!target) return;
      target.role = msg.role;
      broadcastToAll(game, {
        type: 'role_assigned',
        sessionId: msg.targetSessionId,
        role: msg.role,
      });
      break;
    }

    case 'update_config': {
      if (sessionId !== game.hostSessionId) {
        sendToPlayer(sessionId, { type: 'error', message: 'Only the host can update config' });
        return;
      }
      if (game.status !== 'LOBBY') return;
      if (msg.maxDuration != null && msg.maxDuration > 0) {
        game.maxDuration = msg.maxDuration;
      }
      if (msg.gracePeriod != null && msg.gracePeriod >= 0) {
        game.gracePeriod = msg.gracePeriod;
      }
      if (msg.preyPingInterval != null) {
        game.preyPingInterval = Math.max(3, Math.min(1200, msg.preyPingInterval));
      }
      if (msg.zone) {
        game.zone = msg.zone;
      }
      broadcastToAll(game, {
        type: 'config_updated',
        maxDuration: game.maxDuration,
        gracePeriod: game.gracePeriod,
        preyPingInterval: game.preyPingInterval,
        zone: game.zone,
      });
      break;
    }

    case 'declare_elimination': {
      if (game.status !== 'EN_COURS') return;
      const result = declareElimination(game, sessionId, msg.preySessionId);
      if (!result) {
        sendToPlayer(sessionId, { type: 'error', message: 'Cannot declare elimination' });
      }
      break;
    }

    case 'confirm_elimination': {
      if (!confirmElimination(game, msg.eliminationId, sessionId)) {
        sendToPlayer(sessionId, { type: 'error', message: 'Cannot confirm elimination' });
      }
      break;
    }

    case 'contest_elimination': {
      if (!contestElimination(game, msg.eliminationId, sessionId)) {
        sendToPlayer(sessionId, { type: 'error', message: 'Cannot contest elimination' });
      }
      break;
    }

    case 'arbitrate_elimination': {
      if (sessionId !== game.hostSessionId) {
        sendToPlayer(sessionId, { type: 'error', message: 'Only the host can arbitrate' });
        return;
      }
      if (!arbitrateElimination(game, msg.eliminationId, msg.confirmed)) {
        sendToPlayer(sessionId, { type: 'error', message: 'Cannot arbitrate elimination' });
      }
      break;
    }

    case 'dissolve_game': {
      if (sessionId !== game.hostSessionId) {
        sendToPlayer(sessionId, { type: 'error', message: 'Only the host can dissolve' });
        return;
      }
      dissolveGame(game);
      break;
    }
  }
}
