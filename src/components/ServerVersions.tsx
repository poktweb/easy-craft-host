import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Zap, ArrowRight, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { SERVER_EDITION_TYPES, ServerTypeCard } from "@/components/serverEdition/ServerEditionTypes";
import {
  setApiInstanceId,
  apiGetCurrentServerInfo,
  apiListServerVersions,
  apiInstallServerVersion,
} from "@/lib/api";

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

export default function ServerVersions() {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const [currentInfo, setCurrentInfo] = useState<CurrentInfo | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress>({ status: "idle" });
  const [versionsUiTab, setVersionsUiTab] = useState<"browse" | "install">("browse");

  useEffect(() => {
    setApiInstanceId(instanceId);
  }, [instanceId]);

  useEffect(() => {
    setCurrentInfo(null);
    void apiGetCurrentServerInfo().then(setCurrentInfo).catch(() => {});
  }, [instanceId]);

  const loadVersions = useCallback(async (type: string) => {
    setSelectedType(type);
    setVersions([]);
    setSelectedVersion("");
    setLoadingVersions(true);
    try {
      const data = await apiListServerVersions(type);
      if (data.versions) {
        setVersions(data.versions);
        setSelectedVersion(data.versions[0] || "");
      }
    } catch {
      toast.error("Erro ao carregar versões");
    } finally {
      setLoadingVersions(false);
    }
    setVersionsUiTab("install");
  }, []);

  const handleInstall = async () => {
    if (!selectedType || !selectedVersion) return;
    setInstalling(true);
    setInstallProgress({ status: "downloading", type: selectedType, version: selectedVersion });
    try {
      const data = await apiInstallServerVersion(selectedType, selectedVersion);
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
    plugins: SERVER_EDITION_TYPES.filter((s) => s.category === "plugins"),
    vanilla: SERVER_EDITION_TYPES.filter((s) => s.category === "vanilla"),
    modded: SERVER_EDITION_TYPES.filter((s) => s.category === "modded"),
  };

  const pickBrowse = () => {
    setSelectedType(null);
    setVersionsUiTab("browse");
  };

  return (
    <div className="space-y-6">
      {currentInfo && currentInfo.type !== "unknown" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Servidor atual: <span className="text-primary capitalize">{currentInfo.type}</span> — versão{" "}
                <span className="text-primary">{currentInfo.version}</span>
              </p>
              {currentInfo.installedAt && (
                <p className="text-xs text-muted-foreground">Instalado em {new Date(currentInfo.installedAt).toLocaleString("pt-BR")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={versionsUiTab} onValueChange={(v) => setVersionsUiTab(v as "browse" | "install")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="browse">Edição</TabsTrigger>
          <TabsTrigger value="install" disabled={!selectedType}>
            Instalar versão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6 mt-6">
          <Card
            className="border-border/50 hover:border-primary/40 transition-colors cursor-pointer group"
            onClick={pickBrowse}
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

          <p className="text-sm text-muted-foreground">
            Aqui você escolhe a <span className="font-medium text-foreground">edição do servidor</span> (Vanilla, Paper, Spigot, Forge,
            NeoForge, Fabric, etc.) e a <span className="font-medium text-foreground">versão do Minecraft</span>. Ao clicar em um tipo, o
            painel abre <span className="font-medium text-foreground">Instalar versão</span>. As abas{" "}
            <span className="font-medium text-foreground">Plugins</span> e <span className="font-medium text-foreground">Mods</span> servem
            só para baixar plugins (.jar) e mods no servidor já instalado — não substituem esta escolha.
          </p>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Plugins</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryGroups.plugins.map((server) => (
                <ServerTypeCard
                  key={server.id}
                  server={server}
                  isSelected={selectedType === server.id}
                  isCurrent={currentInfo?.type === server.id}
                  onSelect={() => void loadVersions(server.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Vanilla</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryGroups.vanilla.map((server) => (
                <ServerTypeCard
                  key={server.id}
                  server={server}
                  isSelected={selectedType === server.id}
                  isCurrent={currentInfo?.type === server.id}
                  onSelect={() => void loadVersions(server.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Mods</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryGroups.modded.map((server) => (
                <ServerTypeCard
                  key={server.id}
                  server={server}
                  isSelected={selectedType === server.id}
                  isCurrent={currentInfo?.type === server.id}
                  onSelect={() => void loadVersions(server.id)}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="install" className="mt-6">
          {!selectedType ? (
            <Card className="border-border/50">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Volte à aba <span className="font-medium text-foreground">Edição</span> e escolha um tipo de servidor (Paper, Spigot,
                Vanilla, Fabric, Forge, NeoForge, etc.).
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/30 bg-card">
              <CardContent className="py-6 space-y-4">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  Instalar {SERVER_EDITION_TYPES.find((s) => s.id === selectedType)?.name}
                </h3>

                {loadingVersions ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando versões...
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Selecione a versão" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button onClick={handleInstall} disabled={installing || !selectedVersion} className="gap-2">
                      {installing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Instalando...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          {currentInfo && currentInfo.type && currentInfo.type !== "unknown" ? "Reinstalar" : "Instalar"}
                        </>
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
                  ⚠️ O servidor deve estar parado.
                  {currentInfo && currentInfo.type && currentInfo.type !== "unknown"
                    ? " Reinstalar apaga mundos, plugins, mods e arquivos do servidor nesta instância; em seguida a nova versão é baixada. A porta do jogo e as configurações JVM do painel são mantidas."
                    : " Na primeira instalação, apenas o servidor é baixado."}
                </p>
                {(selectedType === "forge" || selectedType === "neoforge") && (
                  <p className="text-xs text-muted-foreground">
                    Para Forge/NeoForge, o painel usa o instalador oficial e configura a inicialização automaticamente.
                  </p>
                )}

                <Button variant="outline" size="sm" onClick={pickBrowse}>
                  Voltar à escolha de edição
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
