import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plug, Link2, Loader2 } from "lucide-react";
import { setApiInstanceId, apiGetCurrentServerInfo, apiListPlugins, apiInstallPlugin } from "@/lib/api";

interface CurrentInfo {
  type: string;
  version: string;
  installedAt?: string;
}

export default function ServerPluginsPage() {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const [currentInfo, setCurrentInfo] = useState<CurrentInfo | null>(null);
  const [pluginUrl, setPluginUrl] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [plugins, setPlugins] = useState<string[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState(false);

  useEffect(() => {
    setApiInstanceId(instanceId);
  }, [instanceId]);

  useEffect(() => {
    setCurrentInfo(null);
    void apiGetCurrentServerInfo().then(setCurrentInfo).catch(() => {});
  }, [instanceId]);

  const loadPlugins = useCallback(async () => {
    setLoadingPlugins(true);
    try {
      setPlugins(await apiListPlugins());
    } catch {
      // silencioso
    } finally {
      setLoadingPlugins(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const selectedOrCurrentType = currentInfo?.type || "";
  const supportsPlugins = ["paper", "purpur", "folia", "spigot"].includes(selectedOrCurrentType);

  const handleInstallPlugin = async () => {
    if (!pluginUrl.trim()) {
      toast.error("Informe a URL direta do plugin (.jar)");
      return;
    }
    if (!supportsPlugins) {
      toast.error("Instale primeiro Paper, Purpur, Folia ou Spigot (aba Versões) para usar plugins.");
      return;
    }

    setInstallingPlugin(true);
    try {
      const data = await apiInstallPlugin({
        url: pluginUrl.trim(),
        name: pluginName.trim() || undefined,
        serverType: selectedOrCurrentType,
      });
      if (data.error) {
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Plugins</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Esta aba é só para <span className="font-medium text-foreground">baixar e gerir plugins</span> (.jar na pasta do servidor).
          Paper, Spigot, Purpur, Folia e a versão do Minecraft são escolhidos em{" "}
          <span className="font-medium text-foreground">Versões</span>.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="py-6 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            Instalar Plugins
          </h3>

          {!supportsPlugins && (
            <p className="text-sm text-muted-foreground">
              Para instalar plugins .jar, o servidor precisa estar em modo compatível:{" "}
              <span className="font-medium">Paper, Purpur, Folia ou Spigot</span> (instale na aba Versões).
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Baixando plugin...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  Baixar Plugin
                </>
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
                  <Badge key={plugin} variant="secondary">
                    {plugin}
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
