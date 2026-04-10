const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const pidusage = require("pidusage");
const { verifyUser, generateToken, verifyToken, changePassword, authMiddleware } = require("./auth");

// ===================== CONFIG =====================
const PORT = process.env.PORT || 3001;
const SERVER_DIR = process.env.MC_SERVER_DIR || path.join(__dirname, "minecraft");
const JAR_FILE = process.env.MC_JAR || "server.jar";
const JAVA_PATH = process.env.JAVA_PATH || "java";
const MAX_RAM = process.env.MC_MAX_RAM || "2048M";
const MIN_RAM = process.env.MC_MIN_RAM || "512M";
const EXTRA_FLAGS = process.env.MC_EXTRA_FLAGS || "";
const BACKUP_DIR = process.env.MC_BACKUP_DIR || path.join(__dirname, "backups");
const MAX_PLAYERS = parseInt(process.env.MC_MAX_PLAYERS || "20");
const MAX_CPU = parseInt(process.env.MC_MAX_CPU || "200");
const MAX_STORAGE = process.env.MC_MAX_STORAGE || "10 GB";
const MAX_RAM_DISPLAY = process.env.MC_MAX_RAM_DISPLAY || MAX_RAM.replace("M", " MB").replace("G", " GB");

// ===================== STATE =====================
let mcProcess = null;         // child_process
let serverStatus = "stopped"; // stopped | starting | running | stopping
let logs = [];                // { id, timestamp, level, message }
let logId = 0;
let startTime = null;

// ===================== EXPRESS =====================
const app = express();
app.use(cors());
app.use(express.json());

// Auth routes (no middleware needed)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
  const user = verifyUser(username, password);
  if (!user) return res.status(401).json({ error: "Usuário ou senha incorretos" });
  const token = generateToken(user);
  res.json({ token, username: user.username });
});

app.get("/api/auth/validate", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido" });
  const decoded = verifyToken(authHeader.split(" ")[1]);
  if (!decoded) return res.status(401).json({ error: "Token inválido" });
  res.json({ valid: true, username: decoded.username });
});

app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "Senhas são obrigatórias" });
  if (newPassword.length < 4) return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
  const result = changePassword(req.user.id, oldPassword, newPassword);
  res.json(result);
});

// Apply auth middleware to all other routes
app.use("/api", authMiddleware);
const server = http.createServer(app);

// ===================== WEBSOCKET =====================
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();

wss.on("connection", (ws, req) => {
  // Validate token from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token || !verifyToken(token)) {
    ws.close(4001, "Unauthorized");
    return;
  }
  clients.add(ws);
  // Send current state
  ws.send(JSON.stringify({ type: "status", data: serverStatus }));
  ws.send(JSON.stringify({ type: "logs", data: logs.slice(-500) }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function addLog(level, message) {
  const now = new Date();
  const timestamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const entry = { id: ++logId, timestamp, level, message };
  logs.push(entry);
  if (logs.length > 2000) logs = logs.slice(-1500);
  broadcast("log", entry);
}

// ===================== MINECRAFT PROCESS =====================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function startServer() {
  if (mcProcess) return { error: "Servidor já está rodando" };
  ensureDir(SERVER_DIR);

  const jarPath = path.join(SERVER_DIR, JAR_FILE);
  if (!fs.existsSync(jarPath)) {
    return { error: `${JAR_FILE} não encontrado em ${SERVER_DIR}` };
  }

  // Auto-aceitar EULA
  const eulaPath = path.join(SERVER_DIR, "eula.txt");
  fs.writeFileSync(eulaPath, "eula=true\n", "utf-8");

  serverStatus = "starting";
  broadcast("status", serverStatus);
  logs = [];
  logId = 0;
  addLog("INFO", "EULA aceito automaticamente.");
  addLog("INFO", "Iniciando servidor...");

  const flags = [
    `-Xms${MIN_RAM}`,
    `-Xmx${MAX_RAM}`,
    ...(EXTRA_FLAGS ? EXTRA_FLAGS.split(" ").filter(Boolean) : []),
    "-jar",
    JAR_FILE,
    "nogui",
  ];

  mcProcess = spawn(JAVA_PATH, flags, {
    cwd: SERVER_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });

  mcProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      const parsed = parseLogLine(line);
      addLog(parsed.level, parsed.message);
      // Detect server ready
      if (line.includes("Done (") || line.includes("For help, type")) {
        if (serverStatus === "starting") {
          serverStatus = "running";
          startTime = Date.now();
          broadcast("status", serverStatus);
        }
      }
    }
  });

  mcProcess.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      addLog("ERROR", line);
    }
  });

  mcProcess.on("close", (code) => {
    addLog("INFO", `Servidor encerrado com código ${code}`);
    mcProcess = null;
    serverStatus = "stopped";
    startTime = null;
    broadcast("status", serverStatus);
  });

  mcProcess.on("error", (err) => {
    addLog("ERROR", `Erro ao iniciar: ${err.message}`);
    mcProcess = null;
    serverStatus = "stopped";
    broadcast("status", serverStatus);
  });

  return { success: true };
}

