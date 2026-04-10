const Database = require("better-sqlite3");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const path = require("path");

const DB_PATH = process.env.MC_AUTH_DB || path.join(__dirname, "mchost.db");
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_EXPIRY = "24h";

// Initialize database
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const password_hash = hashPassword(password, salt);
  try {
    db.prepare("INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)").run(username, password_hash, salt);
    return { success: true };
  } catch (err) {
    if (err.message.includes("UNIQUE")) return { error: "Usuário já existe" };
    return { error: err.message };
  }
}

function verifyUser(username, password) {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
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
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get();
  return row.count > 0;
}

function changePassword(userId, oldPassword, newPassword) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return { error: "Usuário não encontrado" };
  const hash = hashPassword(oldPassword, user.salt);
  if (hash !== user.password_hash) return { error: "Senha atual incorreta" };
  const salt = crypto.randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, salt);
  db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(newHash, salt, userId);
  return { success: true };
}

// Auth middleware
function authMiddleware(req, res, next) {
  // Skip auth for login/setup routes
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

// Auto-create default admin if no users exist
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
