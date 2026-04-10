import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Settings, Eye, Globe, ArrowRight, Download, Loader2, CheckCircle2, AlertCircle, Plug, Link2 } from "lucide-react";
import { API_URL } from "@/lib/api";

interface ServerType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "plugins" | "vanilla" | "modded";
}

const SERVER_TYPES: ServerType[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Vanilla com suporte a plugins e otimizações (Recomendado)",
    icon: <Settings className="h-6 w-6" />,
    category: "plugins",
  },
  {
    id: "purpur",
    name: "Purpur",
    description: "Vanilla com suporte a plugins e otimizações extras.",
    icon: <Eye className="h-6 w-6" />,
    category: "plugins",
  },
  {
    id: "spigot",
    name: "Spigot",
    description: "Clássico para plugins, amplo suporte da comunidade.",
    icon: <Settings className="h-6 w-6" />,
    category: "plugins",
  },
  {
    id: "vanilla",
    name: "Vanilla",
    description: "Servidor oficial do Minecraft sem modificações.",
    icon: <Globe className="h-6 w-6" />,
    category: "vanilla",
  },
  {
    id: "folia",
    name: "Folia",
    description: "Fork do Paper focado em alto desempenho com paralelismo.",
    icon: <Zap className="h-6 w-6" />,
    category: "plugins",
  },
  {
    id: "fabric",
    name: "Fabric",
    description: "Modloader leve e moderno para mods.",
    icon: <Zap className="h-6 w-6" />,
    category: "modded",
  },
  {
    id: "forge",
    name: "Forge",
    description: "Modloader clássico com ampla compatibilidade de mods.",
    icon: <Settings className="h-6 w-6" />,
    category: "modded",
  },
  {
    id: "neoforge",
    name: "NeoForge",
    description: "Sucessor moderno do Forge para mods.",
    icon: <Eye className="h-6 w-6" />,
    category: "modded",
  },
];

interface CurrentInfo {
  type: string;
  version: string;
  installedAt?: string;
}

interface InstallProgress {
  status: "idle" | "downloading" | "done" | "error";
  type?: string;
  version?: string;
  error?: string;
}