function parseLogLine(line) {
  // [HH:MM:SS] [Thread/LEVEL]: message
  const match = line.match(/\[[\d:]+\]\s*\[([^\]]+)\/(INFO|WARN|ERROR)\]:\s*(.*)/);
  if (match) {
    return { level: match[2], message: line };
  }
  return { level: "INFO", message: line };
}

function stopServer() {
  if (!mcProcess) return { error: "Servidor não está rodando" };
  serverStatus = "stopping";
  broadcast("status", serverStatus);
  addLog("INFO", "Parando servidor...");
  mcProcess.stdin.write("stop\n");
  // Force kill after 30s
  setTimeout(() => {
    if (mcProcess) {
      mcProcess.kill("SIGKILL");
      addLog("WARN", "Servidor forçado a parar (timeout)");
    }
  }, 30000);
  return { success: true };
}

function restartServer() {
  if (!mcProcess) return { error: "Servidor não está rodando" };
  serverStatus = "stopping";
  broadcast("status", serverStatus);
  addLog("INFO", "Reiniciando servidor...");
  mcProcess.stdin.write("stop\n");

  const waitForStop = () => {
    if (!mcProcess) {
      setTimeout(() => startServer(), 1000);
    } else {
      setTimeout(waitForStop, 500);
    }
  };
  waitForStop();
  return { success: true };
}

function sendCommand(command) {
  if (!mcProcess) return { error: "Servidor não está rodando" };
  const cmd = command.startsWith("/") ? command.slice(1) : command;
  mcProcess.stdin.write(cmd + "\n");
  addLog("INFO", `> ${command}`);
  return { success: true };
}

// ===================== STATS =====================
async function getStats() {
  let cpu = 0;
  let ram = 0;
  let players = 0;

  if (mcProcess && mcProcess.pid) {
    try {
      const usage = await pidusage(mcProcess.pid);
      cpu = Math.round(usage.cpu * 100) / 100;
      ram = Math.round((usage.memory / 1024 / 1024 / 1024) * 100) / 100; // GB
    } catch (_e) {
      // process may have exited
    }
  }

  // Get storage used
  let storage = 0;
  try {
    storage = getDirSizeMB(SERVER_DIR);
  } catch (_e) {}

  // Get player count from server.properties and/or log parsing
  // We'll use a simple approach - try to read the latest player count
  if (serverStatus === "running" && mcProcess) {
    // Simple estimation from recent logs
    const recentJoins = logs.filter(
      (l) => l.message.includes("joined the game")
    ).length;
    const recentLeaves = logs.filter(
      (l) => l.message.includes("left the game")
    ).length;
    players = Math.max(0, recentJoins - recentLeaves);
  }

  return {
    cpu,
    maxCpu: MAX_CPU,
    ram,
    maxRam: MAX_RAM_DISPLAY,
    storage: Math.round(storage * 100) / 100,
    maxStorage: MAX_STORAGE,
    players,
    maxPlayers: MAX_PLAYERS,
    uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
  };
}

function getDirSizeMB(dirPath) {
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSizeMB(fullPath);
      } else {
        totalSize += fs.statSync(fullPath).size;
      }
    }
  } catch (_e) {}
  return totalSize / 1024 / 1024;
}

// ===================== ROUTES: SERVER CONTROL =====================
app.post("/api/server/start", (req, res) => {
  const result = startServer();
  res.json(result);
});

app.post("/api/server/stop", (req, res) => {
  const result = stopServer();
  res.json(result);
});

app.post("/api/server/restart", (req, res) => {
  const result = restartServer();
  res.json(result);
});

app.post("/api/server/command", (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "Comando é obrigatório" });
  const result = sendCommand(command);
  res.json(result);
});

app.get("/api/server/status", (req, res) => {
  res.json({ status: serverStatus });
});

app.get("/api/server/stats", async (req, res) => {
  const stats = await getStats();
  res.json(stats);
});

app.get("/api/server/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  res.json(logs.slice(-limit));
});

