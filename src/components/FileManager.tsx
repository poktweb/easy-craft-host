import { useState, useEffect, useRef } from "react";
import { Folder, File, Upload, FilePlus, FolderPlus, MoreVertical, ArrowLeft, Eye, Pencil, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { apiListFiles, apiReadFile, apiSaveFile, apiCreateFileOrFolder, apiDeleteFile, apiUploadFiles, getDownloadUrl } from "@/lib/api";
import type { FileEntry } from "@/hooks/useServerState";

export default function FileManager() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async (dirPath?: string) => {
    setLoading(true);
    try {
      const p = dirPath ?? currentPath;
      const data = await apiListFiles(p);
      if (Array.isArray(data)) {
        setFiles(data);
        setSelected(new Set());
      } else {
        toast.error(data.error || "Erro ao listar arquivos");
      }
    } catch {
      toast.error("Erro de conexão com o backend");
    }
    setLoading(false);
  };

  useEffect(() => { loadFiles(); }, [currentPath]);

  const pathSegments = ["HOME", "CONTAINER", ...currentPath.split("/").filter(Boolean)];

  const navigateTo = (index: number) => {
    if (index <= 1) {
      setCurrentPath("");
    } else {
      const segments = currentPath.split("/").filter(Boolean);
      setCurrentPath(segments.slice(0, index - 1).join("/"));
    }
  };

  const openFolder = (name: string) => {
    setCurrentPath(prev => prev ? `${prev}/${name}` : name);
  };

  const openFile = async (file: FileEntry) => {
    if (file.type === "folder") { openFolder(file.name); return; }
    try {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const data = await apiReadFile(filePath);
      if (data.error) { toast.error(data.error); return; }
      setFileContent(data.content);
      setEditingFile(file.name);
    } catch { toast.error("Erro ao ler arquivo"); }
  };

  const handleSave = async () => {
    const filePath = currentPath ? `${currentPath}/${editingFile}` : editingFile!;
    const res = await apiSaveFile(filePath, fileContent);
    if (res.success) toast.success(`${editingFile} salvo!`);
    else toast.error(res.error);
    setEditingFile(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const res = await apiUploadFiles(e.target.files, currentPath);
    if (res.success) { toast.success(`${res.count} arquivo(s) enviado(s)!`); loadFiles(); }
    else toast.error(res.error);
    setShowUpload(false);
  };

  const handleCreate = async (type: "file" | "folder") => {
    if (!newName.trim()) return;
    const p = currentPath ? `${currentPath}/${newName}` : newName;
    const res = await apiCreateFileOrFolder(p, type);
    if (res.success) { toast.success(`${type === "folder" ? "Diretório" : "Arquivo"} criado!`); loadFiles(); }
    else toast.error(res.error);
    setShowNewFile(false);
    setShowNewFolder(false);
    setNewName("");
  };

  const handleDelete = async (name: string) => {
    const p = currentPath ? `${currentPath}/${name}` : name;
    const res = await apiDeleteFile(p);
    if (res.success) { toast.success(`${name} removido!`); loadFiles(); }
    else toast.error(res.error);
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const allSelected = files.length > 0 && selected.size === files.length;

  const runBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const names = [...selected];
    let removed = 0;
    let lastError: string | null = null;
    for (const name of names) {
      const p = currentPath ? `${currentPath}/${name}` : name;
      const res = await apiDeleteFile(p);
      if (res.success) removed++;
      else {
        lastError = res.error || "Erro ao excluir";
        break;
      }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    if (lastError) toast.error(lastError);
    if (removed > 0) {
      toast.success(
        removed === names.length
          ? `${removed} item(ns) removido(s).`
          : `${removed} de ${names.length} removido(s); corrija o erro e tente de novo.`,
      );
    }
    loadFiles();
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        {pathSegments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted-foreground">/</span>
            <button onClick={() => navigateTo(i)}
              className={i < pathSegments.length - 1 ? "text-primary hover:underline" : "text-foreground font-medium"}>
              {seg}
            </button>
          </span>
        ))}
        <span className="text-muted-foreground">/</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {currentPath && (
            <Button variant="ghost" size="sm" onClick={() => {
              const parts = currentPath.split("/").filter(Boolean);
              parts.pop();
              setCurrentPath(parts.join("/"));
            }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Checkbox checked={selected.size === files.length && files.length > 0} onCheckedChange={() => {
              setSelected(prev => prev.size === files.length ? new Set() : new Set(files.map(f => f.name)));
            }} />
            <span className="text-sm font-medium text-foreground">Selecionar Tudo</span>
            {selected.size > 0 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="ml-1"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {allSelected ? "Excluir todos" : `Excluir selecionados (${selected.size})`}
              </Button>
            )}
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
        {loading && <div className="px-4 py-8 text-center text-muted-foreground">Carregando...</div>}
        {!loading && files.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground">Pasta vazia</div>}
        {!loading && files.map(file => (
          <div key={file.name} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group">
            <Checkbox checked={selected.has(file.name)} onCheckedChange={() => toggleSelect(file.name)} />
            <button onClick={() => openFile(file)} className="flex items-center gap-3 flex-1 text-left min-w-0">
              {file.type === "folder" ? <Folder className="h-5 w-5 text-muted-foreground shrink-0" /> : <File className="h-5 w-5 text-muted-foreground shrink-0" />}
              <span className="font-medium text-foreground truncate">{file.name}</span>
            </button>
            {file.size && <span className="text-sm text-muted-foreground shrink-0">{file.size}</span>}
            <span className="text-sm text-muted-foreground shrink-0 hidden md:block">{file.modified}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {file.type === "file" && (
                  <>
                    <DropdownMenuItem onClick={() => openFile(file)}><Eye className="h-4 w-4 mr-2" /> Visualizar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openFile(file)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const p = currentPath ? `${currentPath}/${file.name}` : file.name;
                      window.open(getDownloadUrl(p), "_blank");
                    }}><Download className="h-4 w-4 mr-2" /> Download</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(file.name)}>
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
          <DialogHeader><DialogTitle>Editando: {editingFile}</DialogTitle></DialogHeader>
          <Textarea value={fileContent} onChange={e => setFileContent(e.target.value)} className="font-mono text-sm min-h-[400px]" />
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
          <div className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer relative" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Clique para selecionar arquivos</p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          </div>
        </DialogContent>
      </Dialog>

      {/* New File */}
      <Dialog open={showNewFile} onOpenChange={setShowNewFile}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Arquivo</DialogTitle></DialogHeader>
          <Input placeholder="nome-do-arquivo.txt" value={newName} onChange={e => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFile(false)}>Cancelar</Button>
            <Button onClick={() => handleCreate("file")}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Folder */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Diretório</DialogTitle></DialogHeader>
          <Input placeholder="nome-do-diretorio" value={newName} onChange={e => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancelar</Button>
            <Button onClick={() => handleCreate("folder")}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && !bulkDeleting && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{allSelected ? "Excluir todos os itens?" : "Excluir itens selecionados?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} item(ns) nesta pasta serão removidos permanentemente. Pastas são apagadas com todo o conteúdo.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={bulkDeleting} onClick={() => void runBulkDelete()}>
              {bulkDeleting ? "Excluindo…" : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
