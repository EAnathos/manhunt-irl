import type { WSClientMessage, WSServerMessage } from '@manhunt/types';

const WS_BASE = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;

let socket: WebSocket | null = null;
let listeners: Array<(msg: WSServerMessage) => void> = [];

export function connectWs(code: string, sessionId: string) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }

  socket = new WebSocket(`${WS_BASE}/ws?code=${code}&sessionId=${sessionId}`);

  socket.onmessage = (event) => {
    try {
      const msg: WSServerMessage = JSON.parse(event.data);
      for (const fn of listeners) fn(msg);
    } catch { /* ignore malformed */ }
  };

  socket.onclose = () => {
    setTimeout(() => {
      if (socket?.readyState === WebSocket.CLOSED) {
        connectWs(code, sessionId);
      }
    }, 2000);
  };
}

export function sendWs(msg: WSClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function onWsMessage(fn: (msg: WSServerMessage) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function disconnectWs() {
  listeners = [];
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}
