import { useCallback, useEffect, useRef, useState } from "react";
import type { WsMessage, WsPayload } from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePayload(raw: unknown): WsPayload | string {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (isObject(parsed)) return parsed as WsPayload;
    } catch {
      return raw;
    }
    return raw;
  }

  if (isObject(raw)) return raw as WsPayload;
  return String(raw);
}

type WsStatus = "disconnected" | "connecting" | "connected" | "error";

type UseWsStreamOptions = {
  autoConnect?: boolean;
  onPayload?: (payload: WsPayload) => void;
};

export function useWsStream(wsUrl: string, options: UseWsStreamOptions = {}) {
  const { autoConnect = true, onPayload } = options;
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [history, setHistory] = useState<WsMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const payloadRef = useRef<typeof onPayload>(onPayload);

  useEffect(() => {
    payloadRef.current = onPayload;
  }, [onPayload]);

  const handleMessage = useCallback((raw: unknown) => {
    const payload = normalizePayload(raw);
    const item: WsMessage = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toLocaleTimeString(),
      payload,
    };

    setLastMessage(item);
    setHistory((prev) => [item, ...prev].slice(0, 50));

    if (typeof payload !== "string") {
      payloadRef.current?.(payload);
    }
  }, []);

  const connect = useCallback(() => {
    if (!wsUrl) return;
    if (wsRef.current) wsRef.current.close();

    setStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.text().then((text) => handleMessage(text));
        return;
      }
      handleMessage(event.data);
    };
  }, [handleMessage, wsUrl]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
      return () => disconnect();
    }
    return undefined;
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    lastMessage,
    history,
    connect,
    disconnect,
  };
}
