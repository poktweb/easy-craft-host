import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import {
  setApiInstanceId,
  apiGetCurrentServerInfo,
  apiListServerVersions,
  apiModsCatalog,
  apiListMods,
  apiInstallMod,
} from "@/lib/api";

interface CurrentInfo {
  type: string;
  version: string;
  installedAt?: string;
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

export default function ServerModsPage() {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const [currentInfo, setCurrentInfo] = useState<CurrentInfo | null>(null);
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

  useEffect(() => {
    setApiInstanceId(instanceId);
  }, [instanceId]);

  useEffect(() => {
    setCurrentInfo(null);
    void apiGetCurrentServerInfo().then(setCurrentInfo).catch(() => {});
  }, [instanceId]);

  const selectedOrCurrentType = currentInfo?.type || "";
  const supportsMods = ["fabric", "forge", "neoforge"].includes(selectedOrCurrentType);
  const selectedOrCurrentVersion = currentInfo?.version || "";
  const gameVersion = (selectedOrCurrentVersion.match(/\d+\.\d+(?:\.\d+)?/) || [""])[0];

  useEffect(() => {
    if (supportsMods) setModsLoader(selectedOrCurrentType);
  }, [supportsMods, selectedOrCurrentType]);

  useEffect(() => {
    if (gameVersion) setModsVersion(gameVersion);
  }, [gameVersion]);

  useEffect(() => {
    void apiListServerVersions("vanilla", 80)
      .then((data) => {
        if (Array.isArray(data?.versions)) setAvailableMcVersions(data.versions);
      })
      .catch(() => {});
  }, []);

  const loadMods = useCallback(
    async (append = false) => {
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
        const [catalogData, installedData] = await Promise.all([
          apiModsCatalog({
            serverType: selectedOrCurrentType,
            loader: modsLoader,
            version: modsVersion,
            q: modsQuery,
            offset: nextOffset,
            limit: 24,
          }),
          apiListMods(),
        ]);
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
    },
    [supportsMods, modsVersion, selectedOrCurrentType, modsLoader, modsQuery, modsOffset]
  );

  useEffect(() => {
    loadMods(false);
  }, [supportsMods, selectedOrCurrentType, modsVersion, modsLoader]);

  const handleInstallMod = async (mod: ModItem) => {
    if (!supportsMods) {
      toast.error("Instale primeiro Fabric, Forge ou NeoForge (aba Versões) para usar mods.");
      return;
    }
    if (!modsVersion) {
      toast.error("Selecione uma versão válida do Minecraft para instalar mods");
      return;
    }

    setInstallingModId(mod.id);
    try {
      const data = await apiInstallMod({
        projectId: mod.id,
        serverType: selectedOrCurrentType || undefined,
        loader: modsLoader,
        gameVersion: modsVersion,
      });
      if (data.error) {
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Mods</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Esta aba é só para <span className="font-medium text-foreground">pesquisar e instalar mods</span> no servidor. Fabric, Forge,
          NeoForge e a versão do jogo são definidos em <span className="font-medium text-foreground">Versões</span> — são edições do
          servidor, não “mods” desta lista.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="py-6 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Instalar Mods
          </h3>

          {!supportsMods && (
            <p className="text-sm text-muted-foreground">
              Para instalar mods, o servidor precisa estar em modo compatível:{" "}
              <span className="font-medium">Fabric, Forge ou NeoForge</span> (instale na aba Versões).
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
                  {availableMcVersions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
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
                      <Button size="sm" onClick={() => handleInstallMod(mod)} disabled={installingModId !== null}>
                        {installingModId === mod.id ? "Instalando..." : "Instalar"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{mod.description}</p>
                    <p className="text-xs text-muted-foreground">{mod.downloads.toLocaleString("pt-BR")} downloads</p>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={() => loadMods(true)} disabled={loadingMods || modsCatalog.length >= modsTotalHits}>
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
                  <Badge key={mod} variant="secondary">
                    {mod}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
