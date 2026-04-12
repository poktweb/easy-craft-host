import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Settings, Eye, Globe, ArrowRight } from "lucide-react";

export interface ServerEditionType {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  category: "plugins" | "vanilla" | "modded";
}

export const SERVER_EDITION_TYPES: ServerEditionType[] = [
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

export function ServerTypeCard({
  server,
  isSelected,
  isCurrent,
  onSelect,
}: {
  server: ServerEditionType;
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
            {isCurrent && (
              <Badge variant="secondary" className="text-xs">
                Atual
              </Badge>
            )}
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <h3 className="font-bold text-foreground">{server.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
      </CardContent>
    </Card>
  );
}
