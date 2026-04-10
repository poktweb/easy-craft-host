import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, FolderOpen, Settings2, Archive, Wrench, User } from "lucide-react";
import { useServerState } from "@/hooks/useServerState";
import ServerHeader from "@/components/ServerHeader";
import ServerStatsBar from "@/components/ServerStats";
import ServerConsole from "@/components/ServerConsole";
import FileManager from "@/components/FileManager";
import ServerProperties from "@/components/ServerProperties";
import ServerBackups from "@/components/ServerBackups";
import ServerSettings from "@/components/ServerSettings";

const Index = () => {
  const server = useServerState();
  const [tab, setTab] = useState("console");

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">MC</span>
            </div>
            <span className="text-lg font-bold text-foreground">MCHost</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Admin</span>
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
        />

        <ServerStatsBar stats={server.stats} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-transparent border-b rounded-none w-full justify-start gap-1 h-auto p-0">
            {[
              { value: "console", label: "Console", icon: Terminal },
              { value: "files", label: "Gerenciador de Arquivos", icon: FolderOpen },
              { value: "properties", label: "Propriedades", icon: Settings2 },
              { value: "backups", label: "Backups", icon: Archive },
              { value: "settings", label: "Configurações", icon: Wrench },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-muted-foreground"
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
              <FileManager files={server.files} currentPath={server.currentPath} onNavigate={server.setCurrentPath} serverProperties={server.serverProperties} />
            </TabsContent>
            <TabsContent value="properties" className="m-0">
              <ServerProperties />
            </TabsContent>
            <TabsContent value="backups" className="m-0">
              <ServerBackups />
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
