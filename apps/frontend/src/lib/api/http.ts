import type {
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  JoinGameResponse,
  GameSnapshot,
  RuleSection,
} from '@manhunt/types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function createGame(pseudo: string): Promise<CreateGameResponse> {
  return post<CreateGameResponse>('/api/games', { pseudo } satisfies CreateGameRequest);
}

export function joinGame(code: string, pseudo: string): Promise<JoinGameResponse> {
  return post<JoinGameResponse>('/api/games/join', { code, pseudo } satisfies JoinGameRequest);
}

export function getGame(code: string, sessionId?: string): Promise<GameSnapshot> {
  const qs = sessionId ? `?sessionId=${sessionId}` : '';
  return get<GameSnapshot>(`/api/games/${code}${qs}`);
}

export function getRules(): Promise<RuleSection[]> {
  return get<RuleSection[]>('/api/rules');
}
