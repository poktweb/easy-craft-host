import { useState, useCallback, useRef, useEffect } from "react";

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
  uptime: number; // seconds
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

const INITIAL_LOGS: LogEntry[] = [
  { id: 1, timestamp: "00:00:01", level: "INFO", message: "Starting minecraft server version 1.20.4" },
  { id: 2, timestamp: "00:00:02", level: "INFO", message: "Loading properties" },
  { id: 3, timestamp: "00:00:02", level: "INFO", message: "Default game type: SURVIVAL" },
  { id: 4, timestamp: "00:00:03", level: "INFO", message: "Preparing level \"world\"" },
  { id: 5, timestamp: "00:00:05", level: "INFO", message: "Preparing start region for dimension minecraft:overworld" },
  { id: 6, timestamp: "00:00:08", level: "INFO", message: "Preparing spawn area: 84%" },
  { id: 7, timestamp: "00:00:09", level: "INFO", message: "Done (8.234s)! For help, type \"help\"" },
  { id: 8, timestamp: "00:00:09", level: "INFO", message: "Server is running on *:25565" },
];

const RUNTIME_MESSAGES = [
  { level: "INFO" as const, message: "Sunyziinho issued server command: /shop" },
  { level: "INFO" as const, message: "Bl4K0NE joined the game" },
  { level: "WARN" as const, message: "Bl4K0NE moved too quickly! -1063.546,9.0,2663.886" },
  { level: "INFO" as const, message: "Bl4K0NE issued server command: /home base" },
  { level: "INFO" as const, message: "Sunyziinho issued server command: /eco give Sunyziinho 1000" },
  { level: "INFO" as const, message: "Villager Villager['Mason'/41901] died, message: 'Mason was slain by Zombie'" },
  { level: "INFO" as const, message: "[VotingPlugin] Login: Bl4K0NE (49a7a0d5-a110-3c2c-990b-1612c9bdcc22)" },
  { level: "INFO" as const, message: "Bl4K0NE issued server command: /gamerule keep_inventory true" },
  { level: "WARN" as const, message: "Can't keep up! Is the server overloaded? Running 2501ms behind" },
  { level: "INFO" as const, message: "Sunyziinho issued server command: /sellgui" },
];

const INITIAL_FILES: FileEntry[] = [
  { name: ".cache", type: "folder", modified: "06 abr 2026 9:51PM" },
  { name: "bundler", type: "folder", modified: "06 abr 2026 9:51PM" },
  { name: "libraries", type: "folder", modified: "06 abr 2026 11:51PM" },
  { name: "logs", type: "folder", modified: "há cerca de 2 horas" },
  { name: "plugins", type: "folder", modified: "06 abr 2026 11:58PM" },
  { name: "world", type: "folder", modified: "há 2 minutos" },
  { name: "world_nether", type: "folder", modified: "há 5 minutos" },
  { name: "world_the_end", type: "folder", modified: "há 10 minutos" },
  { name: "server.jar", type: "file", size: "45.2 MB", modified: "06 abr 2026 9:00PM" },
  { name: "server.properties", type: "file", size: "1.2 KB", modified: "06 abr 2026 11:00PM" },
  { name: "bukkit.yml", type: "file", size: "4.1 KB", modified: "06 abr 2026 9:51PM" },
  { name: "spigot.yml", type: "file", size: "3.8 KB", modified: "06 abr 2026 9:51PM" },
  { name: "eula.txt", type: "file", size: "0.1 KB", modified: "06 abr 2026 9:00PM" },
  { name: "banned-players.json", type: "file", size: "0.0 KB", modified: "06 abr 2026 9:51PM" },
  { name: "ops.json", type: "file", size: "0.3 KB", modified: "06 abr 2026 10:00PM" },
  { name: "whitelist.json", type: "file", size: "0.0 KB", modified: "06 abr 2026 9:51PM" },
];

const SERVER_PROPERTIES = `#Minecraft server properties
#Thu Apr 06 21:00:00 BRT 2026
enable-jmx-monitoring=false
rcon.port=25575
level-seed=
gamemode=survival
enable-command-block=false
enable-query=false
generator-settings={}
enforce-secure-profile=true
level-name=world
motd=\\u00A76\\u00A7l Servidor SMP+ \\u00A7r\\u00A7f- \\u00A7aBem-vindo!
query.port=25565
pvp=true
generate-structures=true
max-chained-neighbor-updates=1000000
difficulty=hard
network-compression-threshold=256
max-tick-time=60000
require-resource-pack=false
max-players=20
use-native-transport=true
online-mode=true
enable-status=true
allow-flight=false
view-distance=10
server-ip=
allow-nether=true
server-port=25565
spawn-npcs=true
spawn-animals=true
spawn-monsters=true
white-list=false
`;

