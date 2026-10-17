import type { FastifyInstance } from 'fastify';
import type {
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  JoinGameResponse,
  Game,
  Player,
} from '@manhunt/types';
import { games, generateCode, generateSessionId } from '../store.js';
import { gameSnapshot } from '../snapshot.js';
import { getWs, broadcastToAll } from '../broadcast.js';
import { playerSnapshot } from '../snapshot.js';

const MAX_PLAYERS = 20;

export async function gameRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateGameRequest }>('/api/games', async (req, reply) => {
    const { pseudo } = req.body;

    if (!pseudo || typeof pseudo !== 'string' || pseudo.trim().length === 0) {
      return reply.status(400).send({ error: 'pseudo is required' });
    }

    if (pseudo.trim().length > 20) {
      return reply.status(400).send({ error: 'pseudo must be 20 characters or less' });
    }

    const code = generateCode();
    const sessionId = generateSessionId();

    const player: Player = {
      sessionId,
      pseudo: pseudo.trim(),
      role: 'CHASSEUR',
      status: 'LIBRE',
      lastSeen: Date.now(),
    };

    const game: Game = {
      code,
      status: 'LOBBY',
      hostSessionId: sessionId,
      players: { [sessionId]: player },
      maxDuration: 30 * 60,
      gracePeriod: 60,
      preyPingInterval: 120,
      eliminations: [],
      objectives: [],
      positionHistory: {},
      chatMessages: [],
    };

    games.set(code, game);

    const response: CreateGameResponse = { code, sessionId };
    return reply.status(201).send(response);
  });

  app.post<{ Body: JoinGameRequest }>('/api/games/join', async (req, reply) => {
    const { code, pseudo } = req.body;

    if (!code || typeof code !== 'string') {
      return reply.status(400).send({ error: 'code is required' });
    }

    if (!pseudo || typeof pseudo !== 'string' || pseudo.trim().length === 0) {
      return reply.status(400).send({ error: 'pseudo is required' });
    }

    if (pseudo.trim().length > 20) {
      return reply.status(400).send({ error: 'pseudo must be 20 characters or less' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const game = games.get(normalizedCode);

    if (!game) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    const trimmedPseudo = pseudo.trim();

    if (game.status !== 'LOBBY') {
      // Rejoin a started game with the same pseudo (e.g. app closed, session lost).
      const existing = Object.values(game.players).find(
        (p) => p.pseudo.toLowerCase() === trimmedPseudo.toLowerCase()
      );
      if (!existing) {
        return reply.status(400).send({ error: 'Partie déjà lancée : utilise le même pseudo pour la rejoindre' });
      }
      if (getWs(existing.sessionId)) {
        return reply.status(400).send({ error: 'Ce joueur est déjà connecté' });
      }
      const response: JoinGameResponse = { sessionId: existing.sessionId, game: gameSnapshot(game) };
      return reply.status(200).send(response);
    }

    if (Object.keys(game.players).length >= MAX_PLAYERS) {
      return reply.status(400).send({ error: 'Game is full (max 20 players)' });
    }

    const pseudoTaken = Object.values(game.players).some(
      (p) => p.pseudo.toLowerCase() === trimmedPseudo.toLowerCase()
    );
    if (pseudoTaken) {
      return reply.status(400).send({ error: 'Pseudo already taken in this game' });
    }

    const sessionId = generateSessionId();

    const player: Player = {
      sessionId,
      pseudo: trimmedPseudo,
      role: 'CHASSEUR',
      status: 'LIBRE',
      lastSeen: Date.now(),
    };

    game.players[sessionId] = player;
    // Notify the lobby right away, without waiting for the newcomer's WebSocket.
    broadcastToAll(game, { type: 'player_joined', player: playerSnapshot(player) });

    const response: JoinGameResponse = {
      sessionId,
      game: gameSnapshot(game),
    };
    return reply.status(200).send(response);
  });

  app.get<{ Params: { code: string }; Querystring: { sessionId?: string } }>(
    '/api/games/:code',
    async (req, reply) => {
      const game = games.get(req.params.code.toUpperCase());

      if (!game) {
        return reply.status(404).send({ error: 'Game not found' });
      }

      const { sessionId } = req.query;
      if (sessionId && !game.players[sessionId]) {
        return reply.status(403).send({ error: 'Not a member of this game' });
      }

      return reply.send(gameSnapshot(game));
    }
  );
}
