import type { WebSocket } from 'ws';
import type { Game, WSServerMessage } from '@manhunt/types';

type WSConn = { ws: WebSocket | null };

const wsConnections = new Map<string, WSConn>();

export function setWs(sessionId: string, ws: WebSocket) {
  wsConnections.set(sessionId, { ws });
}

export function removeWs(sessionId: string) {
  wsConnections.delete(sessionId);
}

export function getWs(sessionId: string): WebSocket | null {
  return wsConnections.get(sessionId)?.ws ?? null;
}

function sendTo(sessionId: string, msg: WSServerMessage) {
  const conn = wsConnections.get(sessionId);
  if (conn?.ws && conn.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(msg));
  }
}

export function broadcastToHunters(game: Game, msg: WSServerMessage) {
  for (const p of Object.values(game.players)) {
    if (p.role === 'CHASSEUR' && p.status !== 'DECONNECTE') {
      sendTo(p.sessionId, msg);
    }
  }
}

export function broadcastToAll(game: Game, msg: WSServerMessage) {
  for (const p of Object.values(game.players)) {
    sendTo(p.sessionId, msg);
  }
}

export function sendToPlayer(sessionId: string, msg: WSServerMessage) {
  sendTo(sessionId, msg);
}
