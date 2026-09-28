// ─── Enums ───────────────────────────────────────────────

export type Role = 'CHASSEUR' | 'PROIE';
export type GameStatus = 'LOBBY' | 'EN_COURS' | 'TERMINEE';
export type PlayerStatus = 'LIBRE' | 'ELIMINE' | 'DECONNECTE';
export type EliminationStatus = 'EN_ATTENTE' | 'CONFIRMEE' | 'CONTESTEE';
export type ChatChannel = 'proies' | 'chasseurs' | 'tous';

// ─── Core models ─────────────────────────────────────────

export interface Position {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface Zone {
  type: 'cercle' | 'polygone';
  centre?: { latitude: number; longitude: number };
  rayon?: number;
  polygone?: { latitude: number; longitude: number }[];
}

export interface Player {
  sessionId: string;
  pseudo: string;
  role: Role;
  status: PlayerStatus;
  position?: Position;
  lastSeen: number;
}

export interface Elimination {
  id: string;
  hunterId: string;
  preyId: string;
  timestamp: number;
  status: EliminationStatus;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  pseudo: string;
  channel: ChatChannel;
  text: string;
  timestamp: number;
}

export interface Objective {
  id: string;
  title: string;
  assignedTo: 'proies' | 'chasseurs' | 'tous';
  completedBy: string[];
}

export interface Game {
  code: string;
  status: GameStatus;
  hostSessionId: string;
  players: Record<string, Player>;
  startedAt?: number;
  maxDuration: number;
  gracePeriod: number;
  preyPingInterval: number;
  zone?: Zone;
  eliminations: Elimination[];
  objectives: Objective[];
  positionHistory: Record<string, Position[]>;
  chatMessages: ChatMessage[];
  initialPreyCount?: number;
  initialPreyPingInterval?: number;
}

// ─── HTTP payloads ───────────────────────────────────────

export interface CreateGameRequest {
  pseudo: string;
}

export interface CreateGameResponse {
  code: string;
  sessionId: string;
}

export interface JoinGameRequest {
  code: string;
  pseudo: string;
}

export interface JoinGameResponse {
  sessionId: string;
  game: GameSnapshot;
}

export interface GameSnapshot {
  code: string;
  status: GameStatus;
  hostSessionId: string;
  players: PlayerSnapshot[];
  startedAt?: number;
  maxDuration: number;
  gracePeriod: number;
  preyPingInterval: number;
  zone?: Zone;
  eliminations: Elimination[];
  objectives: Objective[];
}

export interface PlayerSnapshot {
  sessionId: string;
  pseudo: string;
  role: Role;
  status: PlayerStatus;
}

export interface RuleSection {
  title: string;
  content: string;
}

// ─── WebSocket messages ──────────────────────────────────

export type WSClientMessage =
  | { type: 'position'; latitude: number; longitude: number }
  | { type: 'declare_elimination'; preySessionId: string }
  | { type: 'confirm_elimination'; eliminationId: string }
  | { type: 'contest_elimination'; eliminationId: string }
  | { type: 'arbitrate_elimination'; eliminationId: string; confirmed: boolean }
  | { type: 'assign_role'; targetSessionId: string; role: Role }
  | { type: 'update_config'; maxDuration?: number; gracePeriod?: number; preyPingInterval?: number; zone?: Zone }
  | { type: 'randomize_roles'; preyCount: number }
  | { type: 'start_game' }
  | { type: 'dissolve_game' }
  | { type: 'chat_message'; channel: ChatChannel; text: string }
  | { type: 'add_objective'; title: string; assignedTo: 'proies' | 'chasseurs' | 'tous' }
  | { type: 'remove_objective'; objectiveId: string }
  | { type: 'complete_objective'; objectiveId: string };

export type WSServerMessage =
  | { type: 'game_state'; game: GameSnapshot }
  | { type: 'player_joined'; player: PlayerSnapshot }
  | { type: 'player_left'; sessionId: string }
  | { type: 'role_assigned'; sessionId: string; role: Role }
  | { type: 'roles_randomized'; players: Array<{ sessionId: string; role: Role }> }
  | { type: 'config_updated'; maxDuration: number; gracePeriod: number; preyPingInterval: number; zone?: Zone }
  | { type: 'game_started'; startedAt: number }
  | { type: 'hunter_positions'; positions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number; timestamp: number }> }
  | { type: 'prey_positions'; positions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number; timestamp: number }> }
  | { type: 'elimination_declared'; elimination: Elimination; hunterPseudo: string; preyPseudo: string }
  | { type: 'elimination_confirmed'; eliminationId: string }
  | { type: 'elimination_contested'; eliminationId: string }
  | { type: 'elimination_arbitrated'; eliminationId: string; confirmed: boolean }
  | { type: 'player_eliminated'; sessionId: string; pseudo: string }
  | { type: 'out_of_zone_warning'; secondsRemaining: number }
  | { type: 'game_over'; reason: 'all_eliminated' | 'time_up'; winners: PlayerSnapshot[] }
  | { type: 'game_dissolved' }
  | { type: 'error'; message: string }
  | { type: 'grace_period_ended' }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'chat_history'; messages: ChatMessage[] }
  | { type: 'ping_interval_updated'; newInterval: number }
  | { type: 'position_history'; tracks: Array<{ sessionId: string; pseudo: string; role: Role; positions: Array<{ latitude: number; longitude: number; timestamp: number }> }> }
  | { type: 'objective_added'; objective: Objective }
  | { type: 'objective_removed'; objectiveId: string }
  | { type: 'objective_completed'; objectiveId: string; sessionId: string; pseudo: string };
