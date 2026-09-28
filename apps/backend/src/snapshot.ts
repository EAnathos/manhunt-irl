import type { Game, GameSnapshot, PlayerSnapshot } from '@manhunt/types';

export function playerSnapshot(p: { sessionId: string; pseudo: string; role: import('@manhunt/types').Role; status: import('@manhunt/types').PlayerStatus }): PlayerSnapshot {
  return {
    sessionId: p.sessionId,
    pseudo: p.pseudo,
    role: p.role,
    status: p.status,
  };
}

export function gameSnapshot(game: Game): GameSnapshot {
  return {
    code: game.code,
    status: game.status,
    hostSessionId: game.hostSessionId,
    players: Object.values(game.players).map(playerSnapshot),
    startedAt: game.startedAt,
    maxDuration: game.maxDuration,
    gracePeriod: game.gracePeriod,
    preyPingInterval: game.preyPingInterval,
    zone: game.zone,
    eliminations: game.eliminations,
    objectives: game.objectives,
  };
}