// ===================== ROUTES: FILE MANAGER =====================
function resolveSafePath(relativePath) {
  const resolved = path.resolve(SERVER_DIR, relativePath || "");
  if (!resolved.startsWith(path.resolve(SERVER_DIR))) {
    throw new Error("Acesso negado: caminho fora do diretório do servidor");
  }
  return resolved;
}

app.get("/api/files", (req, res) => {
  try {
    const dirPath = resolveSafePath(req.query.path || "");
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "folder" : "file",
        size: entry.isFile() ? formatSize(stat.size) : undefined,
        modified: stat.mtime.toLocaleString("pt-BR"),
      };
    });
    // Sort: folders first, then files
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/files/content", (req, res) => {
  try {
    const filePath = resolveSafePath(req.query.path);
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/files/content", (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const resolved = resolveSafePath(filePath);
    fs.writeFileSync(resolved, content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/files/create", (req, res) => {
  try {
    const { path: filePath, type } = req.body;
    const resolved = resolveSafePath(filePath);
    if (type === "folder") {
      fs.mkdirSync(resolved, { recursive: true });
    } else {
      fs.writeFileSync(resolved, "", "utf-8");
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/files", (req, res) => {
  try {
    const filePath = resolveSafePath(req.query.path);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/files/download", (req, res) => {
  try {
    const filePath = resolveSafePath(req.query.path);
    res.download(filePath);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Upload
const upload = multer({ dest: path.join(__dirname, "tmp_uploads") });

app.post("/api/files/upload", upload.array("files"), (req, res) => {
  try {
    const targetDir = resolveSafePath(req.body.path || "");
    ensureDir(targetDir);
    for (const file of req.files) {
      const dest = path.join(targetDir, file.originalname);
      fs.renameSync(file.path, dest);
    }
    res.json({ success: true, count: req.files.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== ROUTES: BACKUPS =====================
app.get("/api/backups", (req, res) => {
  ensureDir(BACKUP_DIR);
  try {
    const entries = fs.readdirSync(BACKUP_DIR);
    const backups = entries
      .filter((f) => f.endsWith(".tar.gz") || f.endsWith(".zip"))
      .map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: formatSize(stat.size),
          date: stat.mtime.toLocaleString("pt-BR"),
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
    res.json(backups);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/backups/create", (req, res) => {
  ensureDir(BACKUP_DIR);
  const now = new Date();
  const name = `backup_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}.tar.gz`;
  const outPath = path.join(BACKUP_DIR, name);

  try {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("tar", { gzip: true });
    archive.pipe(output);
    archive.directory(SERVER_DIR, false);

    output.on("close", () => {
      addLog("INFO", `Backup criado: ${name} (${formatSize(archive.pointer())})`);
      res.json({ success: true, name });
    });

    archive.on("error", (err) => {
      res.status(500).json({ error: err.message });
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/backups/download", (req, res) => {
  const backupPath = path.join(BACKUP_DIR, path.basename(req.query.name));
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: "Backup não encontrado" });
  }
  res.download(backupPath);
});

app.delete("/api/backups", (req, res) => {
  const backupPath = path.join(BACKUP_DIR, path.basename(req.query.name));
  try {
    fs.unlinkSync(backupPath);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== ROUTES: PROPERTIES =====================
app.get("/api/properties", (req, res) => {
  try {
    const propsPath = path.join(SERVER_DIR, "server.properties");
    if (!fs.existsSync(propsPath)) {
      return res.json({});
    }
    const content = fs.readFileSync(propsPath, "utf-8");
    const props = {};
    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      props[key.trim()] = rest.join("=").trim();
    }
    res.json(props);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/properties", (req, res) => {
  try {
    const propsPath = path.join(SERVER_DIR, "server.properties");
    const props = req.body;
    let content = "#Minecraft server properties\n#Modified by MCHost\n";
    for (const [key, value] of Object.entries(props)) {
      content += `${key}=${value}\n`;
    }
    fs.writeFileSync(propsPath, content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== HELPERS =====================
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ===================== STATS BROADCAST =====================
setInterval(async () => {
  if (clients.size > 0) {
    const stats = await getStats();
    broadcast("stats", stats);
  }
}, 3000);

// ===================== START =====================
server.listen(PORT, () => {
  console.log(`MCHost Backend rodando na porta ${PORT}`);
  console.log(`Diretório do servidor: ${SERVER_DIR}`);
  console.log(`JAR: ${JAR_FILE}`);
  console.log(`RAM: ${MIN_RAM} - ${MAX_RAM}`);
  ensureDir(SERVER_DIR);
  ensureDir(BACKUP_DIR);
});
