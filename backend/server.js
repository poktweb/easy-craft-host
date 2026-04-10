// MCHost Backend v1.1
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
const START_PROFILE_PATH = path.join(SERVER_DIR, ".mchost_start_profile.json");

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

function saveStartProfile(profile) {
  ensureDir(SERVER_DIR);
  fs.writeFileSync(START_PROFILE_PATH, JSON.stringify(profile, null, 2), "utf-8");
}

function getStartProfile() {
  if (!fs.existsSync(START_PROFILE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(START_PROFILE_PATH, "utf-8"));
  } catch (_e) {
    return null;
  }
}

function clearStartProfile() {
  if (fs.existsSync(START_PROFILE_PATH)) fs.unlinkSync(START_PROFILE_PATH);
}

function getForgeLikeArgsFile(startType) {
  const root =
    startType === "neoforge"
      ? path.join(SERVER_DIR, "libraries", "net", "neoforged", "neoforge")
      : path.join(SERVER_DIR, "libraries", "net", "minecraftforge", "forge");
  if (!fs.existsSync(root)) return null;
  try {
    const versions = fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const base = path.join(root, version);
      const candidates = ["win_args.txt", "unix_args.txt"];
      for (const name of candidates) {
        const p = path.join(base, name);
        if (fs.existsSync(p)) return path.relative(SERVER_DIR, p);
      }
    }
  } catch (_e) {}
  return null;
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => addLog("INFO", data.toString().trim()));
    child.stderr.on("data", (data) => addLog("WARN", data.toString().trim()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Processo finalizado com código ${code}`));
    });
  });
}

function startServer() {
  if (mcProcess) return { error: "Servidor já está rodando" };
  ensureDir(SERVER_DIR);

  const startProfile = getStartProfile();
  let flags = [];
  if (startProfile?.mode === "argsFile" && startProfile.argsFile) {
    const argsPath = path.join(SERVER_DIR, startProfile.argsFile);
    if (!fs.existsSync(argsPath)) {
      return { error: `Arquivo de inicialização não encontrado: ${startProfile.argsFile}` };
    }
    flags = [
      `-Xms${MIN_RAM}`,
      `-Xmx${MAX_RAM}`,
      ...(EXTRA_FLAGS ? EXTRA_FLAGS.split(" ").filter(Boolean) : []),
      `@${startProfile.argsFile}`,
      "nogui",
    ];
  } else {
    const jarPath = path.join(SERVER_DIR, JAR_FILE);
    if (!fs.existsSync(jarPath)) {
      return { error: `${JAR_FILE} não encontrado em ${SERVER_DIR}` };
    }
    flags = [
      `-Xms${MIN_RAM}`,
      `-Xmx${MAX_RAM}`,
      ...(EXTRA_FLAGS ? EXTRA_FLAGS.split(" ").filter(Boolean) : []),
      "-jar",
      JAR_FILE,
      "nogui",
    ];
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

// ===================== ROUTES: SERVER VERSIONS =====================
const https = require("https");
const http2 = require("http");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http2;
    mod.get(url, { headers: { "User-Agent": "MCHost/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    }).on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http2;
    mod.get(url, { headers: { "User-Agent": "MCHost/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadFileWithFallback(urls, dest) {
  let lastError = null;
  for (const url of urls) {
    try {
      await downloadFile(url, dest);
      return;
    } catch (err) {
      lastError = err;
      addLog("WARN", `Falha ao baixar de ${url}: ${err.message}`);
    }
  }
  throw lastError || new Error("Falha ao baixar arquivo");
}

function getNeoForgeVersionsFromHtml(html) {
  const matches = [...html.matchAll(/href="\.\/([^/]+)\/"/g)].map((m) => m[1]);
  return matches
    .filter((v) => /^\d/.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function normalizeMinecraftVersion(version) {
  const match = String(version || "").match(/\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function resolveModLoader(serverType) {
  if (serverType === "fabric") return "fabric";
  if (serverType === "forge") return "forge";
  if (serverType === "neoforge") return "neoforge";
  return null;
}

// Get current installed server info
function getCurrentServerInfo() {
  const infoPath = path.join(SERVER_DIR, ".mchost_server_info.json");
  if (fs.existsSync(infoPath)) {
    try { return JSON.parse(fs.readFileSync(infoPath, "utf-8")); } catch (_e) {}
  }
  return null;
}

function saveServerInfo(info) {
  const infoPath = path.join(SERVER_DIR, ".mchost_server_info.json");
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), "utf-8");
}

app.get("/api/versions/current", (req, res) => {
  const info = getCurrentServerInfo();
  res.json(info || { type: "unknown", version: "unknown" });
});

// List available versions for a server type
app.get("/api/versions/:type", async (req, res) => {
  const { type } = req.params;
  const limit = parseInt(req.query.limit, 10);
  try {
    let versions = [];
    if (type === "paper") {
      const resp = await httpGet("https://api.papermc.io/v2/projects/paper");
      const data = JSON.parse(resp.data);
      versions = data.versions.reverse();
    } else if (type === "purpur") {
      const resp = await httpGet("https://api.purpurmc.org/v2/purpur");
      const data = JSON.parse(resp.data);
      versions = data.versions.reverse();
    } else if (type === "folia") {
      const resp = await httpGet("https://api.papermc.io/v2/projects/folia");
      const data = JSON.parse(resp.data);
      versions = data.versions.reverse();
    } else if (type === "spigot") {
      const resp = await httpGet("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const data = JSON.parse(resp.data);
      versions = data.versions
        .filter((v) => v.type === "release")
        .map((v) => v.id);
    } else if (type === "fabric") {
      const resp = await httpGet("https://meta.fabricmc.net/v2/versions/game");
      const data = JSON.parse(resp.data);
      versions = data
        .filter((v) => v.stable)
        .map((v) => v.version);
    } else if (type === "forge") {
      const resp = await httpGet("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
      const data = JSON.parse(resp.data);
      const promos = data.promos || {};
      const gameVersions = new Set();
      for (const key of Object.keys(promos)) {
        const [mc] = key.split("-");
        if (mc) gameVersions.add(mc);
      }
      versions = Array.from(gameVersions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } else if (type === "neoforge") {
      const resp = await httpGet("https://maven.neoforged.net/releases/net/neoforged/neoforge/");
      versions = getNeoForgeVersionsFromHtml(resp.data);
    } else if (type === "vanilla") {
      const resp = await httpGet("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const data = JSON.parse(resp.data);
      versions = data.versions
        .filter((v) => v.type === "release")
        .map((v) => v.id);
    } else {
      return res.status(400).json({ error: "Tipo inválido. Use: paper, purpur, folia, spigot, fabric, forge, neoforge, vanilla" });
    }
    const finalVersions = Number.isFinite(limit) && limit > 0 ? versions.slice(0, limit) : versions;
    res.json({ versions: finalVersions });
  } catch (err) {
    res.status(500).json({ error: `Erro ao buscar versões: ${err.message}` });
  }
});

// Install a specific server version
let installProgress = null;

app.post("/api/versions/install", async (req, res) => {
  const { type, version } = req.body;
  if (!type || !version) return res.status(400).json({ error: "Tipo e versão são obrigatórios" });
  if (mcProcess) return res.status(400).json({ error: "Pare o servidor antes de trocar a versão" });

  installProgress = { type, version, status: "downloading", progress: 0 };
  broadcast("install_progress", installProgress);

  try {
    let downloadUrl = "";

    if (type === "paper") {
      const buildsResp = await httpGet(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`);
      const buildsData = JSON.parse(buildsResp.data);
      const latestBuild = buildsData.builds[buildsData.builds.length - 1];
      const fileName = latestBuild.downloads.application.name;
      downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild.build}/downloads/${fileName}`;
    } else if (type === "purpur") {
      downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
    } else if (type === "folia") {
      const buildsResp = await httpGet(`https://api.papermc.io/v2/projects/folia/versions/${version}/builds`);
      const buildsData = JSON.parse(buildsResp.data);
      const latestBuild = buildsData.builds[buildsData.builds.length - 1];
      const fileName = latestBuild.downloads.application.name;
      downloadUrl = `https://api.papermc.io/v2/projects/folia/versions/${version}/builds/${latestBuild.build}/downloads/${fileName}`;
    } else if (type === "spigot") {
      // download.getbukkit.org pode falhar por DNS em alguns provedores.
      // Tenta CDN oficial como fallback.
      const spigotUrls = [
        `https://download.getbukkit.org/spigot/spigot-${version}.jar`,
        `https://cdn.getbukkit.org/spigot/spigot-${version}.jar`,
      ];

      installProgress.status = "downloading";
      broadcast("install_progress", installProgress);
      addLog("INFO", `Baixando ${type} ${version}...`);

      const jarPath = path.join(SERVER_DIR, JAR_FILE);
      if (fs.existsSync(jarPath)) {
        fs.unlinkSync(jarPath);
        addLog("INFO", "server.jar antigo removido.");
      }

      ensureDir(SERVER_DIR);
      await downloadFileWithFallback(spigotUrls, jarPath);
      clearStartProfile();
      saveServerInfo({ type, version, installedAt: new Date().toISOString() });

      installProgress = { type, version, status: "done", progress: 100 };
      broadcast("install_progress", installProgress);
      addLog("INFO", `${type} ${version} instalado com sucesso!`);
      return res.json({ success: true });
    } else if (type === "fabric") {
      const loadersResp = await httpGet("https://meta.fabricmc.net/v2/versions/loader");
      const installersResp = await httpGet("https://meta.fabricmc.net/v2/versions/installer");
      const loaders = JSON.parse(loadersResp.data);
      const installers = JSON.parse(installersResp.data);
      const latestLoader = loaders[0]?.version;
      const latestInstaller = installers[0]?.version;
      if (!latestLoader || !latestInstaller) throw new Error("Não foi possível resolver versões do Fabric");
      downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${latestLoader}/${latestInstaller}/server/jar`;
    } else if (type === "forge") {
      const promotionsResp = await httpGet("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
      const promotions = JSON.parse(promotionsResp.data)?.promos || {};
      const forgeVersion = promotions[`${version}-latest`] || promotions[`${version}-recommended`];
      if (!forgeVersion) throw new Error(`Não há build Forge disponível para ${version}`);

      const installerName = `forge-${version}-${forgeVersion}-installer.jar`;
      const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeVersion}/${installerName}`;
      const installerPath = path.join(SERVER_DIR, installerName);
      await downloadFile(installerUrl, installerPath);
      addLog("INFO", `Executando installer do Forge ${version}-${forgeVersion}...`);
      await runProcess(JAVA_PATH, ["-jar", installerName, "--installServer"], SERVER_DIR);

      const argsFile = getForgeLikeArgsFile("forge");
      if (!argsFile) throw new Error("Instalação concluída, mas arquivo de argumentos do Forge não foi encontrado");
      saveStartProfile({ mode: "argsFile", argsFile, type: "forge", installedAt: new Date().toISOString() });

      if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
      saveServerInfo({ type, version: `${version}-${forgeVersion}`, installedAt: new Date().toISOString() });
      installProgress = { type, version: `${version}-${forgeVersion}`, status: "done", progress: 100 };
      broadcast("install_progress", installProgress);
      addLog("INFO", `forge ${version}-${forgeVersion} instalado com sucesso!`);
      return res.json({ success: true });
    } else if (type === "neoforge") {
      const versionsResp = await httpGet("https://maven.neoforged.net/releases/net/neoforged/neoforge/");
      const matches = getNeoForgeVersionsFromHtml(versionsResp.data);
      const fullVersion = matches
        .filter((v) => v.startsWith(`${version}.`) || v === version || normalizeMinecraftVersion(v) === normalizeMinecraftVersion(version))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
      if (!fullVersion) throw new Error(`Não há build NeoForge disponível para ${version}`);

      const installerName = `neoforge-${fullVersion}-installer.jar`;
      const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${fullVersion}/${installerName}`;
      const installerPath = path.join(SERVER_DIR, installerName);
      await downloadFile(installerUrl, installerPath);
      addLog("INFO", `Executando installer do NeoForge ${fullVersion}...`);
      await runProcess(JAVA_PATH, ["-jar", installerName, "--installServer"], SERVER_DIR);

      const argsFile = getForgeLikeArgsFile("neoforge");
      if (!argsFile) throw new Error("Instalação concluída, mas arquivo de argumentos do NeoForge não foi encontrado");
      saveStartProfile({ mode: "argsFile", argsFile, type: "neoforge", installedAt: new Date().toISOString() });

      if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
      saveServerInfo({ type, version: fullVersion, installedAt: new Date().toISOString() });
      installProgress = { type, version: fullVersion, status: "done", progress: 100 };
      broadcast("install_progress", installProgress);
      addLog("INFO", `neoforge ${fullVersion} instalado com sucesso!`);
      return res.json({ success: true });
    } else if (type === "vanilla") {
      const manifestResp = await httpGet("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const manifest = JSON.parse(manifestResp.data);
      const versionInfo = manifest.versions.find((v) => v.id === version);
      if (!versionInfo) throw new Error("Versão não encontrada");
      const versionResp = await httpGet(versionInfo.url);
      const versionData = JSON.parse(versionResp.data);
      downloadUrl = versionData.downloads.server.url;
    }

    installProgress.status = "downloading";
    broadcast("install_progress", installProgress);
    addLog("INFO", `Baixando ${type} ${version}...`);

    // Delete old server.jar
    const jarPath = path.join(SERVER_DIR, JAR_FILE);
    if (fs.existsSync(jarPath)) {
      fs.unlinkSync(jarPath);
      addLog("INFO", "server.jar antigo removido.");
    }

    ensureDir(SERVER_DIR);
    await downloadFile(downloadUrl, jarPath);
    clearStartProfile();

    saveServerInfo({ type, version, installedAt: new Date().toISOString() });

    installProgress = { type, version, status: "done", progress: 100 };
    broadcast("install_progress", installProgress);
    addLog("INFO", `${type} ${version} instalado com sucesso!`);

    res.json({ success: true });
  } catch (err) {
    installProgress = { type, version, status: "error", error: err.message };
    broadcast("install_progress", installProgress);
    addLog("ERROR", `Erro ao instalar ${type} ${version}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/versions/install/progress", (req, res) => {
  res.json(installProgress || { status: "idle" });
});

