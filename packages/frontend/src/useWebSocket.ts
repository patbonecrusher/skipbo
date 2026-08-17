import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@skipbo/shared';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export function useWebSocket(wsUrl: string | null, onMessage: (msg: ServerMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!wsUrl) return;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    function connect() {
      socket = new WebSocket(wsUrl!);
      socketRef.current = socket;
      setStatus('connecting');

      socket.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      socket.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data) as ServerMessage);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        setStatus('closed');
        if (cancelled) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 10_000);
        reconnectTimer = setTimeout(connect, delay);
      };
      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [wsUrl]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  return { status, send };
}
