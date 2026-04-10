import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";

export default function ServerSettings() {
  const [settings, setSettings] = useState({
    javaVersion: "17",
    ramAllocation: "2048",
    startupFlags: "-Xms512M -Xmx2048M -jar server.jar nogui",
    autoRestart: true,
    crashDetection: true,
    autoBackup: true,
    backupInterval: "24",
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label>Versão do Java</Label>
        <Select value={settings.javaVersion} onValueChange={v => setSettings(s => ({ ...s, javaVersion: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="8">Java 8</SelectItem>
            <SelectItem value="11">Java 11</SelectItem>
            <SelectItem value="17">Java 17</SelectItem>
            <SelectItem value="21">Java 21</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Alocação de RAM (MB)</Label>
        <Input type="number" value={settings.ramAllocation} onChange={e => setSettings(s => ({ ...s, ramAllocation: e.target.value }))} />
      </div>

      <div className="space-y-2">
        <Label>Flags de Inicialização</Label>
        <Input value={settings.startupFlags} onChange={e => setSettings(s => ({ ...s, startupFlags: e.target.value }))} className="font-mono text-sm" />
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <Label>Auto Restart em Crash</Label>
          <Switch checked={settings.autoRestart} onCheckedChange={v => setSettings(s => ({ ...s, autoRestart: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Detecção de Crash</Label>
          <Switch checked={settings.crashDetection} onCheckedChange={v => setSettings(s => ({ ...s, crashDetection: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Backup Automático</Label>
          <Switch checked={settings.autoBackup} onCheckedChange={v => setSettings(s => ({ ...s, autoBackup: v }))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Intervalo de Backup (horas)</Label>
        <Input type="number" value={settings.backupInterval} onChange={e => setSettings(s => ({ ...s, backupInterval: e.target.value }))} />
      </div>

      <Button onClick={() => toast.success("Configurações salvas!")}>Salvar Configurações</Button>
    </div>
  );
}
