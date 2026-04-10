import { useState, useEffect, useRef, useCallback } from "react";
import { getWebSocketUrl, apiStartServer, apiStopServer, apiRestartServer, apiSendCommand, setApiInstanceId } from "@/lib/api";
import { toast } from "sonner";

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";

export interface ServerStats {
  cpu: number;
  maxCpu: number;
  ram: number;
  maxRam: string;
  storage: number;
  maxStorage: string;
  players: number;
  maxPlayers: number;
  uptime: number;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "folder";
  size?: string;
  modified: string;
}

const DEFAULT_STATS: ServerStats = {
  cpu: 0, maxCpu: 200, ram: 0, maxRam: "2.04 GB",
  storage: 0, maxStorage: "10 GB", players: 0, maxPlayers: 20, uptime: 0,
};

export function useServerState(instanceId: string) {
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ServerStats>(DEFAULT_STATS);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  // WebSocket connection
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem("mchost_token");
    if (!token) return;

    setApiInstanceId(instanceId);
    const ws = new WebSocket(
      `${getWebSocketUrl()}?token=${encodeURIComponent(token)}&instance=${encodeURIComponent(instanceId)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setApiInstanceId(instanceId);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "status":
            setStatus(msg.data);
            break;
          case "logs":
            setLogs(msg.data);
            break;
          case "log":
            setLogs(prev => {
              const next = [...prev, msg.data];
              return next.length > 1000 ? next.slice(-800) : next;
            });
            break;
          case "stats":
            setStats(msg.data);
            break;
        }
      } catch (_e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectRef.current = setTimeout(connectWs, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [instanceId]);

  useEffect(() => {
    setApiInstanceId(instanceId);
    setStatus("stopped");
    setLogs([]);
    setStats(DEFAULT_STATS);
    setConnected(false);
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    connectWs();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [instanceId, connectWs]);

  const startServer = useCallback(async () => {
    setApiInstanceId(instanceId);
    const res = await apiStartServer();
    if (res.error) toast.error(res.error);
  }, [instanceId]);

  const stopServer = useCallback(async () => {
    setApiInstanceId(instanceId);
    const res = await apiStopServer();
    if (res.error) toast.error(res.error);
  }, [instanceId]);

  const restartServer = useCallback(async () => {
    setApiInstanceId(instanceId);
    const res = await apiRestartServer();
    if (res.error) toast.error(res.error);
  }, [instanceId]);

  const sendCommand = useCallback(async (cmd: string) => {
    setApiInstanceId(instanceId);
    const res = await apiSendCommand(cmd);
    if (res.error) toast.error(res.error);
  }, [instanceId]);

  return {
    status, stats, logs, connected,
    startServer, stopServer, restartServer, sendCommand,
  };
}
