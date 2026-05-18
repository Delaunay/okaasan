import { useEffect, useRef } from 'react';
import { isStaticMode } from '../services/api';

export interface ServerEvent {
  type: string;
  [key: string]: any;
}

type EventHandler = (event: ServerEvent) => void;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

// ── Shared singleton WebSocket ──────────────────────────────

const listeners = new Set<EventHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_DELAY_MS;

function ensureConnected() {
  if (isStaticMode() || ws) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws`);

  socket.onopen = () => {
    reconnectDelay = RECONNECT_DELAY_MS;
  };

  socket.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as ServerEvent;
      listeners.forEach(fn => fn(event));
    } catch { /* ignore malformed */ }
  };

  socket.onclose = () => {
    ws = null;
    if (listeners.size === 0) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      ensureConnected();
    }, reconnectDelay);
  };

  socket.onerror = () => {
    socket.close();
  };

  ws = socket;
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ── Hook ────────────────────────────────────────────────────

export function useNotifications(onEvent: EventHandler) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (isStaticMode()) return;

    const handler: EventHandler = (event) => handlerRef.current(event);
    listeners.add(handler);
    ensureConnected();

    return () => {
      listeners.delete(handler);
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }, []);
}
