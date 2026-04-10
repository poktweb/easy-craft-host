import { useState } from "react";
import { Folder, File, Upload, FilePlus, FolderPlus, MoreVertical, ChevronRight, ArrowLeft, Eye, Pencil, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { FileEntry } from "@/hooks/useServerState";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface Props {
  files: FileEntry[];
  currentPath: string[];
  onNavigate: (path: string[]) => void;
  serverProperties: string;
}

export default function FileManager({ files, currentPath, onNavigate, serverProperties }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newName, setNewName] = useState("");

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map(f => f.name)));
    }
  };

  const openFile = (file: FileEntry) => {
    if (file.type === "folder") {
      onNavigate([...currentPath, file.name]);
      return;
    }
    if (file.name === "server.properties") {
      setFileContent(serverProperties);
    } else if (file.name === "eula.txt") {
      setFileContent("eula=true");
    } else {
      setFileContent(`# Conteúdo de ${file.name}\n# Edite conforme necessário`);
    }
    setEditingFile(file.name);
  };

  const handleSave = () => {
    toast.success(`Arquivo ${editingFile} salvo com sucesso!`);
    setEditingFile(null);
  };

  const handleUpload = () => {
    toast.success("Arquivo enviado com sucesso!");
    setShowUpload(false);
  };

  const handleCreateFile = () => {
    if (!newName.trim()) return;
    toast.success(`Arquivo ${newName} criado!`);
    setShowNewFile(false);
    setNewName("");
  };

  const handleCreateFolder = () => {
    if (!newName.trim()) return;
    toast.success(`Diretório ${newName} criado!`);
    setShowNewFolder(false);
    setNewName("");
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4">
        {currentPath.map((segment, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted-foreground">/</span>
            <button
              onClick={() => onNavigate(currentPath.slice(0, i + 1))}
              className={i < currentPath.length - 1 ? "text-primary hover:underline" : "text-foreground font-medium"}
            >
              {segment}
            </button>
          </span>
        ))}
        <span className="text-muted-foreground">/</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-3">
          {currentPath.length > 2 && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate(currentPath.slice(0, -1))}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Checkbox checked={selected.size === files.length && files.length > 0} onCheckedChange={selectAll} />
            <span className="text-sm font-medium text-foreground">Selecionar Tudo</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(true); setNewName(""); }}>
            <FolderPlus className="h-4 w-4 mr-1" /> Novo Diretório
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
            <Upload className="h-4 w-4 mr-1" /> Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowNewFile(true); setNewName(""); }}>
            <FilePlus className="h-4 w-4 mr-1" /> Novo Arquivo
          </Button>
        </div>
      </div>

      {/* File list */}
      <div className="divide-y rounded-xl border bg-card overflow-hidden">
        {files.map(file => (
          <div key={file.name} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group">
            <Checkbox checked={selected.has(file.name)} onCheckedChange={() => toggleSelect(file.name)} />
            <button onClick={() => openFile(file)} className="flex items-center gap-3 flex-1 text-left">
              {file.type === "folder" ? (
                <Folder className="h-5 w-5 text-muted-foreground" />
              ) : (
                <File className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="font-medium text-foreground">{file.name}</span>
              {file.type === "folder" && <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
            {file.size && <span className="text-sm text-muted-foreground">{file.size}</span>}
            <span className="text-sm text-muted-foreground">{file.modified}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {file.type === "file" && (
                  <>
                    <DropdownMenuItem onClick={() => openFile(file)}>
                      <Eye className="h-4 w-4 mr-2" /> Visualizar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openFile(file)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.success(`Download de ${file.name} iniciado`)}>
                      <Download className="h-4 w-4 mr-2" /> Download
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => toast.success(`${file.name} removido`)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingFile} onOpenChange={() => setEditingFile(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Editando: {editingFile}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={fileContent}
            onChange={e => setFileContent(e.target.value)}
            className="font-mono text-sm min-h-[400px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingFile(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload de Arquivo</DialogTitle></DialogHeader>
          <div className="border-2 border-dashed rounded-xl p-12 text-center">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Arraste arquivos aqui ou clique para selecionar</p>
            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUpload} />
          </div>
        </DialogContent>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={showNewFile} onOpenChange={setShowNewFile}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Arquivo</DialogTitle></DialogHeader>
          <Input placeholder="nome-do-arquivo.txt" value={newName} onChange={e => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFile(false)}>Cancelar</Button>
            <Button onClick={handleCreateFile}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Diretório</DialogTitle></DialogHeader>
          <Input placeholder="nome-do-diretorio" value={newName} onChange={e => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancelar</Button>
            <Button onClick={handleCreateFolder}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