export function useServerState() {
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ServerStats>({
    cpu: 0, maxCpu: 200, ram: 0, maxRam: "2.04 GB",
    storage: 846.53, maxStorage: "10 GB", players: 0, maxPlayers: 20, uptime: 0,
  });
  const [files] = useState<FileEntry[]>(INITIAL_FILES);
  const [currentPath, setCurrentPath] = useState<string[]>(["HOME", "CONTAINER"]);
  const logIdRef = useRef(100);
  const intervalsRef = useRef<number[]>([]);

  const clearIntervals = useCallback(() => {
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
  }, []);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLogs(prev => [...prev, { id: logIdRef.current++, timestamp: ts, level, message }]);
  }, []);

  const startServer = useCallback(() => {
    if (status !== "stopped") return;
    setStatus("starting");
    setLogs([]);

    let i = 0;
    const startInterval = setInterval(() => {
      if (i < INITIAL_LOGS.length) {
        setLogs(prev => [...prev, { ...INITIAL_LOGS[i], id: logIdRef.current++ }]);
        i++;
      } else {
        clearInterval(startInterval);
        setStatus("running");
        setStats(prev => ({ ...prev, cpu: 15, ram: 2.04, players: 2, uptime: 0 }));

        const uptimeInterval = window.setInterval(() => {
          setStats(prev => ({ ...prev, uptime: prev.uptime + 1 }));
        }, 1000);
        intervalsRef.current.push(uptimeInterval);

        const statsInterval = window.setInterval(() => {
          setStats(prev => ({
            ...prev,
            cpu: Math.max(5, Math.min(prev.maxCpu, prev.cpu + (Math.random() - 0.5) * 10)),
            ram: Math.max(0.5, Math.min(2.04, prev.ram + (Math.random() - 0.5) * 0.1)),
          }));
        }, 3000);
        intervalsRef.current.push(statsInterval);

        const logInterval = window.setInterval(() => {
          const msg = RUNTIME_MESSAGES[Math.floor(Math.random() * RUNTIME_MESSAGES.length)];
          addLog(msg.level, msg.message);
        }, 5000 + Math.random() * 5000);
        intervalsRef.current.push(logInterval);
      }
    }, 400);
    intervalsRef.current.push(startInterval);
  }, [status, addLog]);

  const stopServer = useCallback(() => {
    if (status !== "running") return;
    setStatus("stopping");
    clearIntervals();
    addLog("INFO", "Stopping the server");
    addLog("INFO", "Saving players...");
    addLog("INFO", "Saving worlds...");
    setTimeout(() => {
      addLog("INFO", "Server stopped.");
      setStatus("stopped");
      setStats(prev => ({ ...prev, cpu: 0, ram: 0, players: 0, uptime: 0 }));
    }, 2000);
  }, [status, addLog, clearIntervals]);

  const restartServer = useCallback(() => {
    if (status !== "running") return;
    clearIntervals();
    setStatus("stopping");
    addLog("INFO", "Restarting server...");
    setTimeout(() => {
      setStatus("stopped");
      setStats(prev => ({ ...prev, cpu: 0, ram: 0, players: 0, uptime: 0 }));
      setTimeout(() => startServer(), 500);
    }, 2000);
  }, [status, addLog, clearIntervals, startServer]);

  const sendCommand = useCallback((cmd: string) => {
    if (status !== "running") return;
    addLog("INFO", `> ${cmd}`);
    // Simulated responses
    if (cmd.startsWith("/say ")) {
      addLog("INFO", `[Server] ${cmd.slice(5)}`);
    } else if (cmd === "/list") {
      addLog("INFO", "There are 2/20 players online: Sunyziinho, Bl4K0NE");
    } else if (cmd === "/stop") {
      stopServer();
    } else if (cmd.startsWith("/op ")) {
      addLog("INFO", `Made ${cmd.slice(4)} a server operator`);
    } else if (cmd === "/help") {
      addLog("INFO", "--- Showing help ---");
      addLog("INFO", "/say <message> - Send a message");
      addLog("INFO", "/list - List online players");
      addLog("INFO", "/stop - Stop the server");
      addLog("INFO", "/op <player> - Make player operator");
    } else {
      addLog("INFO", `Unknown command: ${cmd}`);
    }
  }, [status, addLog, stopServer]);

  useEffect(() => {
    return () => clearIntervals();
  }, [clearIntervals]);

  return {
    status, stats, logs, files, currentPath, setCurrentPath,
    startServer, stopServer, restartServer, sendCommand, addLog,
    serverProperties: SERVER_PROPERTIES,
  };
}
