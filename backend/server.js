// pokt Craft Backend v1.1
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
const {
  verifyUser,
  generateToken,
  verifyToken,
  changePassword,
  authMiddleware,
  authProfileForUserId,
  userCanCreateInstances,
  isAdminUsername,
  getAdminUserId,
  getUserById,
  listUsersForAdmin,
  setUserCanHost,
  setUserQuotas,
  registerUser,
} = require("./auth");

// ===================== CONFIG =====================
const PORT = process.env.PORT || 3001;
const LEGACY_SERVER_DIR = process.env.MC_SERVER_DIR || path.join(__dirname, "minecraft");
const JAR_FILE = process.env.MC_JAR || "server.jar";
const JAVA_PATH = process.env.JAVA_PATH || "java";
const MAX_RAM = process.env.MC_MAX_RAM || "2048M";
const MIN_RAM = process.env.MC_MIN_RAM || "512M";
const EXTRA_FLAGS = process.env.MC_EXTRA_FLAGS || "";
/** Sempre anexadas ao java após as flags da instância. Ex. Java 24+ / Netty: --sun-misc-unsafe-memory-access=allow */
const APPEND_JVM_FLAGS = (process.env.MC_APPEND_JVM_FLAGS || "").trim();
const BACKUP_DIR = process.env.MC_BACKUP_DIR || path.join(__dirname, "backups");
const MAX_PLAYERS = parseInt(process.env.MC_MAX_PLAYERS || "20");
const MAX_CPU = parseInt(process.env.MC_MAX_CPU || "200");
const MAX_STORAGE = process.env.MC_MAX_STORAGE || "10 GB";
const MAX_RAM_DISPLAY = process.env.MC_MAX_RAM_DISPLAY || MAX_RAM.replace("M", " MB").replace("G", " GB");
/** Máximo de instâncias por usuário quando o admin não definiu cota própria. */
const DEFAULT_USER_MAX_INSTANCES = Math.max(1, parseInt(process.env.MC_USER_DEFAULT_MAX_INSTANCES || "5", 10));

const INSTANCES_STORE = path.join(__dirname, "instances.json");
const INSTANCES_DATA_DIR = path.join(__dirname, "data_instances");
/** IP ou hostname público exibido no painel (Minecraft: conexão direta IP:porta). */
const PUBLIC_HOST = String(process.env.MC_PUBLIC_HOST || "144.91.82.148").replace(/\/$/, "");
const SETTINGS_FILENAME = ".mchost_settings.json";
const DEFAULT_MC_PORT = 25565;
const MAX_MC_PORT = 65535;

