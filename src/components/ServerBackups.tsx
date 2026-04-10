import { Download, Trash2, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKUPS = [
  { name: "backup_2026-04-10_14-30.tar.gz", size: "320 MB", date: "10 abr 2026 14:30" },
  { name: "backup_2026-04-09_02-00.tar.gz", size: "315 MB", date: "09 abr 2026 02:00" },
  { name: "backup_2026-04-08_02-00.tar.gz", size: "310 MB", date: "08 abr 2026 02:00" },
  { name: "backup_2026-04-07_02-00.tar.gz", size: "305 MB", date: "07 abr 2026 02:00" },
];

export default function ServerBackups() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Backups automáticos diários às 02:00</p>
        <Button onClick={() => toast.success("Backup manual iniciado!")} className="gap-2">
          <Plus className="h-4 w-4" /> Criar Backup
        </Button>
      </div>
      <div className="divide-y rounded-xl border bg-card overflow-hidden">
        {BACKUPS.map(b => (
          <div key={b.name} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium text-foreground">{b.name}</p>
              <p className="text-xs text-muted-foreground">{b.size} • {b.date}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => toast.success("Download iniciado!")}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => toast.success("Backup restaurado!")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