interface ModItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
  iconUrl?: string | null;
  author?: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("mchost_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export default function ServerVersions() {
  const [currentInfo, setCurrentInfo] = useState<CurrentInfo | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress>({ status: "idle" });
  const [pluginUrl, setPluginUrl] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [plugins, setPlugins] = useState<string[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState(false);
  const [modsCatalog, setModsCatalog] = useState<ModItem[]>([]);
  const [installedMods, setInstalledMods] = useState<string[]>([]);
  const [loadingMods, setLoadingMods] = useState(false);
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [modsTotalHits, setModsTotalHits] = useState(0);
  const [modsOffset, setModsOffset] = useState(0);
  const [modsLoader, setModsLoader] = useState<string>("fabric");
  const [modsVersion, setModsVersion] = useState<string>("");
  const [modsQuery, setModsQuery] = useState("");
  const [availableMcVersions, setAvailableMcVersions] = useState<string[]>([]);

  // Fetch current server info
  useEffect(() => {
    fetch(`${API_URL}/api/versions/current`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then(setCurrentInfo)
      .catch(() => {});
  }, []);

  const loadPlugins = useCallback(async () => {
    setLoadingPlugins(true);
    try {
      const res = await fetch(`${API_URL}/api/plugins/list`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setPlugins(data);
    } catch {
      // Silencioso: apenas lista auxiliar
    } finally {
      setLoadingPlugins(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  // Fetch versions when type selected
  const loadVersions = useCallback(async (type: string) => {
    setSelectedType(type);
    setVersions([]);
    setSelectedVersion("");
    setLoadingVersions(true);
    try {
      const res = await fetch(`${API_URL}/api/versions/${type}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.versions) {
        setVersions(data.versions);
        setSelectedVersion(data.versions[0] || "");
      }
    } catch {
      toast.error("Erro ao carregar versões");
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const handleInstall = async () => {
    if (!selectedType || !selectedVersion) return;
    setInstalling(true);
    setInstallProgress({ status: "downloading", type: selectedType, version: selectedVersion });
    try {
      const res = await fetch(`${API_URL}/api/versions/install`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: selectedType, version: selectedVersion }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setInstallProgress({ status: "error", error: data.error });
      } else {
        toast.success(`${selectedType} ${selectedVersion} instalado com sucesso!`);
        setInstallProgress({ status: "done", type: selectedType, version: selectedVersion });
        setCurrentInfo({ type: selectedType, version: selectedVersion, installedAt: new Date().toISOString() });
      }
    } catch {
      toast.error("Erro ao instalar servidor");
      setInstallProgress({ status: "error", error: "Erro de conexão" });
    } finally {
      setInstalling(false);
    }
  };

  const selectedOrCurrentType = selectedType || currentInfo?.type || "";
  const supportsPlugins = ["paper", "purpur", "folia", "spigot"].includes(selectedOrCurrentType);
  const supportsMods = ["fabric", "forge", "neoforge"].includes(selectedOrCurrentType);
  const selectedOrCurrentVersion = selectedVersion || currentInfo?.version || "";
  const gameVersion = (selectedOrCurrentVersion.match(/\d+\.\d+(?:\.\d+)?/) || [""])[0];

  useEffect(() => {
    if (supportsMods) setModsLoader(selectedOrCurrentType);
  }, [supportsMods, selectedOrCurrentType]);

  useEffect(() => {
    if (gameVersion) setModsVersion(gameVersion);
  }, [gameVersion]);

  useEffect(() => {
    fetch(`${API_URL}/api/versions/vanilla?limit=80`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.versions)) setAvailableMcVersions(data.versions);
      })
      .catch(() => {});
  }, []);

  const loadMods = useCallback(async (append = false) => {
    if (!supportsMods || !modsVersion) {
      setModsCatalog([]);
      setInstalledMods([]);
      setModsTotalHits(0);
      setModsOffset(0);
      return;
    }
    setLoadingMods(true);
    const nextOffset = append ? modsOffset + 24 : 0;
    try {
      const [catalogRes, installedRes] = await Promise.all([
        fetch(
          `${API_URL}/api/mods/catalog?serverType=${encodeURIComponent(selectedOrCurrentType)}&loader=${encodeURIComponent(modsLoader)}&version=${encodeURIComponent(modsVersion)}&q=${encodeURIComponent(modsQuery)}&offset=${nextOffset}&limit=24`,
          { headers: getAuthHeaders() }
        ),
        fetch(`${API_URL}/api/mods/list`, { headers: getAuthHeaders() }),
      ]);
      const [catalogData, installedData] = await Promise.all([catalogRes.json(), installedRes.json()]);
      const incoming = Array.isArray(catalogData?.mods) ? catalogData.mods : [];
      setModsCatalog((prev) => (append ? [...prev, ...incoming] : incoming));
      setModsTotalHits(Number(catalogData?.totalHits || 0));
      setModsOffset(nextOffset);
      setInstalledMods(Array.isArray(installedData) ? installedData : []);
    } catch {
      toast.error("Erro ao carregar catálogo de mods");
    } finally {
      setLoadingMods(false);
    }
  }, [supportsMods, modsVersion, selectedOrCurrentType, modsLoader, modsQuery, modsOffset]);

  useEffect(() => {
    loadMods(false);
  }, [supportsMods, selectedOrCurrentType, modsVersion, modsLoader]);

  const handleInstallPlugin = async () => {
    if (!pluginUrl.trim()) {
      toast.error("Informe a URL direta do plugin (.jar)");
      return;
    }
    if (!supportsPlugins) {
      toast.error("Selecione um modo compatível com plugins (Paper, Purpur, Folia ou Spigot)");
      return;
    }

    setInstallingPlugin(true);
    try {
      const res = await fetch(`${API_URL}/api/plugins/install`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          url: pluginUrl.trim(),
          name: pluginName.trim() || undefined,
          serverType: selectedOrCurrentType,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Falha ao instalar plugin");
        return;
      }
      toast.success(`Plugin ${data.name || "instalado"} com sucesso!`);
      setPluginUrl("");
      setPluginName("");
      await loadPlugins();
    } catch {
      toast.error("Erro ao baixar plugin");
    } finally {
      setInstallingPlugin(false);
    }
  };

  const handleInstallMod = async (mod: ModItem) => {
    if (!supportsMods) {
      toast.error("Selecione Fabric, Forge ou NeoForge para instalar mods");
      return;
    }
    if (!gameVersion) {
      toast.error("Selecione uma versão válida do Minecraft para instalar mods");
      return;
    }

    setInstallingModId(mod.id);
    try {
      const res = await fetch(`${API_URL}/api/mods/install`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          projectId: mod.id,
          serverType: selectedOrCurrentType || undefined,
          loader: modsLoader,
          gameVersion: modsVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Falha ao instalar mod");
        return;
      }
      toast.success(`Mod ${data.name || mod.title} instalado com sucesso!`);
      await loadMods(false);
    } catch {
      toast.error("Erro ao instalar mod");
    } finally {
      setInstallingModId(null);
    }
  };

  const categoryGroups = {
    plugins: SERVER_TYPES.filter((s) => s.category === "plugins"),
    vanilla: SERVER_TYPES.filter((s) => s.category === "vanilla"),
    modded: SERVER_TYPES.filter((s) => s.category === "modded"),
  };

  return (
    <div className="space-y-8">
      {/* Current server info */}
      {currentInfo && currentInfo.type !== "unknown" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Servidor atual: <span className="text-primary capitalize">{currentInfo.type}</span> — versão <span className="text-primary">{currentInfo.version}</span>
              </p>
              {currentInfo.installedAt && (
                <p className="text-xs text-muted-foreground">
                  Instalado em {new Date(currentInfo.installedAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change edition card */}
      <Card
        className="border-border/50 hover:border-primary/40 transition-colors cursor-pointer group"
        onClick={() => setSelectedType(null)}
      >
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground">Alterar Edição Do Minecraft</h3>
            <p className="text-sm text-muted-foreground">Escolha a edição do Minecraft que você deseja!</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardContent>
      </Card>

      {/* Plugins category */}
      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">Plugins</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryGroups.plugins.map((server) => (
            <ServerTypeCard
              key={server.id}
              server={server}
              isSelected={selectedType === server.id}
              isCurrent={currentInfo?.type === server.id}
              onSelect={() => loadVersions(server.id)}
            />
          ))}
        </div>
      </div>

      {/* Vanilla category */}
      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">Vanilla</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryGroups.vanilla.map((server) => (
            <ServerTypeCard
              key={server.id}
              server={server}
              isSelected={selectedType === server.id}
              isCurrent={currentInfo?.type === server.id}
              onSelect={() => loadVersions(server.id)}
            />
          ))}
        </div>
      </div>

      {/* Modloaders category */}
      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">Mods</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryGroups.modded.map((server) => (
            <ServerTypeCard
              key={server.id}
              server={server}
              isSelected={selectedType === server.id}
              isCurrent={currentInfo?.type === server.id}
              onSelect={() => loadVersions(server.id)}
            />
          ))}
        </div>
      </div>

      {/* Version selector */}
      {selectedType && (
        <Card className="border-primary/30 bg-card">
          <CardContent className="py-6 space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Instalar {SERVER_TYPES.find((s) => s.id === selectedType)?.name}
            </h3>

            {loadingVersions ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando versões...
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Selecione a versão" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleInstall}
                  disabled={installing || !selectedVersion}
                  className="gap-2"
                >
                  {installing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Instalando...</>
                  ) : (
                    <><Download className="h-4 w-4" />Instalar</>
                  )}
                </Button>
              </div>
            )}

            {installProgress.status === "error" && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {installProgress.error}
              </div>
            )}

            {installProgress.status === "done" && (
              <div className="flex items-center gap-2 text-primary text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Instalação concluída! Inicie o servidor para usar a nova versão.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              ⚠️ O servidor deve estar parado. O server.jar atual será substituído.
            </p>
            {(selectedType === "forge" || selectedType === "neoforge") && (
              <p className="text-xs text-muted-foreground">
                Para Forge/NeoForge, o painel usa o instalador oficial e configura a inicialização automaticamente.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plugin installer */}
      <Card className="border-border/50">
        <CardContent className="py-6 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            Instalar Plugins
          </h3>

          {!supportsPlugins && (
            <p className="text-sm text-muted-foreground">
              Para instalar plugins, escolha um modo compatível: <span className="font-medium">Paper, Purpur, Folia ou Spigot</span>.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="URL direta do plugin .jar"
              value={pluginUrl}
              onChange={(e) => setPluginUrl(e.target.value)}
              disabled={!supportsPlugins || installingPlugin}
            />
            <Input
              placeholder="Nome opcional (sem .jar)"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              disabled={!supportsPlugins || installingPlugin}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleInstallPlugin} disabled={!supportsPlugins || installingPlugin || !pluginUrl.trim()} className="gap-2">
              {installingPlugin ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Baixando plugin...</>
              ) : (
                <><Link2 className="h-4 w-4" />Baixar Plugin</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">Use links diretos para arquivos `.jar`.</p>
          </div>

          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-sm font-medium text-foreground mb-2">Plugins já baixados</p>
            {loadingPlugins ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : plugins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum plugin encontrado na pasta `plugins`.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {plugins.map((plugin) => (
                  <Badge key={plugin} variant="secondary">{plugin}</Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mod installer */}
      <Card className="border-border/50">
        <CardContent className="py-6 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Instalar Mods
          </h3>

          {!supportsMods && (
            <p className="text-sm text-muted-foreground">
              Para instalar mods, escolha um modo compatível: <span className="font-medium">Fabric, Forge ou NeoForge</span>.
            </p>
          )}

          {supportsMods && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                placeholder="Pesquisar mods..."
                value={modsQuery}
                onChange={(e) => setModsQuery(e.target.value)}
                disabled={loadingMods}
              />
              <Select value={modsLoader} onValueChange={setModsLoader}>
                <SelectTrigger>
                  <SelectValue placeholder="Loader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fabric">Fabric</SelectItem>
                  <SelectItem value="forge">Forge</SelectItem>
                  <SelectItem value="neoforge">NeoForge</SelectItem>
                </SelectContent>
              </Select>
              <Select value={modsVersion} onValueChange={setModsVersion}>
                <SelectTrigger>
                  <SelectValue placeholder="Versão do Minecraft" />
                </SelectTrigger>
                <SelectContent>
                  {(availableMcVersions.length > 0 ? availableMcVersions : versions).map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => loadMods(false)} disabled={loadingMods || !modsVersion}>
                Buscar
              </Button>
            </div>
          )}

          {loadingMods ? (
            <p className="text-sm text-muted-foreground">Carregando mods...</p>
          ) : supportsMods && modsCatalog.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Exibindo {modsCatalog.length} de {modsTotalHits.toLocaleString("pt-BR")} mods.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {modsCatalog.map((mod) => (
                  <div key={mod.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                        <p className="text-xs text-muted-foreground">{mod.author || "Autor desconhecido"}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleInstallMod(mod)}
                        disabled={installingModId !== null}
                      >
                        {installingModId === mod.id ? "Instalando..." : "Instalar"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{mod.description}</p>
                    <p className="text-xs text-muted-foreground">{mod.downloads.toLocaleString("pt-BR")} downloads</p>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => loadMods(true)}
                disabled={loadingMods || modsCatalog.length >= modsTotalHits}
              >
                Carregar mais mods
              </Button>
            </div>
          ) : supportsMods ? (
            <p className="text-sm text-muted-foreground">Nenhum mod encontrado para esta combinação de loader/versão.</p>
          ) : null}

          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-sm font-medium text-foreground mb-2">Mods já baixados</p>
            {loadingMods ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : installedMods.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum mod encontrado na pasta `mods`.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {installedMods.map((mod) => (
                  <Badge key={mod} variant="secondary">{mod}</Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServerTypeCard({
  server,
  isSelected,
  isCurrent,
  onSelect,
}: {
  server: ServerType;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:border-primary/40 ${
        isSelected ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20" : "border-border/50"
      }`}
      onClick={onSelect}
    >
      <CardContent className="py-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/50 text-muted-foreground">
            {server.icon}
          </div>
          <div className="flex items-center gap-2">
            {isCurrent && <Badge variant="secondary" className="text-xs">Atual</Badge>}
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <h3 className="font-bold text-foreground">{server.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
      </CardContent>
    </Card>
  );
}