function parseServerPropsFileContent(content) {
  const props = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    props[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return props;
}

function readServerPropertiesMap(instanceDir) {
  const propsPath = path.join(instanceDir, "server.properties");
  if (!fs.existsSync(propsPath)) return {};
  try {
    return parseServerPropsFileContent(fs.readFileSync(propsPath, "utf-8"));
  } catch (_e) {
    return {};
  }
}

function getEffectiveServerPort(inst, instanceDir) {
  const map = readServerPropertiesMap(instanceDir);
  const fromFile = parseInt(map["server-port"], 10);
  if (Number.isFinite(fromFile) && fromFile >= 1 && fromFile <= MAX_MC_PORT) return fromFile;
  if (inst && inst.serverPort != null) {
    const p = parseInt(String(inst.serverPort), 10);
    if (Number.isFinite(p) && p >= 1 && p <= MAX_MC_PORT) return p;
  }
  return DEFAULT_MC_PORT;
}

function collectUsedMcPorts(reg) {
  const used = new Set();
  for (const inst of reg.instances) {
    used.add(getEffectiveServerPort(inst, getInstancePath(inst)));
  }
  return used;
}

/** Nova instância: porta aleatória livre no intervalo [DEFAULT_MC_PORT, MAX_MC_PORT], sem repetir portas já usadas por outra instância. */
function allocateNextServerPort(reg) {
  const used = collectUsedMcPorts(reg);
  const free = [];
  for (let p = DEFAULT_MC_PORT; p <= MAX_MC_PORT; p++) {
    if (!used.has(p)) free.push(p);
  }
  if (free.length === 0) {
    throw new Error("Sem portas TCP livres para novas instâncias");
  }
  return free[Math.floor(Math.random() * free.length)];
}

function writeServerPortInProperties(instanceDir, port) {
  const propsPath = path.join(instanceDir, "server.properties");
  ensureDir(instanceDir);
  if (fs.existsSync(propsPath)) {
    const lines = fs.readFileSync(propsPath, "utf-8").split("\n");
    let found = false;
    const out = lines.map((line) => {
      const t = line.trim();
      if (t.startsWith("server-port=")) {
        found = true;
        return `server-port=${port}`;
      }
      return line;
    });
    if (!found) out.push(`server-port=${port}`);
    fs.writeFileSync(propsPath, out.join("\n"), "utf-8");
  } else {
    fs.writeFileSync(
      propsPath,
      `#Minecraft server properties\n# Gerado pelo pokt Craft\nserver-port=${port}\n`,
      "utf-8"
    );
  }
}

function normalizeInstanceServerPorts(reg) {
  let changed = false;
  const used = new Set();
  const sorted = [...reg.instances].sort((a, b) => {
    if (a.mode === "legacy" && b.mode !== "legacy") return -1;
    if (b.mode === "legacy" && a.mode !== "legacy") return 1;
    return 0;
  });
  for (const inst of sorted) {
    const dir = getInstancePath(inst);
    let port = getEffectiveServerPort(inst, dir);
    if (used.has(port)) {
      let next = DEFAULT_MC_PORT;
      while (used.has(next)) {
        next++;
        if (next > MAX_MC_PORT) throw new Error("Sem portas TCP livres para instâncias");
      }
      port = next;
      ensureDir(dir);
      writeServerPortInProperties(dir, port);
      inst.serverPort = port;
      changed = true;
    }
    used.add(port);
  }
  if (changed) saveInstancesRegistry(reg);
}

function wipeInstanceForFullReinstall(instanceId, instanceDir, inst) {
  const port = getEffectiveServerPort(inst, instanceDir);
  const settingsPath = path.join(instanceDir, SETTINGS_FILENAME);
  let jvmSnapshot = null;
  if (fs.existsSync(settingsPath)) {
    try {
      jvmSnapshot = fs.readFileSync(settingsPath, "utf-8");
    } catch (_e) {}
  }
  addLog(instanceId, "INFO", "Limpando a instância (mundos, mods, plugins, jars) antes da nova instalação...");
  if (fs.existsSync(instanceDir)) {
    fs.rmSync(instanceDir, { recursive: true, force: true });
  }
  ensureDir(instanceDir);
  if (jvmSnapshot) {
    try {
      fs.writeFileSync(settingsPath, jvmSnapshot, "utf-8");
    } catch (_e) {}
  }
  writeServerPortInProperties(instanceDir, port);
}

function parseRamEnvToMb(value) {
  const m = String(value || "")
    .trim()
    .match(/^(\d+)\s*([MG]?)$/i);
  if (!m) return 512;
  const n = parseInt(m[1], 10);
  const u = (m[2] || "M").toUpperCase();
  return u === "G" ? n * 1024 : n;
}

/** RAM máxima por instância (MB): cota do usuário ou padrão do servidor (MC_MAX_RAM). Administrador sem limite prático. */
function resolveUserRamCapMb(userId) {
  const u = getUserById(userId);
  if (u && isAdminUsername(u.username)) return 262144;
  const envCap = parseRamEnvToMb(MAX_RAM);
  if (!u) return envCap;
  if (u.quotaMaxRamMb != null && Number.isFinite(Number(u.quotaMaxRamMb)) && Number(u.quotaMaxRamMb) >= 256) {
    return Math.floor(Number(u.quotaMaxRamMb));
  }
  return envCap;
}

/** Quantidade máxima de instâncias: cota do usuário ou MC_USER_DEFAULT_MAX_INSTANCES. Administrador: 999. */
function resolveUserMaxInstances(userId) {
  const u = getUserById(userId);
  if (u && isAdminUsername(u.username)) return 999;
  if (!u) return DEFAULT_USER_MAX_INSTANCES;
  if (u.quotaMaxInstances != null && Number.isFinite(Number(u.quotaMaxInstances)) && Number(u.quotaMaxInstances) >= 1) {
    return Math.floor(Number(u.quotaMaxInstances));
  }
  return DEFAULT_USER_MAX_INSTANCES;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadInstancesRegistry() {
  if (fs.existsSync(INSTANCES_STORE)) {
    try {
      const data = JSON.parse(fs.readFileSync(INSTANCES_STORE, "utf-8"));
      if (data && Array.isArray(data.instances) && data.instances.length) {
        try {
          normalizeInstanceServerPorts(data);
        } catch (e) {
          console.error("[pokt Craft] normalizeInstanceServerPorts:", e.message);
        }
        if (migrateInstanceOwners(data)) {
          saveInstancesRegistry(data);
        }
        return data;
      }
    } catch (_e) {}
  }
  const initial = {
    instances: [{ id: "default", name: "Servidor principal", mode: "legacy" }],
  };
  migrateInstanceOwners(initial);
  ensureDir(path.dirname(INSTANCES_STORE));
  fs.writeFileSync(INSTANCES_STORE, JSON.stringify(initial, null, 2), "utf-8");
  return initial;
}

function saveInstancesRegistry(data) {
  fs.writeFileSync(INSTANCES_STORE, JSON.stringify(data, null, 2), "utf-8");
}

function getInstancePath(inst) {
  if (inst.mode === "legacy") return LEGACY_SERVER_DIR;
  return path.join(INSTANCES_DATA_DIR, inst.id);
}

function findInstance(id) {
  const reg = loadInstancesRegistry();
  return reg.instances.find((i) => i.id === id);
}

/** Instâncias sem dono (legado) passam a pertencer ao administrador. */
function migrateInstanceOwners(reg) {
  const adminId = getAdminUserId();
  if (adminId == null) return false;
  let changed = false;
  for (const i of reg.instances) {
    if (i.ownerUserId === undefined || i.ownerUserId === null) {
      i.ownerUserId = adminId;
      changed = true;
    }
  }
  return changed;
}

function createEmptyInstanceState() {
  return {
    mcProcess: null,
    serverStatus: "stopped",
    logs: [],
    logId: 0,
    startTime: null,
    installProgress: null,
  };
}

const instanceStates = new Map();

function getInstanceState(instanceId) {
  if (!instanceStates.has(instanceId)) instanceStates.set(instanceId, createEmptyInstanceState());
  return instanceStates.get(instanceId);
}

function getDefaultJvmSettings() {
  return {
    javaVersion: "17",
    minRamMb: parseRamEnvToMb(MIN_RAM),
    maxRamMb: parseRamEnvToMb(MAX_RAM),
    javaPath: JAVA_PATH,
    jarFile: JAR_FILE,
    extraFlags: EXTRA_FLAGS,
    autoRestart: true,
    crashDetection: true,
    autoBackup: true,
    backupIntervalHours: 24,
  };
}

/** Mescla disco + padrões globais, sem aplicar cota por usuário. */
function mergeJvmFromDisk(instanceDir) {
  const settingsPath = path.join(instanceDir, SETTINGS_FILENAME);
  const base = getDefaultJvmSettings();
  if (!fs.existsSync(settingsPath)) return { ...base };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return { ...base, ...saved };
  } catch (_e) {
    return { ...base };
  }
}

function clampJvmToUserRamCap(merged, ownerUserId) {
  if (ownerUserId == null || !Number.isFinite(Number(ownerUserId))) return merged;
  const cap = resolveUserRamCapMb(ownerUserId);
  const maxRam = Math.min(Math.max(256, Number(merged.maxRamMb) || 256), cap);
  const minRam = Math.min(Math.max(256, Number(merged.minRamMb) || 256), maxRam);
  return { ...merged, minRamMb: minRam, maxRamMb: maxRam };
}

/** JVM efetiva para o dono da instância (RAM respeita cota). */
function readJvmSettings(instanceDir, ownerUserId) {
  return clampJvmToUserRamCap(mergeJvmFromDisk(instanceDir), ownerUserId);
}

/** Valores padrão ao criar pasta nova: RAM limitada à cota (ex.: 4 GB → padrão até 4 GB). */
function getDefaultJvmSettingsForNewUser(ownerUserId) {
  const cap = resolveUserRamCapMb(ownerUserId);
  const envMax = parseRamEnvToMb(MAX_RAM);
  const envMin = parseRamEnvToMb(MIN_RAM);
  const maxRam = Math.min(envMax, cap);
  const minRam = Math.min(Math.max(256, envMin), maxRam);
  return { ...getDefaultJvmSettings(), minRamMb: minRam, maxRamMb: maxRam };
}

function writeJvmSettings(instanceDir, partial, ownerUserId) {
  const fromDisk = mergeJvmFromDisk(instanceDir);
  const next = { ...fromDisk, ...partial };
  const clamped = clampJvmToUserRamCap(next, ownerUserId);
  fs.writeFileSync(path.join(instanceDir, SETTINGS_FILENAME), JSON.stringify(clamped, null, 2), "utf-8");
  return clamped;
}

function formatMaxRamDisplayFromMb(mb) {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

function attachInstance(req, res, next) {
  const pathOnly = req.originalUrl.split("?")[0];
  if (!pathOnly.startsWith("/api/")) return next();
  if (pathOnly.startsWith("/api/auth/")) return next();
  if (pathOnly.startsWith("/api/admin/")) return next();
  if (pathOnly === "/api/instances" && (req.method === "GET" || req.method === "POST")) return next();
  if (/^\/api\/instances\/[^/]+$/.test(pathOnly) && req.method === "DELETE") return next();

  if (!userCanCreateInstances(req.user.id)) {
    return res.status(403).json({
      error:
        "Sua conta não está autorizada a acessar instâncias. Peça ao administrador para liberar o acesso à hospedagem.",
    });
  }

  const instanceId = String(
    req.headers["x-poktcraft-instance"] || req.headers["x-mchost-instance"] || "default"
  ).trim();
  const inst = findInstance(instanceId);
  if (!inst) return res.status(404).json({ error: "Instância não encontrada" });
  if (Number(inst.ownerUserId) !== Number(req.user.id)) {
    return res.status(403).json({ error: "Esta instância não pertence à sua conta." });
  }
  req.mchostInstanceId = instanceId;
  req.instanceDir = getInstancePath(inst);
  ensureDir(req.instanceDir);
  next();
}

// ===================== EXPRESS =====================
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Auth routes (no middleware needed)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
  const user = verifyUser(username, password);
  if (!user) return res.status(401).json({ error: "Usuário ou senha incorretos" });
  const token = generateToken(user);
  const profile = authProfileForUserId(user.id);
  res.json({ token, username: user.username, ...profile });
});

