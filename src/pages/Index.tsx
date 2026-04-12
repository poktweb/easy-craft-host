import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Terminal,
  FolderOpen,
  Settings2,
  Archive,
  Wrench,
  Wifi,
  WifiOff,
  LogOut,
  Shield,
  Box,
  ArrowLeft,
  Plug,
  Puzzle,
} from "lucide-react";
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
import ServerVersions, { type VersionInstallIntent } from "@/components/ServerVersions";
import ServerPluginsPage from "@/components/ServerPluginsPage";
import ServerModsPage from "@/components/ServerModsPage";

const Index = () => {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { username, logout, canHost } = useAuth();
  const [panelReady, setPanelReady] = useState(false);
  const [connectAddress, setConnectAddress] = useState<string | null>(null);

  setApiInstanceId(instanceId);
  const server = useServerState(instanceId);
  type SidebarTab = "console" | "files" | "properties" | "backups" | "versions" | "plugins" | "mods" | "settings";
  const [tab, setTab] = useState<SidebarTab>("console");
  const [versionInstallIntent, setVersionInstallIntent] = useState<VersionInstallIntent | null>(null);

  const clearVersionInstallIntent = useCallback(() => {
    setVersionInstallIntent(null);
  }, []);

  const requestVersionInstall = useCallback((type: string) => {
    setVersionInstallIntent({ type, nonce: Date.now() });
    setTab("versions");
  }, []);

  useEffect(() => {
    setVersionInstallIntent(null);
  }, [instanceId]);

  useEffect(() => {
    if (!canHost) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    setPanelReady(false);
    apiListInstances()
      .then((data) => {
        if (cancelled) return;
        const list = data.instances;
        if (!list.some((x) => x.id === instanceId)) {
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

  const navItems: { value: SidebarTab; label: string; icon: typeof Terminal }[] = [
    { value: "console", label: "Console", icon: Terminal },
    { value: "files", label: "Arquivos", icon: FolderOpen },
    { value: "properties", label: "Propriedades", icon: Settings2 },
    { value: "backups", label: "Backups", icon: Archive },
    { value: "versions", label: "Versões", icon: Box },
    { value: "plugins", label: "Plugins", icon: Plug },
    { value: "mods", label: "Mods", icon: Puzzle },
    { value: "settings", label: "Configurações", icon: Wrench },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full">
        <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
          <SidebarHeader className="border-b border-sidebar-border gap-3 p-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" asChild>
                <Link to="/" title="Voltar às instâncias">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/30">
                <span className="text-lg font-bold text-sidebar-primary">MC</span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-bold text-sidebar-foreground">pokt Craft</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{instanceId}</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Painel</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map(({ value, label, icon: Icon }) => (
                    <SidebarMenuItem key={value}>
                      <SidebarMenuButton
                        isActive={tab === value}
                        onClick={() => setTab(value)}
                        tooltip={label}
                      >
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-card/80 px-4 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 items-center justify-end gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                {server.connected ? (
                  <>
                    <Wifi className="h-4 w-4 text-success" />
                    <span className="text-xs font-medium text-success">Conectado</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-medium text-destructive">Desconectado</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{username}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </header>

          <main className="container flex-1 py-8 space-y-8">
            <ServerHeader
              status={server.status}
              stats={server.stats}
              onStart={server.startServer}
              onStop={server.stopServer}
              onRestart={server.restartServer}
              connectAddress={connectAddress}
            />

            <ServerStatsBar stats={server.stats} />

            <div className="pt-0">
              {tab === "console" && (
                <ServerConsole logs={server.logs} stats={server.stats} status={server.status} onSendCommand={server.sendCommand} />
              )}
              {tab === "files" && <FileManager />}
              {tab === "properties" && <ServerProperties />}
              {tab === "backups" && <ServerBackups />}
              {tab === "versions" && (
                <ServerVersions versionInstallIntent={versionInstallIntent} onConsumedVersionInstallIntent={clearVersionInstallIntent} />
              )}
              {tab === "plugins" && <ServerPluginsPage onChooseEditionForInstall={requestVersionInstall} />}
              {tab === "mods" && <ServerModsPage onChooseEditionForInstall={requestVersionInstall} />}
              {tab === "settings" && <ServerSettings />}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Index;