// ===================== ROUTES: PLUGINS =====================
const PLUGIN_COMPATIBLE_TYPES = new Set(["paper", "purpur", "folia", "spigot"]);

function sanitizePluginName(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
}

app.get("/api/plugins/list", (req, res) => {
  try {
    const pluginsDir = path.join(SERVER_DIR, "plugins");
    if (!fs.existsSync(pluginsDir)) return res.json([]);
    const plugins = fs.readdirSync(pluginsDir)
      .filter((name) => name.toLowerCase().endsWith(".jar"))
      .sort((a, b) => a.localeCompare(b));
    res.json(plugins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/plugins/install", async (req, res) => {
  const { url, name, serverType } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL do plugin é obrigatória" });
  }
  if (!serverType || !PLUGIN_COMPATIBLE_TYPES.has(serverType)) {
    return res.status(400).json({ error: "O modo selecionado não suporta plugins (.jar)" });
  }

  try {
    const pluginsDir = path.join(SERVER_DIR, "plugins");
    ensureDir(pluginsDir);

    const urlObj = new URL(url);
    const rawName = sanitizePluginName(name) || sanitizePluginName(path.basename(urlObj.pathname)) || "plugin.jar";
    const fileName = rawName.toLowerCase().endsWith(".jar") ? rawName : `${rawName}.jar`;
    const dest = path.join(pluginsDir, fileName);

    await downloadFile(url, dest);
    addLog("INFO", `Plugin instalado: ${fileName}`);
    res.json({ success: true, name: fileName });
  } catch (err) {
    res.status(500).json({ error: `Falha ao baixar plugin: ${err.message}` });
  }
});

// ===================== ROUTES: MODS =====================
const MOD_COMPATIBLE_TYPES = new Set(["fabric", "forge", "neoforge"]);

app.get("/api/mods/catalog", async (req, res) => {
  const serverType = String(req.query.serverType || "");
  const loaderFromServer = resolveModLoader(serverType);
  const loaderFromQuery = String(req.query.loader || "").toLowerCase();
  const loader = ["fabric", "forge", "neoforge"].includes(loaderFromQuery) ? loaderFromQuery : loaderFromServer;
  const gameVersion = normalizeMinecraftVersion(req.query.version);
  const search = String(req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 24, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  if (!loader) {
    return res.status(400).json({ error: "Loader inválido. Use: fabric, forge ou neoforge" });
  }
  if (!gameVersion) {
    return res.status(400).json({ error: "Versão do Minecraft é obrigatória para listar mods" });
  }

  try {
    const facets = JSON.stringify([
      ["project_type:mod"],
      [`categories:${loader}`],
      [`versions:${gameVersion}`],
    ]);
    const queryParam = search ? `&query=${encodeURIComponent(search)}` : "";
    const url = `https://api.modrinth.com/v2/search?limit=${limit}&offset=${offset}&index=downloads${queryParam}&facets=${encodeURIComponent(facets)}`;
    const resp = await httpGet(url);
    const data = JSON.parse(resp.data);
    const hits = Array.isArray(data.hits) ? data.hits : [];

    const mods = hits.map((mod) => ({
      id: mod.project_id,
      slug: mod.slug,
      title: mod.title,
      description: mod.description,
      downloads: mod.downloads || 0,
      iconUrl: mod.icon_url || null,
      author: mod.author || "Desconhecido",
    }));

    res.json({
      mods,
      totalHits: Number(data.total_hits || 0),
      offset,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: `Erro ao buscar catálogo de mods: ${err.message}` });
  }
});

app.get("/api/mods/list", (req, res) => {
  try {
    const modsDir = path.join(SERVER_DIR, "mods");
    if (!fs.existsSync(modsDir)) return res.json([]);
    const mods = fs.readdirSync(modsDir)
      .filter((name) => name.toLowerCase().endsWith(".jar"))
      .sort((a, b) => a.localeCompare(b));
    res.json(mods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mods/install", async (req, res) => {
  const { projectId, serverType, gameVersion, loader } = req.body || {};
  const loaderFromServer = resolveModLoader(serverType);
  const finalLoader = ["fabric", "forge", "neoforge"].includes(String(loader || "").toLowerCase())
    ? String(loader).toLowerCase()
    : loaderFromServer;
  const mcVersion = normalizeMinecraftVersion(gameVersion);

  if (!projectId || typeof projectId !== "string") {
    return res.status(400).json({ error: "projectId do mod é obrigatório" });
  }
  if (!finalLoader) {
    return res.status(400).json({ error: "Loader inválido para mods" });
  }
  if (!mcVersion) {
    return res.status(400).json({ error: "Versão do Minecraft é obrigatória para instalar mod" });
  }

  try {
    const versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify([finalLoader]))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versionsResp = await httpGet(versionsUrl);
    const versions = JSON.parse(versionsResp.data);
    if (!Array.isArray(versions) || versions.length === 0) {
      return res.status(404).json({ error: `Nenhuma versão compatível encontrada para ${finalLoader} ${mcVersion}` });
    }

    const selected = versions[0];
    const file = (selected.files || []).find((f) => f.primary) || (selected.files || [])[0];
    if (!file?.url) {
      return res.status(500).json({ error: "Arquivo do mod não encontrado na versão selecionada" });
    }

    const modsDir = path.join(SERVER_DIR, "mods");
    ensureDir(modsDir);
    const safeName = sanitizePluginName(file.filename || `${projectId}.jar`);
    const finalName = safeName.toLowerCase().endsWith(".jar") ? safeName : `${safeName}.jar`;
    const dest = path.join(modsDir, finalName);

    await downloadFile(file.url, dest);
    addLog("INFO", `Mod instalado: ${finalName}`);
    res.json({ success: true, name: finalName });
  } catch (err) {
    res.status(500).json({ error: `Falha ao instalar mod: ${err.message}` });
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
