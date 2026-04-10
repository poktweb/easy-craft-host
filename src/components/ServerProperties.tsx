import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiGetProperties, apiSaveProperties } from "@/lib/api";

const BOOL_PROPS = ["pvp", "online-mode", "allow-flight", "spawn-npcs", "spawn-animals", "spawn-monsters", "white-list", "enable-command-block"];

export default function ServerProperties() {
  const [props, setProps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetProperties().then(data => {
      setProps(data);
      setLoading(false);
    }).catch(() => {
      toast.error("Erro ao carregar propriedades");
      setLoading(false);
    });
  }, []);

  const update = (key: string, value: string) => setProps(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    const res = await apiSaveProperties(props);
    if (res.success) toast.success("Propriedades salvas! Reinicie o servidor para aplicar.");
    else toast.error(res.error);
  };

  if (loading) return <div className="text-muted-foreground">Carregando propriedades...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label>MOTD (Mensagem do Servidor)</Label>
        <Input value={props["motd"] || ""} onChange={e => update("motd", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Jogadores</Label>
          <Input type="number" value={props["max-players"] || "20"} onChange={e => update("max-players", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Porta</Label>
          <Input type="number" value={props["server-port"] || "25565"} onChange={e => update("server-port", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dificuldade</Label>
          <Select value={props["difficulty"] || "hard"} onValueChange={v => update("difficulty", v)}>
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
          <Select value={props["gamemode"] || "survival"} onValueChange={v => update("gamemode", v)}>
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
        <Input type="number" value={props["view-distance"] || "10"} onChange={e => update("view-distance", e.target.value)} />
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        {[
          { key: "pvp", label: "PVP" },
          { key: "online-mode", label: "Modo Online (Original)" },
          { key: "allow-flight", label: "Permitir Voo" },
          { key: "spawn-npcs", label: "Spawn NPCs" },
          { key: "spawn-animals", label: "Spawn Animais" },
          { key: "spawn-monsters", label: "Spawn Monstros" },
          { key: "white-list", label: "White List" },
          { key: "enable-command-block", label: "Blocos de Comando" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label>{label}</Label>
            <Switch
              checked={props[key] === "true"}
              onCheckedChange={v => update(key, v ? "true" : "false")}
            />
          </div>
        ))}
      </div>

      <Button onClick={handleSave}>Salvar Propriedades</Button>
    </div>
  );
}
