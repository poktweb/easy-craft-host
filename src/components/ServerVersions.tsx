import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Settings, Eye, Globe, ArrowRight, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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
    id: "vanilla",
    name: "Vanilla",
    description: "Servidor oficial do Minecraft sem modificações.",
    icon: <Globe className="h-6 w-6" />,
    category: "vanilla",
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

  // Fetch current server info
  useEffect(() => {
    fetch(`${API_URL}/api/versions/current`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then(setCurrentInfo)
      .catch(() => {});
  }, []);

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

  const categoryGroups = {
    plugins: SERVER_TYPES.filter((s) => s.category === "plugins"),
    vanilla: SERVER_TYPES.filter((s) => s.category === "vanilla"),
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
          </CardContent>
        </Card>
      )}
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
