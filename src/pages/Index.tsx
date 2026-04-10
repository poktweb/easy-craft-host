import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, FolderOpen, Settings2, Archive, Wrench, Wifi, WifiOff, LogOut, Shield, Box, ArrowLeft } from "lucide-react";
import { setApiInstanceId, apiListInstances, apiGetStatus } from "@/lib/api";
import { useServerState } from "@/hooks/useServerState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ServerHeader from "@/components/ServerHeader";
import ServerStatsBar from "@/components/ServerStats";
import ServerConsole from "@/components/ServerConsole";
import FileManager from "@/components/FileManager";
import ServerProperties from "@/components/ServerProperties";
import ServerBackups from "@/components/ServerBackups";
import ServerSettings from "@/components/ServerSettings";
import ServerVersions from "@/components/ServerVersions";

const Index = () => {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { username, logout, canHost } = useAuth();
  const [panelReady, setPanelReady] = useState(false);
  const [connectAddress, setConnectAddress] = useState<string | null>(null);

  setApiInstanceId(instanceId);
  const server = useServerState(instanceId);
  const [tab, setTab] = useState("console");

  useEffect(() => {
    if (!canHost) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    setPanelReady(false);
    apiListInstances()
      .then((list) => {
        if (cancelled) return;
        if (!Array.isArray(list) || !list.some((x) => x.id === instanceId)) {
          navigate("/", { replace: true });
          return;
        }
        setPanelReady(true);
      })
      .catch(() => navigate("/", { replace: true }));
    return () => {
      cancelled = true;
    };
  }, [canHost, instanceId, navigate]);

  useEffect(() => {
    if (!panelReady) return;
    setApiInstanceId(instanceId);
    apiGetStatus()
      .then((d) => {
        if (d && typeof d === "object" && "connectAddress" in d && typeof (d as { connectAddress?: string }).connectAddress === "string") {
          setConnectAddress((d as { connectAddress: string }).connectAddress);
        }
      })
      .catch(() => setConnectAddress(null));
  }, [panelReady, instanceId]);

  if (!panelReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground text-sm">Verificando instância…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link to="/" title="Voltar às instâncias">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 border border-primary/30 glow-primary">
              <span className="text-lg font-bold text-primary glow-text">MC</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-bold text-foreground leading-tight">MCHost</span>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] sm:max-w-xs">
                Instância: {instanceId}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm">
              {server.connected ? (
                <><Wifi className="h-4 w-4 text-success" /><span className="text-success text-xs font-medium">Conectado</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-destructive" /><span className="text-destructive text-xs font-medium">Desconectado</span></>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-destructive gap-1.5">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <ServerHeader
          status={server.status}
          stats={server.stats}
          onStart={server.startServer}
          onStop={server.stopServer}
          onRestart={server.restartServer}
          connectAddress={connectAddress}
        />

        <ServerStatsBar stats={server.stats} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-transparent border-b border-border/50 rounded-none w-full justify-start gap-1 h-auto p-0">
            {[
              { value: "console", label: "Console", icon: Terminal },
              { value: "files", label: "Arquivos", icon: FolderOpen },
              { value: "properties", label: "Propriedades", icon: Settings2 },
              { value: "backups", label: "Backups", icon: Archive },
              { value: "versions", label: "Versões", icon: Box },
              { value: "settings", label: "Configurações", icon: Wrench },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="pt-6">
            <TabsContent value="console" className="m-0">
              <ServerConsole logs={server.logs} stats={server.stats} status={server.status} onSendCommand={server.sendCommand} />
            </TabsContent>
            <TabsContent value="files" className="m-0">
              <FileManager />
            </TabsContent>
            <TabsContent value="properties" className="m-0">
              <ServerProperties />
            </TabsContent>
            <TabsContent value="backups" className="m-0">
              <ServerBackups />
            </TabsContent>
            <TabsContent value="versions" className="m-0">
              <ServerVersions />
            </TabsContent>
            <TabsContent value="settings" className="m-0">
              <ServerSettings />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
