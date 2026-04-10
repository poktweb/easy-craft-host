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

/** @type {{ users: Array<{ id: number; username: string; password_hash: string; salt: string }>; nextId: number }} */
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

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const password_hash = hashPassword(password, salt);
  if (state.users.some((u) => u.username === username)) {
    return { error: "Usuário já existe" };
  }
  const id = state.nextId++;
  state.users.push({ id, username, password_hash, salt });
  try {
    saveState();
    return { success: true };
  } catch (err) {
    state.users.pop();
    state.nextId--;
    return { error: err.message };
  }
}

function verifyUser(username, password) {
  const user = state.users.find((u) => u.username === username);
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) return null;
  return { id: user.id, username: user.username };
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
  if (req.path === "/api/auth/login" || req.path === "/api/auth/setup" || req.path === "/api/auth/status") {
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
  createUser("poktweb", "84005787");
  console.log("Usuário padrão criado: poktweb");
}

module.exports = {
  createUser,
  verifyUser,
  generateToken,
  verifyToken,
  hasUsers,
  changePassword,
  authMiddleware,
};
