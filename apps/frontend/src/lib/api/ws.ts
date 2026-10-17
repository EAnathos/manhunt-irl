import type { WSClientMessage, WSServerMessage } from '@manhunt/types';

const WS_BASE = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;

const HEARTBEAT_MS = 15_000;
const LIVENESS_TIMEOUT_MS = 5_000;

let socket: WebSocket | null = null;
let listeners: Array<(msg: WSServerMessage) => void> = [];
let target: { code: string; sessionId: string } | null = null;
let lastMessageAt = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWs(code: string, sessionId: string) {
  target = { code, sessionId };
  open();
  if (!heartbeat) heartbeat = setInterval(checkAlive, HEARTBEAT_MS);
}

function open() {
  if (!target) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (socket) {
    socket.onclose = null;
    socket.onmessage = null;
    socket.close();
  }

  const ws = new WebSocket(`${WS_BASE}/ws?code=${target.code}&sessionId=${target.sessionId}`);
  socket = ws;
  lastMessageAt = Date.now();

  ws.onmessage = (event) => {
    lastMessageAt = Date.now();
    try {
      const msg: WSServerMessage = JSON.parse(event.data);
      for (const fn of listeners) fn(msg);
    } catch { /* ignore malformed */ }
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    reconnectTimer = setTimeout(open, 2000);
  };
}

/**
 * Mobile browsers (iOS especially) silently kill sockets in the background:
 * readyState can stay OPEN while nothing arrives. Probe and reconnect if dead.
 */
function checkAlive() {
  if (!target || document.visibilityState !== 'visible') return;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (!socket || socket.readyState === WebSocket.CLOSED) open();
    return;
  }
  const probeAt = Date.now();
  socket.send(JSON.stringify({ type: 'ping' } satisfies WSClientMessage));
  setTimeout(() => {
    if (target && lastMessageAt < probeAt) open();
  }, LIVENESS_TIMEOUT_MS);
}

/** Call when the app comes back to the foreground: get a fresh state and check the socket. */
export function resyncWs() {
  if (!target) return;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'request_state' } satisfies WSClientMessage));
  }
  checkAlive();
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
  target = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}