app.get("/api/auth/validate", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Token não fornecido" });
  const decoded = verifyToken(authHeader.split(" ")[1]);
  if (!decoded) return res.status(401).json({ error: "Token inválido" });
  const profile = authProfileForUserId(decoded.id);
  res.json({ valid: true, username: decoded.username, ...profile });
});

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
  const result = registerUser(username, password);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({
    success: true,
    message:
      "Conta criada. Entre com seu usuário e senha. Você só verá e poderá usar instâncias depois que o administrador liberar sua conta para hospedagem.",
  });
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
app.use(attachInstance);

app.get("/api/admin/users", (req, res) => {
  if (!isAdminUsername(req.user.username)) {
    return res.status(403).json({ error: "Acesso restrito ao administrador" });
  }
  try {
    const reg = loadInstancesRegistry();
    const rows = listUsersForAdmin().map((u) => {
      const instanceCount = reg.instances.filter((i) => Number(i.ownerUserId) === Number(u.id)).length;
      return {
        ...u,
        instanceCount,
        effectiveMaxRamMb: resolveUserRamCapMb(u.id),
        effectiveMaxInstances: resolveUserMaxInstances(u.id),
      };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/users/:id/can-host", (req, res) => {
  if (!isAdminUsername(req.user.username)) {
    return res.status(403).json({ error: "Acesso restrito ao administrador" });
  }
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });
  const want = req.body?.canHost;
  if (typeof want !== "boolean") return res.status(400).json({ error: "Envie canHost: true ou false" });
  const result = setUserCanHost(req.user.id, targetId, want);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

app.patch("/api/admin/users/:id/quota", (req, res) => {
  if (!isAdminUsername(req.user.username)) {
    return res.status(403).json({ error: "Acesso restrito ao administrador" });
  }
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });
  const body = req.body || {};
  const patch = {};
  if ("quotaMaxRamMb" in body) patch.quotaMaxRamMb = body.quotaMaxRamMb;
  if ("quotaMaxInstances" in body) patch.quotaMaxInstances = body.quotaMaxInstances;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Envie quotaMaxRamMb e/ou quotaMaxInstances (número ou null para padrão)" });
  }
  const result = setUserQuotas(req.user.id, targetId, patch);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

const server = http.createServer(app);

// ===================== WEBSOCKET =====================
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const instanceId = url.searchParams.get("instance") || "default";
  const decoded = token ? verifyToken(token) : null;
  if (!decoded || !userCanCreateInstances(decoded.id)) {
    ws.close(4001, "Unauthorized");
    return;
  }
  const inst = findInstance(instanceId);
  if (!inst || Number(inst.ownerUserId) !== Number(decoded.id)) {
    ws.close(4004, "Unknown instance");
    return;
  }
  ws.mchostInstanceId = instanceId;
  clients.add(ws);
  const st = getInstanceState(instanceId);
  ws.send(JSON.stringify({ type: "status", data: st.serverStatus }));
  ws.send(JSON.stringify({ type: "logs", data: st.logs.slice(-500) }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(type, data, instanceId) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === 1 && ws.mchostInstanceId === instanceId) ws.send(msg);
  }
}

function addLog(instanceId, level, message) {
  const st = getInstanceState(instanceId);
  const now = new Date();
  const timestamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const entry = { id: ++st.logId, timestamp, level, message };
  st.logs.push(entry);
  if (st.logs.length > 2000) st.logs = st.logs.slice(-1500);
  broadcast("log", entry, instanceId);
}

// ===================== MINECRAFT PROCESS =====================
function startProfilePath(instanceDir) {
  return path.join(instanceDir, ".mchost_start_profile.json");
}

function saveStartProfile(instanceDir, profile) {
  ensureDir(instanceDir);
  fs.writeFileSync(startProfilePath(instanceDir), JSON.stringify(profile, null, 2), "utf-8");
}

function getStartProfile(instanceDir) {
  const p = startProfilePath(instanceDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_e) {
    return null;
  }
}

function clearStartProfile(instanceDir) {
  const p = startProfilePath(instanceDir);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function getForgeLikeArgsFile(instanceDir, startType) {
  const root =
    startType === "neoforge"
      ? path.join(instanceDir, "libraries", "net", "neoforged", "neoforge")
      : path.join(instanceDir, "libraries", "net", "minecraftforge", "forge");
  if (!fs.existsSync(root)) return null;
  try {
    const versions = fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const base = path.join(root, version);
      const candidates = ["win_args.txt", "unix_args.txt"];
      for (const name of candidates) {
        const p = path.join(base, name);
        if (fs.existsSync(p)) return path.relative(instanceDir, p);
      }
    }
  } catch (_e) {}
  return null;
}

function runProcess(instanceId, command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => addLog(instanceId, "INFO", data.toString().trim()));
    child.stderr.on("data", (data) => addLog(instanceId, "WARN", data.toString().trim()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Processo finalizado com código ${code}`));
    });
  });
}

function startServer(instanceId, instanceDir) {
  const st = getInstanceState(instanceId);
  if (st.mcProcess) return { error: "Servidor já está rodando" };
  ensureDir(instanceDir);

  const instMeta = findInstance(instanceId);
  const ownerUserId = instMeta != null ? Number(instMeta.ownerUserId) : null;
  const jvm = readJvmSettings(instanceDir, ownerUserId);
  const minMb = Math.min(Math.max(256, jvm.minRamMb), jvm.maxRamMb);
  const maxMb = Math.max(minMb, jvm.maxRamMb);
  const minRam = `${minMb}M`;
  const maxRam = `${maxMb}M`;
  const javaBin = jvm.javaPath || JAVA_PATH;
  const jarName = jvm.jarFile || JAR_FILE;
  const extra = String(jvm.extraFlags || "").trim();
  const appended = APPEND_JVM_FLAGS ? APPEND_JVM_FLAGS.split(/\s+/).filter(Boolean) : [];

  const startProfile = getStartProfile(instanceDir);
  let flags = [];
  if (startProfile?.mode === "argsFile" && startProfile.argsFile) {
    const argsPath = path.join(instanceDir, startProfile.argsFile);
    if (!fs.existsSync(argsPath)) {
      return { error: `Arquivo de inicialização não encontrado: ${startProfile.argsFile}` };
    }
    flags = [
      `-Xms${minRam}`,
      `-Xmx${maxRam}`,
      ...(extra ? extra.split(/\s+/).filter(Boolean) : []),
      ...appended,
      `@${startProfile.argsFile}`,
      "nogui",
    ];
  } else {
    const jarPath = path.join(instanceDir, jarName);
    if (!fs.existsSync(jarPath)) {
      return { error: `${jarName} não encontrado nesta instância` };
    }
    flags = [
      `-Xms${minRam}`,
      `-Xmx${maxRam}`,
      ...(extra ? extra.split(/\s+/).filter(Boolean) : []),
      ...appended,
      "-jar",
      jarName,
      "nogui",
    ];
  }

  const eulaPath = path.join(instanceDir, "eula.txt");
  fs.writeFileSync(eulaPath, "eula=true\n", "utf-8");

  st.serverStatus = "starting";
  broadcast("status", st.serverStatus, instanceId);
  st.logs = [];
  st.logId = 0;
  addLog(instanceId, "INFO", "EULA aceito automaticamente.");
  addLog(instanceId, "INFO", "Iniciando servidor...");

  st.mcProcess = spawn(javaBin, flags, {
    cwd: instanceDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  st.mcProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      const parsed = parseLogLine(line);
      addLog(instanceId, parsed.level, parsed.message);
      if (line.includes("Done (") || line.includes("For help, type")) {
        if (st.serverStatus === "starting") {
          st.serverStatus = "running";
          st.startTime = Date.now();
          broadcast("status", st.serverStatus, instanceId);
        }
      }
    }
  });

  st.mcProcess.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      addLog(instanceId, "ERROR", line);
    }
  });

  st.mcProcess.on("close", (code) => {
    addLog(instanceId, "INFO", `Servidor encerrado com código ${code}`);
    st.mcProcess = null;
    st.serverStatus = "stopped";
    st.startTime = null;
    broadcast("status", st.serverStatus, instanceId);
  });

  st.mcProcess.on("error", (err) => {
    addLog(instanceId, "ERROR", `Erro ao iniciar: ${err.message}`);
    st.mcProcess = null;
    st.serverStatus = "stopped";
    broadcast("status", st.serverStatus, instanceId);
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

function stopServer(instanceId) {
  const st = getInstanceState(instanceId);
  if (!st.mcProcess) return { error: "Servidor não está rodando" };
  st.serverStatus = "stopping";
  broadcast("status", st.serverStatus, instanceId);
  addLog(instanceId, "INFO", "Parando servidor...");
  st.mcProcess.stdin.write("stop\n");
  setTimeout(() => {
    if (st.mcProcess) {
      st.mcProcess.kill("SIGKILL");
      addLog(instanceId, "WARN", "Servidor forçado a parar (timeout)");
    }
  }, 30000);
  return { success: true };
}

function restartServer(instanceId, instanceDir) {
  const st = getInstanceState(instanceId);
  if (!st.mcProcess) return { error: "Servidor não está rodando" };
  st.serverStatus = "stopping";
  broadcast("status", st.serverStatus, instanceId);
  addLog(instanceId, "INFO", "Reiniciando servidor...");
  st.mcProcess.stdin.write("stop\n");

  const waitForStop = () => {
    if (!st.mcProcess) {
      setTimeout(() => startServer(instanceId, instanceDir), 1000);
    } else {
      setTimeout(waitForStop, 500);
    }
  };
  waitForStop();
  return { success: true };
}

function sendCommand(instanceId, command) {
  const st = getInstanceState(instanceId);
  if (!st.mcProcess) return { error: "Servidor não está rodando" };
  const cmd = command.startsWith("/") ? command.slice(1) : command;
  st.mcProcess.stdin.write(cmd + "\n");
  addLog(instanceId, "INFO", `> ${command}`);
  return { success: true };
}

// ===================== STATS =====================
async function getStats(instanceId, instanceDir) {
  const st = getInstanceState(instanceId);
  let cpu = 0;
  let ram = 0;
  let players = 0;

  if (st.mcProcess && st.mcProcess.pid) {
    try {
      const usage = await pidusage(st.mcProcess.pid);
      cpu = Math.round(usage.cpu * 100) / 100;
      ram = Math.round((usage.memory / 1024 / 1024 / 1024) * 100) / 100;
    } catch (_e) {}
  }

  let storage = 0;
  try {
    storage = getDirSizeMB(instanceDir);
  } catch (_e) {}

  if (st.serverStatus === "running" && st.mcProcess) {
    const recentJoins = st.logs.filter((l) => l.message.includes("joined the game")).length;
    const recentLeaves = st.logs.filter((l) => l.message.includes("left the game")).length;
    players = Math.max(0, recentJoins - recentLeaves);
  }

  const instForStats = findInstance(instanceId);
  const ownerForStats = instForStats != null ? Number(instForStats.ownerUserId) : null;
  const jvm = readJvmSettings(instanceDir, ownerForStats);

  return {
    cpu,
    maxCpu: MAX_CPU,
    ram,
    maxRam: formatMaxRamDisplayFromMb(jvm.maxRamMb),
    storage: Math.round(storage * 100) / 100,
    maxStorage: MAX_STORAGE,
    players,
    maxPlayers: MAX_PLAYERS,
    uptime: st.startTime ? Math.floor((Date.now() - st.startTime) / 1000) : 0,
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

// ===================== ROUTES: INSTANCES (lista / criar) =====================
app.get("/api/instances", (req, res) => {
  try {
    if (!userCanCreateInstances(req.user.id)) {
      return res.json({ instances: [] });
    }
    const reg = loadInstancesRegistry();
    const uid = Number(req.user.id);
    const mine = reg.instances.filter((i) => Number(i.ownerUserId) === uid);
    const out = mine.map((i) => {
      const st = getInstanceState(i.id);
      const dir = getInstancePath(i);
      const serverPort = getEffectiveServerPort(i, dir);
      return {
        id: i.id,
        name: i.name,
        mode: i.mode,
        status: st.serverStatus,
        serverPort,
        connectAddress: `${PUBLIC_HOST}:${serverPort}`,
      };
    });
    res.json({
      instances: out,
      hosting: {
        instanceCount: mine.length,
        maxInstances: resolveUserMaxInstances(uid),
        maxRamMbPerInstance: resolveUserRamCapMb(uid),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/instances", (req, res) => {
  try {
    if (!userCanCreateInstances(req.user.id)) {
      return res.status(403).json({
        error:
          "Sua conta ainda não pode criar servidores. Peça ao administrador para habilitar a hospedagem no painel de usuários.",
      });
    }
    const name = String(req.body?.name || "Novo servidor").trim() || "Novo servidor";
    const reg = loadInstancesRegistry();
    const uid = Number(req.user.id);
    const mine = reg.instances.filter((i) => Number(i.ownerUserId) === uid);
    const maxInst = resolveUserMaxInstances(uid);
    if (mine.length >= maxInst) {
      return res.status(403).json({
        error: `Limite de instâncias atingido (${maxInst}). Peça ao administrador para aumentar sua cota.`,
      });
    }
    const id = `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const serverPort = allocateNextServerPort(reg);
    reg.instances.push({ id, name, mode: "data", serverPort, ownerUserId: req.user.id });
    saveInstancesRegistry(reg);
    const dir = getInstancePath({ id, mode: "data" });
    ensureDir(dir);
    writeServerPortInProperties(dir, serverPort);
    const initialJvm = getDefaultJvmSettingsForNewUser(uid);
    writeJvmSettings(
      dir,
      {
        minRamMb: initialJvm.minRamMb,
        maxRamMb: initialJvm.maxRamMb,
        javaVersion: initialJvm.javaVersion,
        javaPath: initialJvm.javaPath,
        jarFile: initialJvm.jarFile,
        extraFlags: initialJvm.extraFlags,
        autoRestart: initialJvm.autoRestart,
        crashDetection: initialJvm.crashDetection,
        autoBackup: initialJvm.autoBackup,
        backupIntervalHours: initialJvm.backupIntervalHours,
      },
      uid
    );
    res.json({
      success: true,
      id,
      name,
      serverPort,
      connectAddress: `${PUBLIC_HOST}:${serverPort}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/instances/:id", (req, res) => {
  try {
    if (!userCanCreateInstances(req.user.id)) {
      return res.status(403).json({
        error:
          "Sua conta ainda não pode gerenciar servidores. Peça ao administrador para habilitar a hospedagem no painel de usuários.",
      });
    }
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido" });
    const reg = loadInstancesRegistry();
    const idx = reg.instances.findIndex((i) => i.id === id);
    if (idx === -1) return res.status(404).json({ error: "Instância não encontrada" });
    const inst = reg.instances[idx];
    if (Number(inst.ownerUserId) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Esta instância não pertence à sua conta." });
    }
    if (id === "default" || inst.mode === "legacy") {
      return res.status(400).json({ error: "A instância principal não pode ser removida." });
    }
    const st = getInstanceState(id);
    if (st.mcProcess) {
      return res.status(400).json({ error: "Pare o servidor antes de excluir a instância." });
    }
    if (st.installProgress && st.installProgress.status === "downloading") {
      return res.status(400).json({ error: "Aguarde o fim da instalação antes de excluir." });
    }
    const dir = getInstancePath(inst);
    reg.instances.splice(idx, 1);
    saveInstancesRegistry(reg);
    instanceStates.delete(id);
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("[pokt Craft] Falha ao remover pasta da instância:", e.message);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== ROUTES: JVM / host settings (persistido por instância) =====================
app.get("/api/instance-settings", (req, res) => {
  try {
    const settings = readJvmSettings(req.instanceDir, Number(req.user.id));
    const cap = resolveUserRamCapMb(req.user.id);
    res.json({ ...settings, ramQuotaMb: cap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/instance-settings", (req, res) => {
  try {
    const body = req.body || {};
    const minRamMb = parseInt(body.minRamMb, 10);
    const maxRamMb = parseInt(body.maxRamMb, 10);
    const patch = {
      javaVersion: body.javaVersion != null ? String(body.javaVersion) : undefined,
      javaPath: body.javaPath != null ? String(body.javaPath) : undefined,
      jarFile: body.jarFile != null ? String(body.jarFile) : undefined,
      extraFlags: body.extraFlags != null ? String(body.extraFlags) : undefined,
      autoRestart: typeof body.autoRestart === "boolean" ? body.autoRestart : undefined,
      crashDetection: typeof body.crashDetection === "boolean" ? body.crashDetection : undefined,
      autoBackup: typeof body.autoBackup === "boolean" ? body.autoBackup : undefined,
      backupIntervalHours: body.backupIntervalHours != null ? parseInt(body.backupIntervalHours, 10) : undefined,
    };
    if (Number.isFinite(minRamMb)) patch.minRamMb = Math.max(256, minRamMb);
    if (Number.isFinite(maxRamMb)) patch.maxRamMb = Math.max(256, maxRamMb);
    for (const k of Object.keys(patch)) {
      if (patch[k] === undefined) delete patch[k];
    }
    const st = getInstanceState(req.mchostInstanceId);
    const affectsJvm =
      body.minRamMb != null ||
      body.maxRamMb != null ||
      body.javaPath != null ||
      body.jarFile != null ||
      body.extraFlags != null ||
      body.javaVersion != null;
    if (st.mcProcess && affectsJvm) {
      return res.status(400).json({ error: "Pare o servidor antes de alterar memória, Java ou flags JVM" });
    }
    const saved = writeJvmSettings(req.instanceDir, patch, Number(req.user.id));
    const cap = resolveUserRamCapMb(req.user.id);
    res.json({ success: true, settings: saved, ramQuotaMb: cap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== ROUTES: SERVER CONTROL =====================
app.post("/api/server/start", (req, res) => {
  const result = startServer(req.mchostInstanceId, req.instanceDir);
  res.json(result);
});

app.post("/api/server/stop", (req, res) => {
  const result = stopServer(req.mchostInstanceId);
  res.json(result);
});

app.post("/api/server/restart", (req, res) => {
  const result = restartServer(req.mchostInstanceId, req.instanceDir);
  res.json(result);
});

app.post("/api/server/command", (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "Comando é obrigatório" });
  const result = sendCommand(req.mchostInstanceId, command);
  res.json(result);
});

app.get("/api/server/status", (req, res) => {
  const st = getInstanceState(req.mchostInstanceId);
  const inst = findInstance(req.mchostInstanceId);
  const port = getEffectiveServerPort(inst, req.instanceDir);
  res.json({
    status: st.serverStatus,
    publicHost: PUBLIC_HOST,
    gamePort: port,
    connectAddress: `${PUBLIC_HOST}:${port}`,
  });
});

app.get("/api/server/stats", async (req, res) => {
  const stats = await getStats(req.mchostInstanceId, req.instanceDir);
  res.json(stats);
});

app.get("/api/server/logs", (req, res) => {
  const st = getInstanceState(req.mchostInstanceId);
  const limit = parseInt(req.query.limit) || 500;
  res.json(st.logs.slice(-limit));
});

// ===================== ROUTES: FILE MANAGER =====================
function resolveSafePath(instanceDir, relativePath) {
  const resolved = path.resolve(instanceDir, relativePath || "");
  if (!resolved.startsWith(path.resolve(instanceDir))) {
    throw new Error("Acesso negado: caminho fora do diretório do servidor");
  }
  return resolved;
}

app.get("/api/files", (req, res) => {
  try {
    const dirPath = resolveSafePath(req.instanceDir, req.query.path || "");
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
    const filePath = resolveSafePath(req.instanceDir, req.query.path);
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/files/content", (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const resolved = resolveSafePath(req.instanceDir, filePath);
    fs.writeFileSync(resolved, content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/files/create", (req, res) => {
  try {
    const { path: filePath, type } = req.body;
    const resolved = resolveSafePath(req.instanceDir, filePath);
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
    const filePath = resolveSafePath(req.instanceDir, req.query.path);
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
    const filePath = resolveSafePath(req.instanceDir, req.query.path);
    res.download(filePath);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Upload
const upload = multer({ dest: path.join(__dirname, "tmp_uploads") });

app.post("/api/files/upload", upload.array("files"), (req, res) => {
  try {
    const targetDir = resolveSafePath(req.instanceDir, req.body.path || "");
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

function instanceBackupDir(instanceId) {
  const d = path.join(BACKUP_DIR, instanceId);
  ensureDir(d);
  return d;
}

// ===================== ROUTES: BACKUPS =====================
app.get("/api/backups", (req, res) => {
  const bdir = instanceBackupDir(req.mchostInstanceId);
  try {
    const entries = fs.readdirSync(bdir);
    const backups = entries
      .filter((f) => f.endsWith(".tar.gz") || f.endsWith(".zip"))
      .map((f) => {
        const stat = fs.statSync(path.join(bdir, f));
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
  const bdir = instanceBackupDir(req.mchostInstanceId);
  const now = new Date();
  const name = `backup_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}.tar.gz`;
  const outPath = path.join(bdir, name);

  try {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("tar", { gzip: true });
    archive.pipe(output);
    archive.directory(req.instanceDir, false);

    output.on("close", () => {
      addLog(req.mchostInstanceId, "INFO", `Backup criado: ${name} (${formatSize(archive.pointer())})`);
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
  const backupPath = path.join(instanceBackupDir(req.mchostInstanceId), path.basename(req.query.name));
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: "Backup não encontrado" });
  }
  res.download(backupPath);
});

app.delete("/api/backups", (req, res) => {
  const backupPath = path.join(instanceBackupDir(req.mchostInstanceId), path.basename(req.query.name));
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
    const propsPath = path.join(req.instanceDir, "server.properties");
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
    const propsPath = path.join(req.instanceDir, "server.properties");
    const props = req.body;
    let content = "#Minecraft server properties\n#Modified by pokt Craft\n";
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
    mod.get(url, { headers: { "User-Agent": "poktCraft/1.0" } }, (res) => {
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
    mod.get(url, { headers: { "User-Agent": "poktCraft/1.0" } }, (res) => {
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

async function downloadFileWithFallback(urls, dest, instanceId) {
  let lastError = null;
  for (const url of urls) {
    try {
      await downloadFile(url, dest);
      return;
    } catch (err) {
      lastError = err;
      addLog(instanceId, "WARN", `Falha ao baixar de ${url}: ${err.message}`);
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
function getCurrentServerInfo(instanceDir) {
  const infoPath = path.join(instanceDir, ".mchost_server_info.json");
  if (fs.existsSync(infoPath)) {
    try { return JSON.parse(fs.readFileSync(infoPath, "utf-8")); } catch (_e) {}
  }
  return null;
}

function saveServerInfo(instanceDir, info) {
  const infoPath = path.join(instanceDir, ".mchost_server_info.json");
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), "utf-8");
}

app.get("/api/versions/current", (req, res) => {
  const info = getCurrentServerInfo(req.instanceDir);
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
app.post("/api/versions/install", async (req, res) => {
  const { type, version } = req.body;
  const instanceId = req.mchostInstanceId;
  const instanceDir = req.instanceDir;
  const st = getInstanceState(instanceId);
  if (!type || !version) return res.status(400).json({ error: "Tipo e versão são obrigatórios" });
  if (st.mcProcess) return res.status(400).json({ error: "Pare o servidor antes de trocar a versão" });

  const instMeta = findInstance(instanceId);
  const ownerJvm = instMeta != null ? Number(instMeta.ownerUserId) : null;
  const jvm = readJvmSettings(instanceDir, ownerJvm);
  const jarName = jvm.jarFile || JAR_FILE;
  const javaBin = jvm.javaPath || JAVA_PATH;

  const previousInstall = getCurrentServerInfo(instanceDir);
  if (previousInstall && previousInstall.type) {
    wipeInstanceForFullReinstall(instanceId, instanceDir, instMeta);
  }

  st.installProgress = { type, version, status: "downloading", progress: 0 };
  broadcast("install_progress", st.installProgress, instanceId);

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

      st.installProgress.status = "downloading";
      broadcast("install_progress", st.installProgress, instanceId);
      addLog(instanceId, "INFO", `Baixando ${type} ${version}...`);

      const jarPath = path.join(instanceDir, jarName);
      if (fs.existsSync(jarPath)) {
        fs.unlinkSync(jarPath);
        addLog(instanceId, "INFO", "server.jar antigo removido.");
      }

      ensureDir(instanceDir);
      await downloadFileWithFallback(spigotUrls, jarPath, instanceId);
      clearStartProfile(instanceDir);
      saveServerInfo(instanceDir, { type, version, installedAt: new Date().toISOString() });

      st.installProgress = { type, version, status: "done", progress: 100 };
      broadcast("install_progress", st.installProgress, instanceId);
      addLog(instanceId, "INFO", `${type} ${version} instalado com sucesso!`);
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
      const installerPath = path.join(instanceDir, installerName);
      await downloadFile(installerUrl, installerPath);
      addLog(instanceId, "INFO", `Executando installer do Forge ${version}-${forgeVersion}...`);
      await runProcess(instanceId, javaBin, ["-jar", installerName, "--installServer"], instanceDir);

      const argsFile = getForgeLikeArgsFile(instanceDir, "forge");
      if (!argsFile) throw new Error("Instalação concluída, mas arquivo de argumentos do Forge não foi encontrado");
      saveStartProfile(instanceDir, { mode: "argsFile", argsFile, type: "forge", installedAt: new Date().toISOString() });

      if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
      saveServerInfo(instanceDir, { type, version: `${version}-${forgeVersion}`, installedAt: new Date().toISOString() });
      st.installProgress = { type, version: `${version}-${forgeVersion}`, status: "done", progress: 100 };
      broadcast("install_progress", st.installProgress, instanceId);
      addLog(instanceId, "INFO", `forge ${version}-${forgeVersion} instalado com sucesso!`);
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
      const installerPath = path.join(instanceDir, installerName);
      await downloadFile(installerUrl, installerPath);
      addLog(instanceId, "INFO", `Executando installer do NeoForge ${fullVersion}...`);
      await runProcess(instanceId, javaBin, ["-jar", installerName, "--installServer"], instanceDir);

      const argsFile = getForgeLikeArgsFile(instanceDir, "neoforge");
      if (!argsFile) throw new Error("Instalação concluída, mas arquivo de argumentos do NeoForge não foi encontrado");
      saveStartProfile(instanceDir, { mode: "argsFile", argsFile, type: "neoforge", installedAt: new Date().toISOString() });

      if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
      saveServerInfo(instanceDir, { type, version: fullVersion, installedAt: new Date().toISOString() });
      st.installProgress = { type, version: fullVersion, status: "done", progress: 100 };
      broadcast("install_progress", st.installProgress, instanceId);
      addLog(instanceId, "INFO", `neoforge ${fullVersion} instalado com sucesso!`);
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

    st.installProgress.status = "downloading";
    broadcast("install_progress", st.installProgress, instanceId);
    addLog(instanceId, "INFO", `Baixando ${type} ${version}...`);

    const jarPath = path.join(instanceDir, jarName);
    if (fs.existsSync(jarPath)) {
      fs.unlinkSync(jarPath);
      addLog(instanceId, "INFO", "server.jar antigo removido.");
    }

    ensureDir(instanceDir);
    await downloadFile(downloadUrl, jarPath);
    clearStartProfile(instanceDir);

    saveServerInfo(instanceDir, { type, version, installedAt: new Date().toISOString() });

    st.installProgress = { type, version, status: "done", progress: 100 };
    broadcast("install_progress", st.installProgress, instanceId);
    addLog(instanceId, "INFO", `${type} ${version} instalado com sucesso!`);

    res.json({ success: true });
  } catch (err) {
    st.installProgress = { type, version, status: "error", error: err.message };
    broadcast("install_progress", st.installProgress, instanceId);
    addLog(instanceId, "ERROR", `Erro ao instalar ${type} ${version}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/versions/install/progress", (req, res) => {
  const st = getInstanceState(req.mchostInstanceId);
  res.json(st.installProgress || { status: "idle" });
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
    const pluginsDir = path.join(req.instanceDir, "plugins");
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
    const pluginsDir = path.join(req.instanceDir, "plugins");
    ensureDir(pluginsDir);

    const urlObj = new URL(url);
    const rawName = sanitizePluginName(name) || sanitizePluginName(path.basename(urlObj.pathname)) || "plugin.jar";
    const fileName = rawName.toLowerCase().endsWith(".jar") ? rawName : `${rawName}.jar`;
    const dest = path.join(pluginsDir, fileName);

    await downloadFile(url, dest);
    addLog(req.mchostInstanceId, "INFO", `Plugin instalado: ${fileName}`);
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
    const modsDir = path.join(req.instanceDir, "mods");
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

    const modsDir = path.join(req.instanceDir, "mods");
    ensureDir(modsDir);
    const safeName = sanitizePluginName(file.filename || `${projectId}.jar`);
    const finalName = safeName.toLowerCase().endsWith(".jar") ? safeName : `${safeName}.jar`;
    const dest = path.join(modsDir, finalName);

    await downloadFile(file.url, dest);
    addLog(req.mchostInstanceId, "INFO", `Mod instalado: ${finalName}`);
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
  if (clients.size === 0) return;
  const ids = new Set();
  for (const ws of clients) {
    if (ws.readyState === 1 && ws.mchostInstanceId) ids.add(ws.mchostInstanceId);
  }
  for (const instanceId of ids) {
    const inst = findInstance(instanceId);
    if (!inst) continue;
    const instanceDir = getInstancePath(inst);
    const stats = await getStats(instanceId, instanceDir);
    broadcast("stats", stats, instanceId);
  }
}, 3000);

// ===================== START =====================
server.listen(PORT, () => {
  loadInstancesRegistry();
  console.log(`pokt Craft Backend rodando na porta ${PORT}`);
  console.log(`Instância legada (default): ${LEGACY_SERVER_DIR}`);
  console.log(`Novas instâncias em: ${INSTANCES_DATA_DIR}`);
  console.log(`JAR padrão: ${JAR_FILE}`);
  ensureDir(LEGACY_SERVER_DIR);
  ensureDir(INSTANCES_DATA_DIR);
  ensureDir(BACKUP_DIR);
});
