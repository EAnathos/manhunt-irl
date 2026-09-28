import type { GameSnapshot, WSServerMessage, PlayerSnapshot, Elimination, ChatMessage, Role } from '@manhunt/types';
import { onWsMessage } from '../api/ws';

export const gameStore = $state<{
  game: GameSnapshot | null;
  hunterPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number; timestamp: number }>;
  preyPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number; timestamp: number }>;
  pendingElimination: (Elimination & { hunterPseudo: string; preyPseudo: string }) | null;
  gameOver: { reason: string; winners: PlayerSnapshot[] } | null;
  gracePeriodActive: boolean;
  outOfZoneWarning: number | null;
  chatMessages: ChatMessage[];
  positionHistory: Array<{ sessionId: string; pseudo: string; role: Role; positions: Array<{ latitude: number; longitude: number; timestamp: number }> }> | null;
}>({
  game: null,
  hunterPositions: [],
  preyPositions: [],
  pendingElimination: null,
  gameOver: null,
  gracePeriodActive: false,
  outOfZoneWarning: null,
  chatMessages: [],
  positionHistory: null,
});

export function initGameListeners() {
  return onWsMessage((msg: WSServerMessage) => {
    switch (msg.type) {
      case 'game_state':
        gameStore.game = msg.game;
        break;

      case 'player_joined':
        if (gameStore.game) {
          const exists = gameStore.game.players.some((p) => p.sessionId === msg.player.sessionId);
          if (!exists) gameStore.game.players = [...gameStore.game.players, msg.player];
        }
        break;

      case 'player_left':
        if (gameStore.game) {
          gameStore.game.players = gameStore.game.players.map((p) =>
            p.sessionId === msg.sessionId ? { ...p, status: 'DECONNECTE' as const } : p,
          );
        }
        break;

      case 'role_assigned':
        if (gameStore.game) {
          gameStore.game.players = gameStore.game.players.map((p) =>
            p.sessionId === msg.sessionId ? { ...p, role: msg.role } : p,
          );
        }
        break;

      case 'roles_randomized':
        if (gameStore.game) {
          gameStore.game.players = gameStore.game.players.map((p) => {
            const assignment = msg.players.find((a: { sessionId: string }) => a.sessionId === p.sessionId);
            return assignment ? { ...p, role: assignment.role } : p;
          });
        }
        break;

      case 'config_updated':
        if (gameStore.game) {
          gameStore.game.maxDuration = msg.maxDuration;
          gameStore.game.gracePeriod = msg.gracePeriod;
          gameStore.game.preyPingInterval = msg.preyPingInterval;
          gameStore.game.zone = msg.zone;
        }
        break;

      case 'game_started':
        gameStore.gracePeriodActive = true;
        if (gameStore.game) {
          gameStore.game.status = 'EN_COURS';
          gameStore.game.startedAt = msg.startedAt;
        }
        break;

      case 'grace_period_ended':
        gameStore.gracePeriodActive = false;
        break;

      case 'hunter_positions':
        gameStore.hunterPositions = msg.positions;
        break;

      case 'prey_positions':
        gameStore.preyPositions = msg.positions;
        break;

      case 'elimination_declared':
        gameStore.pendingElimination = {
          ...msg.elimination,
          hunterPseudo: msg.hunterPseudo,
          preyPseudo: msg.preyPseudo,
        };
        break;

      case 'elimination_confirmed':
      case 'elimination_contested':
      case 'elimination_arbitrated':
        gameStore.pendingElimination = null;
        break;

      case 'player_eliminated':
        if (gameStore.game) {
          gameStore.game.players = gameStore.game.players.map((p) =>
            p.sessionId === msg.sessionId ? { ...p, status: 'ELIMINE' as const } : p,
          );
        }
        break;

      case 'out_of_zone_warning':
        gameStore.outOfZoneWarning = msg.secondsRemaining;
        break;

      case 'game_over':
        gameStore.gameOver = { reason: msg.reason, winners: msg.winners };
        if (gameStore.game) {
          gameStore.game.status = 'TERMINEE';
        }
        break;

      case 'game_dissolved':
        gameStore.game = null;
        break;

      case 'chat_message':
        gameStore.chatMessages = [...gameStore.chatMessages, msg.message];
        break;

      case 'chat_history':
        gameStore.chatMessages = msg.messages;
        break;

      case 'ping_interval_updated':
        if (gameStore.game) {
          gameStore.game.preyPingInterval = msg.newInterval;
        }
        break;

      case 'position_history':
        gameStore.positionHistory = msg.tracks;
        break;

      case 'objective_added':
        if (gameStore.game) {
          gameStore.game.objectives = [...gameStore.game.objectives, msg.objective];
        }
        break;

      case 'objective_removed':
        if (gameStore.game) {
          gameStore.game.objectives = gameStore.game.objectives.filter((o) => o.id !== msg.objectiveId);
        }
        break;

      case 'objective_completed':
        if (gameStore.game) {
          gameStore.game.objectives = gameStore.game.objectives.map((o) =>
            o.id === msg.objectiveId ? { ...o, completedBy: [...o.completedBy, msg.sessionId] } : o,
          );
        }
        break;

    }
  });
}
