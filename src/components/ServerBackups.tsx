import { useState, useEffect } from "react";
import { Download, Trash2, Plus, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiListBackups, apiCreateBackup, apiDeleteBackup, getBackupDownloadUrl } from "@/lib/api";

interface Backup {
  name: string;
  size: string;
  date: string;
}

export default function ServerBackups() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const data = await apiListBackups();
      setBackups(Array.isArray(data) ? data : []);
    } catch { toast.error("Erro ao listar backups"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiCreateBackup();
      if (res.success) { toast.success("Backup criado!"); load(); }
      else toast.error(res.error);
    } catch { toast.error("Erro ao criar backup"); }
    setCreating(false);
  };

  const handleDelete = async (name: string) => {
    const res = await apiDeleteBackup(name);
    if (res.success) { toast.success("Backup removido!"); load(); }
    else toast.error(res.error);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Backups do servidor</p>
        <Button onClick={handleCreate} disabled={creating} className="gap-2">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar Backup
        </Button>
      </div>
      <div className="divide-y rounded-xl border bg-card overflow-hidden">
        {loading && <div className="px-4 py-8 text-center text-muted-foreground">Carregando...</div>}
        {!loading && backups.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground">Nenhum backup encontrado</div>}
        {backups.map(b => (
          <div key={b.name} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{b.name}</p>
              <p className="text-xs text-muted-foreground">{b.size} • {b.date}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => window.open(getBackupDownloadUrl(b.name), "_blank")}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(b.name)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
