import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Loader2, Plus, Trash2, Upload, Eye, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPath } from "@/lib/sessionScope";

type ManagementSystemRow = {
  id: number;
  companyId: number;
  systemName: string;
  certification: string;
  orderIndex: number;
};

function FileModal({
  title,
  files,
  onClose,
  onDelete,
}: {
  title: string;
  files: { id: number; fileName: string; fileUrl: string }[];
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4 text-slate-800">{title}</h3>
        {files.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay archivos subidos aún.</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 border rounded p-2">
                <a
                  href={f.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm truncate max-w-[200px]"
                >
                  {f.fileName}
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => onDelete(f.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

export default function ManagementSystems() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: plLoading } = useProcessLeaderAuth();
  const { isManagerLogin, managerCompanyId, isLoading: managerLoading } = useManagerAuth();

  const isAuthLoading = managerLoading || plLoading;

  // Resolve companyId reactively from auth state
  const companyId = useMemo<number | null>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    const stored = localStorage.getItem("managerCompanyId") || localStorage.getItem("selectedCompanyId");
    if (stored) return parseInt(stored, 10);
    return getCompanyIdFromLocationOrStorage();
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const [rows, setRows] = useState<ManagementSystemRow[]>([]);
  const [modal, setModal] = useState<{
    systemId: number;
    fileType: "certification" | "checklist";
    mode: "view" | "upload";
  } | null>(null);
  const [modalFiles, setModalFiles] = useState<{ id: number; fileName: string; fileUrl: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<number, NodeJS.Timeout>>({});

  const { data, isLoading, refetch } = trpc.auditsInspections.listManagementSystems.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const createMutation = trpc.auditsInspections.createManagementSystem.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Error al crear el sistema de gestión"),
  });

  const updateMutation = trpc.auditsInspections.updateManagementSystem.useMutation({
    onError: () => toast.error("Error al guardar"),
  });

  const deleteMutation = trpc.auditsInspections.deleteManagementSystem.useMutation({
    onSuccess: () => { refetch(); toast.success("Eliminado correctamente"); },
    onError: () => toast.error("Error al eliminar"),
  });

  const listFilesMutation = trpc.auditsInspections.listManagementSystemFiles.useQuery(
    { managementSystemId: modal?.systemId ?? 0, companyId: companyId ?? 0, fileType: modal?.fileType ?? "certification" },
    { enabled: !!modal && modal.mode === "view" }
  );

  const deleteFileMutation = trpc.auditsInspections.deleteManagementSystemFile.useMutation({
    onSuccess: () => { listFilesMutation.refetch(); toast.success("Archivo eliminado"); },
    onError: () => toast.error("Error al eliminar el archivo"),
  });

  useEffect(() => {
    if (data) setRows(data as ManagementSystemRow[]);
  }, [data]);

  useEffect(() => {
    if (modal?.mode === "view" && listFilesMutation.data) {
      setModalFiles(listFilesMutation.data as { id: number; fileName: string; fileUrl: string }[]);
    }
  }, [modal, listFilesMutation.data]);

  const handleFieldChange = useCallback(
    (id: number, field: "systemName" | "certification", value: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
      if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(() => {
        updateMutation.mutate({ id, companyId: companyId!, [field]: value });
      }, 600);
    },
    [companyId, updateMutation]
  );

  const handleAdd = () => {
    if (!companyId) return;
    createMutation.mutate({ companyId });
  };

  const handleDelete = (id: number) => {
    if (!confirm("¿Eliminar este sistema de gestión y todos sus archivos?")) return;
    deleteMutation.mutate({ id, companyId: companyId! });
  };

  const handleUploadClick = (systemId: number, fileType: "certification" | "checklist") => {
    setModal({ systemId, fileType, mode: "upload" });
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleViewClick = (systemId: number, fileType: "certification" | "checklist") => {
    setModal({ systemId, fileType, mode: "view" });
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !modal || !companyId) return;
    const validTypes = [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!validTypes.includes(file.type)) {
      toast.error("Solo se permiten archivos PDF o Excel");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("El archivo no debe superar 50MB");
      return;
    }
    setIsUploading(true);
    try {
      // FormData transmite el archivo binario directamente. Evita convertir cada byte
      // en JSON, operación que bloqueaba el navegador con documentos medianos o grandes.
      const formData = new FormData();
      formData.append("file", file);
      formData.append("managementSystemId", String(modal.systemId));
      formData.append("companyId", String(companyId));
      formData.append("fileType", modal.fileType);

      const response = await fetch("/api/upload/management-system-file", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Error al subir el archivo");
      }
      toast.success("Archivo subido correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir el archivo");
    } finally {
      setIsUploading(false);
      setModal(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isAuthLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 text-slate-600 py-16">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card><CardContent className="pt-6"><Loader2 className="animate-spin" /></CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Vuelve a Sistemas de Gestión (AuditsInspections) con el companyId
                setLocation(`/audits-inspections?companyId=${companyId}`);
              }}
            >
              <ArrowLeft size={16} className="mr-1" /> Volver
            </Button>
            <h1 className="text-xl font-bold text-slate-800">Sistema de Gestión</h1>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando...</div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <Card key={row.id} className="border-2 border-teal-200 bg-teal-50">
                <CardContent className="pt-5 pb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">
                        Sistema de Gestión
                      </label>
                      <Input
                        value={row.systemName}
                        onChange={(e) => handleFieldChange(row.id, "systemName", e.target.value)}
                        placeholder="Nombre del sistema..."
                        className="border-teal-200 focus:border-teal-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">
                        Certificación
                      </label>
                      <Input
                        value={row.certification}
                        onChange={(e) => handleFieldChange(row.id, "certification", e.target.value)}
                        placeholder="Nombre de la certificación..."
                        className="border-teal-200 focus:border-teal-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-teal-300 text-teal-700 hover:bg-teal-50 text-xs"
                      onClick={() => handleUploadClick(row.id, "certification")}
                      disabled={isUploading}
                    >
                      <Upload size={13} className="mr-1" /> Subir Archivos de Certificación
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-teal-300 text-teal-700 hover:bg-teal-50 text-xs"
                      onClick={() => handleViewClick(row.id, "certification")}
                    >
                      <Eye size={13} className="mr-1" /> Ver Archivos de Certificación
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-teal-300 text-teal-700 hover:bg-teal-50 text-xs"
                      onClick={() => handleUploadClick(row.id, "checklist")}
                      disabled={isUploading}
                    >
                      <Upload size={13} className="mr-1" /> Subir Check List de Auditoría
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-teal-300 text-teal-700 hover:bg-teal-50 text-xs"
                      onClick={() => handleViewClick(row.id, "checklist")}
                    >
                      <Eye size={13} className="mr-1" /> Ver Check List de Auditoría
                    </Button>
                  </div>

                  <div className="flex justify-end mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(row.id)}
                    >
                      <Trash2 size={14} className="mr-1" /> Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              className="w-full border-dashed border-teal-300 text-teal-600 hover:bg-teal-50"
              onClick={handleAdd}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
              + Agregar nuevo Sistema de Gestión
            </Button>
          </div>
        )}

        {/* Hidden file input - fuera del bloque condicional para evitar crash de insertBefore */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xls,.xlsx"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* File View Modal */}
        {modal?.mode === "view" && (
          <FileModal
            title={modal.fileType === "certification" ? "Archivos de Certificación" : "Check Lists de Auditoría"}
            files={modalFiles}
            onClose={() => setModal(null)}
            onDelete={(id) => deleteFileMutation.mutate({ id, companyId: companyId! })}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
