import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { apiGetInstanceSettings, apiPutInstanceSettings, setApiInstanceId } from "@/lib/api";
import { useParams } from "react-router-dom";

export default function ServerSettings() {
  const { instanceId = "default" } = useParams<{ instanceId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    javaVersion: "17",
    minRamMb: 512,
    maxRamMb: 2048,
    javaPath: "",
    jarFile: "server.jar",
    extraFlags: "",
    autoRestart: true,
    crashDetection: true,
    autoBackup: true,
    backupIntervalHours: 24,
  });

  const load = useCallback(async () => {
    setApiInstanceId(instanceId);
    setLoading(true);
    try {
      const data = await apiGetInstanceSettings();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setSettings((prev) => ({
        ...prev,
        javaVersion: String(data.javaVersion ?? prev.javaVersion),
        minRamMb: Number(data.minRamMb) || prev.minRamMb,
        maxRamMb: Number(data.maxRamMb) || prev.maxRamMb,
        javaPath: String(data.javaPath ?? ""),
        jarFile: String(data.jarFile ?? prev.jarFile),
        extraFlags: String(data.extraFlags ?? ""),
        autoRestart: typeof data.autoRestart === "boolean" ? data.autoRestart : prev.autoRestart,
        crashDetection: typeof data.crashDetection === "boolean" ? data.crashDetection : prev.crashDetection,
        autoBackup: typeof data.autoBackup === "boolean" ? data.autoBackup : prev.autoBackup,
        backupIntervalHours: Number(data.backupIntervalHours) || prev.backupIntervalHours,
      }));
    } catch {
      toast.error("Não foi possível carregar as configurações");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setApiInstanceId(instanceId);
    setSaving(true);
    try {
      const res = await apiPutInstanceSettings({
        javaVersion: settings.javaVersion,
        minRamMb: settings.minRamMb,
        maxRamMb: settings.maxRamMb,
        javaPath: settings.javaPath.trim() || undefined,
        jarFile: settings.jarFile.trim() || "server.jar",
        extraFlags: settings.extraFlags,
        autoRestart: settings.autoRestart,
        crashDetection: settings.crashDetection,
        autoBackup: settings.autoBackup,
        backupIntervalHours: settings.backupIntervalHours,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.settings) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
      }
      toast.success("Configurações salvas no servidor. Reinicie o Minecraft para aplicar RAM/Java.");
    } catch {
      toast.error("Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Carregando configurações…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">
        A RAM máxima abaixo é aplicada ao iniciar o processo Java (-Xmx). Para uma VPS de 8 GB, valores típicos são 6144–7168 MB para o jogo, deixando memória para o sistema.
      </p>

      <div className="space-y-2">
        <Label>Versão do Java (referência)</Label>
        <Select value={settings.javaVersion} onValueChange={(v) => setSettings((s) => ({ ...s, javaVersion: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="8">Java 8</SelectItem>
            <SelectItem value="11">Java 11</SelectItem>
            <SelectItem value="17">Java 17</SelectItem>
            <SelectItem value="21">Java 21</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>RAM mínima (MB)</Label>
          <Input
            type="number"
            min={256}
            value={settings.minRamMb}
            onChange={(e) => setSettings((s) => ({ ...s, minRamMb: parseInt(e.target.value, 10) || 256 }))}
          />
        </div>
        <div className="space-y-2">
          <Label>RAM máxima (MB)</Label>
          <Input
            type="number"
            min={256}
            value={settings.maxRamMb}
            onChange={(e) => setSettings((s) => ({ ...s, maxRamMb: parseInt(e.target.value, 10) || 256 }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Executável Java (opcional)</Label>
        <Input
          placeholder="java"
          value={settings.javaPath}
          onChange={(e) => setSettings((s) => ({ ...s, javaPath: e.target.value }))}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Nome do JAR</Label>
        <Input value={settings.jarFile} onChange={(e) => setSettings((s) => ({ ...s, jarFile: e.target.value }))} className="font-mono text-sm" />
      </div>

      <div className="space-y-2">
        <Label>Flags JVM extras (opcional)</Label>
        <Input
          value={settings.extraFlags}
          onChange={(e) => setSettings((s) => ({ ...s, extraFlags: e.target.value }))}
          className="font-mono text-sm"
          placeholder="-XX:+UseG1GC"
        />
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <Label>Auto Restart em Crash</Label>
          <Switch checked={settings.autoRestart} onCheckedChange={(v) => setSettings((s) => ({ ...s, autoRestart: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Detecção de Crash</Label>
          <Switch checked={settings.crashDetection} onCheckedChange={(v) => setSettings((s) => ({ ...s, crashDetection: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Backup Automático</Label>
          <Switch checked={settings.autoBackup} onCheckedChange={(v) => setSettings((s) => ({ ...s, autoBackup: v }))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Intervalo de Backup (horas)</Label>
        <Input
          type="number"
          min={1}
          value={settings.backupIntervalHours}
          onChange={(e) => setSettings((s) => ({ ...s, backupIntervalHours: parseInt(e.target.value, 10) || 1 }))}
        />
      </div>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar configurações"}
        </Button>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          Recarregar
        </Button>
      </div>
    </div>
  );
}
