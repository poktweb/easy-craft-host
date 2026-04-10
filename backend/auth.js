const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const path = require("path");

// JSON puro — evita better-sqlite3 (compilação nativa que trava npm install em muitas VMs).
// MC_AUTH_DATA: caminho do ficheiro JSON. Se só existir MC_AUTH_DB (legado SQLite), usa o mesmo diretório com sufixo -auth.json.
const DATA_PATH =
  process.env.MC_AUTH_DATA ||
  (process.env.MC_AUTH_DB
    ? process.env.MC_AUTH_DB.replace(/\.db$/i, "-auth.json")
    : path.join(__dirname, "mchost-auth.json"));

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_EXPIRY = "24h";

/** Login fixo de administrador (pode sobrescrever com MC_ADMIN_USER). Só este usuário acessa o painel de liberação. */
const ADMIN_USERNAME = String(process.env.MC_ADMIN_USER || "poktweb").toLowerCase();

/** @type {{ users: Array<{ id: number; username: string; password_hash: string; salt: string; canHost?: boolean }>; nextId: number }} */
let state = { users: [], nextId: 1 };

function loadState() {
  if (!fs.existsSync(DATA_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    state.users = Array.isArray(parsed.users) ? parsed.users : [];
    state.nextId = typeof parsed.nextId === "number" && parsed.nextId > 0 ? parsed.nextId : 1;
  } catch (err) {
    console.error("MC Auth: erro ao carregar", DATA_PATH, err.message);
    state = { users: [], nextId: 1 };
  }
}

function saveState() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${DATA_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, DATA_PATH);
}

loadState();

function migrateUserFlags() {
  let changed = false;
  for (const u of state.users) {
    if (u.canHost === undefined) {
      u.canHost = u.username.toLowerCase() === ADMIN_USERNAME;
      changed = true;
    }
  }
  if (changed) {
    try {
      saveState();
    } catch (e) {
      console.error("MC Auth: migrateUserFlags save:", e.message);
    }
  }
}

migrateUserFlags();

function isAdminUsername(username) {
  return String(username || "").toLowerCase() === ADMIN_USERNAME;
}

/** ID numérico do usuário administrador (poktweb / MC_ADMIN_USER), para migração de instâncias. */
function getAdminUserId() {
  const u = state.users.find((x) => isAdminUsername(x.username));
  return u ? u.id : null;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

/**
 * @param {string} username
 * @param {string} password
 * @param {{ canHost?: boolean }} [opts]
 */
function createUser(username, password, opts = {}) {
  const salt = crypto.randomBytes(16).toString("hex");
  const password_hash = hashPassword(password, salt);
  const uname = String(username || "").trim();
  if (!uname) return { error: "Usuário inválido" };
  if (state.users.some((u) => u.username === uname)) {
    return { error: "Usuário já existe" };
  }
  let canHost = opts.canHost === true;
  if (isAdminUsername(uname)) canHost = true;
  const id = state.nextId++;
  state.users.push({ id, username: uname, password_hash, salt, canHost });
  try {
    saveState();
    return { success: true, id };
  } catch (err) {
    state.users.pop();
    state.nextId--;
    return { error: err.message };
  }
}

/** Cadastro público: sempre sem permissão para criar servidores até o admin habilitar. */
function registerUser(username, password) {
  if (!password || String(password).length < 4) {
    return { error: "Senha deve ter pelo menos 4 caracteres" };
  }
  return createUser(username, password, { canHost: false });
}

function verifyUser(username, password) {
  const user = state.users.find((u) => u.username === username);
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) return null;
  return { id: user.id, username: user.username };
}

function getUserById(userId) {
  return state.users.find((u) => u.id === userId) || null;
}

function authProfileForUserId(userId) {
  const u = getUserById(userId);
  if (!u) return { canHost: false, isAdmin: false };
  const canHost = u.canHost === true || isAdminUsername(u.username);
  return { canHost, isAdmin: isAdminUsername(u.username) };
}

function userCanCreateInstances(userId) {
  return authProfileForUserId(userId).canHost;
}

function listUsersForAdmin() {
  return state.users.map((u) => ({
    id: u.id,
    username: u.username,
    canHost: u.canHost === true || isAdminUsername(u.username),
    isAdmin: isAdminUsername(u.username),
  }));
}

function setUserCanHost(actorUserId, targetUserId, canHost) {
  const actor = getUserById(actorUserId);
  if (!actor || !isAdminUsername(actor.username)) {
    return { error: "Apenas o administrador pode alterar permissões" };
  }
  const target = getUserById(targetUserId);
  if (!target) return { error: "Usuário não encontrado" };
  if (isAdminUsername(target.username)) {
    return { error: "A conta de administrador sempre pode hospedar" };
  }
  target.canHost = !!canHost;
  try {
    saveState();
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function hasUsers() {
  return state.users.length > 0;
}

function changePassword(userId, oldPassword, newPassword) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { error: "Usuário não encontrado" };
  const hash = hashPassword(oldPassword, user.salt);
  if (hash !== user.password_hash) return { error: "Senha atual incorreta" };
  const salt = crypto.randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, salt);
  user.password_hash = newHash;
  user.salt = salt;
  try {
    saveState();
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

function authMiddleware(req, res, next) {
  // Com app.use("/api", authMiddleware), req.path costuma ser "/auth/..." (sem prefixo /api).
  const p = req.path || "";
  if (p === "/auth/login" || p === "/auth/setup" || p === "/auth/status" || p === "/auth/register") {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
  req.user = decoded;
  next();
}

if (!hasUsers()) {
  createUser("poktweb", "84005787", { canHost: true });
  console.log("Usuário padrão criado: poktweb");
}

module.exports = {
  createUser,
  registerUser,
  verifyUser,
  generateToken,
  verifyToken,
  hasUsers,
  changePassword,
  authMiddleware,
  authProfileForUserId,
  userCanCreateInstances,
  isAdminUsername,
  getAdminUserId,
  listUsersForAdmin,
  setUserCanHost,
};
