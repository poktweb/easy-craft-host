function getDefaultApiUrl() {
  if (typeof window === "undefined") return "http://localhost:3001";
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:3001`;
}

const API_URL = import.meta.env.VITE_API_URL || getDefaultApiUrl();
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

export { API_URL, WS_URL };

let currentInstanceId = "default";

export function setApiInstanceId(id: string) {
  currentInstanceId = id && id.length ? id : "default";
}

export function getApiInstanceId() {
  return currentInstanceId;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("mchost_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MCHost-Instance": currentInstanceId,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function getAuthHeaderOnly(): Record<string, string> {
  const token = localStorage.getItem("mchost_token");
  const h: Record<string, string> = { "X-MCHost-Instance": currentInstanceId };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function authFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...((options.headers as Record<string, string>) || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("mchost_token");
    localStorage.removeItem("mchost_user");
    window.location.reload();
  }
  return res;
}

// ===================== SERVER CONTROL =====================
export async function apiStartServer() {
  const res = await authFetch(`${API_URL}/api/server/start`, { method: "POST" });
  return res.json();
}

export async function apiStopServer() {
  const res = await authFetch(`${API_URL}/api/server/stop`, { method: "POST" });
  return res.json();
}

export async function apiRestartServer() {
  const res = await authFetch(`${API_URL}/api/server/restart`, { method: "POST" });
  return res.json();
}

export async function apiSendCommand(command: string) {
  const res = await authFetch(`${API_URL}/api/server/command`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
  return res.json();
}

export async function apiGetStatus() {
  const res = await authFetch(`${API_URL}/api/server/status`);
  return res.json();
}

export async function apiGetStats() {
  const res = await authFetch(`${API_URL}/api/server/stats`);
  return res.json();
}

// ===================== FILES =====================
export async function apiListFiles(dirPath: string = "") {
  const res = await authFetch(`${API_URL}/api/files?path=${encodeURIComponent(dirPath)}`);
  return res.json();
}

export async function apiReadFile(filePath: string) {
  const res = await authFetch(`${API_URL}/api/files/content?path=${encodeURIComponent(filePath)}`);
  return res.json();
}

export async function apiSaveFile(filePath: string, content: string) {
  const res = await authFetch(`${API_URL}/api/files/content`, {
    method: "PUT",
    body: JSON.stringify({ path: filePath, content }),
  });
  return res.json();
}

export async function apiCreateFileOrFolder(filePath: string, type: "file" | "folder") {
  const res = await authFetch(`${API_URL}/api/files/create`, {
    method: "POST",
    body: JSON.stringify({ path: filePath, type }),
  });
  return res.json();
}

export async function apiDeleteFile(filePath: string) {
  const res = await authFetch(`${API_URL}/api/files?path=${encodeURIComponent(filePath)}`, {
    method: "DELETE",
  });
  return res.json();
}

export function getDownloadUrl(filePath: string) {
  return `${API_URL}/api/files/download?path=${encodeURIComponent(filePath)}`;
}

export async function apiUploadFiles(files: FileList, targetPath: string) {
  const formData = new FormData();
  formData.append("path", targetPath);
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  const res = await fetch(`${API_URL}/api/files/upload`, {
    method: "POST",
    headers: getAuthHeaderOnly(),
    body: formData,
  });
  return res.json();
}

// ===================== BACKUPS =====================
export async function apiListBackups() {
  const res = await authFetch(`${API_URL}/api/backups`);
  return res.json();
}

export async function apiCreateBackup() {
  const res = await authFetch(`${API_URL}/api/backups/create`, { method: "POST" });
  return res.json();
}

export function getBackupDownloadUrl(name: string) {
  return `${API_URL}/api/backups/download?name=${encodeURIComponent(name)}`;
}

export async function apiDeleteBackup(name: string) {
  const res = await authFetch(`${API_URL}/api/backups?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return res.json();
}

// ===================== PROPERTIES =====================
export async function apiGetProperties() {
  const res = await authFetch(`${API_URL}/api/properties`);
  return res.json();
}

export async function apiSaveProperties(props: Record<string, string>) {
  const res = await authFetch(`${API_URL}/api/properties`, {
    method: "PUT",
    body: JSON.stringify(props),
  });
  return res.json();
}

// ===================== INSTANCES & JVM SETTINGS =====================
export async function apiListInstances() {
  const res = await authFetch(`${API_URL}/api/instances`);
  return res.json();
}

export async function apiCreateInstance(name: string) {
  const res = await authFetch(`${API_URL}/api/instances`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export interface AdminUserRow {
  id: number;
  username: string;
  canHost: boolean;
  isAdmin: boolean;
}

export async function apiAdminListUsers(): Promise<AdminUserRow[]> {
  const res = await authFetch(`${API_URL}/api/admin/users`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro ao listar usuários");
  return data as AdminUserRow[];
}

export async function apiAdminSetCanHost(userId: number, canHost: boolean): Promise<{ success?: boolean; error?: string }> {
  const res = await authFetch(`${API_URL}/api/admin/users/${userId}/can-host`, {
    method: "PATCH",
    body: JSON.stringify({ canHost }),
  });
  return res.json();
}

export async function apiGetInstanceSettings() {
  const res = await authFetch(`${API_URL}/api/instance-settings`);
  return res.json();
}

export async function apiPutInstanceSettings(body: Record<string, unknown>) {
  const res = await authFetch(`${API_URL}/api/instance-settings`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.json();
}
