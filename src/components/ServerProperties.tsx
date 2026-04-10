import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function ServerProperties() {
  const [props, setProps] = useState({
    motd: "§6§l Servidor SMP+ §r§f- §aBem-vindo!",
    maxPlayers: "20",
    difficulty: "hard",
    gamemode: "survival",
    pvp: true,
    onlineMode: true,
    allowFlight: false,
    spawnNpcs: true,
    spawnAnimals: true,
    spawnMonsters: true,
    viewDistance: "10",
    serverPort: "25565",
    whiteList: false,
    enableCommandBlock: false,
  });

  const update = (key: string, value: string | boolean) => setProps(p => ({ ...p, [key]: value }));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label>MOTD (Mensagem do Servidor)</Label>
        <Input value={props.motd} onChange={e => update("motd", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Jogadores</Label>
          <Input type="number" value={props.maxPlayers} onChange={e => update("maxPlayers", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Porta</Label>
          <Input type="number" value={props.serverPort} onChange={e => update("serverPort", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dificuldade</Label>
          <Select value={props.difficulty} onValueChange={v => update("difficulty", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="peaceful">Peaceful</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Modo de Jogo</Label>
          <Select value={props.gamemode} onValueChange={v => update("gamemode", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="survival">Survival</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="adventure">Adventure</SelectItem>
              <SelectItem value="spectator">Spectator</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>View Distance</Label>
        <Input type="number" value={props.viewDistance} onChange={e => update("viewDistance", e.target.value)} />
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        {[
          { key: "pvp", label: "PVP" },
          { key: "onlineMode", label: "Modo Online (Original)" },
          { key: "allowFlight", label: "Permitir Voo" },
          { key: "spawnNpcs", label: "Spawn NPCs" },
          { key: "spawnAnimals", label: "Spawn Animais" },
          { key: "spawnMonsters", label: "Spawn Monstros" },
          { key: "whiteList", label: "White List" },
          { key: "enableCommandBlock", label: "Blocos de Comando" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label>{label}</Label>
            <Switch checked={props[key as keyof typeof props] as boolean} onCheckedChange={v => update(key, v)} />
          </div>
        ))}
      </div>

      <Button onClick={() => toast.success("Propriedades salvas! Reinicie o servidor para aplicar.")}>
        Salvar Propriedades
      </Button>
    </div>
  );
}
