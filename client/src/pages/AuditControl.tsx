import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Loader2, Plus, Trash2, Upload, Eye, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";

type AuditRow = {
  id: number;
  companyId: number;
  managementSystem: string;
  auditDate: string;
  auditType: "Interna" | "Externa";
  findingsObservations: number;
  findingsMajorNC: number;
  findingsMinorNC: number;
  closuresObservations: number;
  closuresMajorNC: number;
  closuresMinorNC: number;
  orderIndex: number;
};

function calcPercent(row: AuditRow): string {
  const totalFindings = row.findingsObservations + row.findingsMajorNC + row.findingsMinorNC;
  const totalClosures = row.closuresObservations + row.closuresMajorNC + row.closuresMinorNC;
  if (totalFindings === 0) return "—";
  return `${Math.round((totalClosures / totalFindings) * 100)}%`;
}

function FileModal({
  auditId,
  companyId,
  onClose,
}: {
  auditId: number;
  companyId: number;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: files = [], refetch } = trpc.auditsInspections.listAuditFiles.useQuery({ auditId, companyId });
  const uploadMutation = trpc.auditsInspections.uploadAuditFile.useMutation({
    onSuccess: () => { refetch(); toast.success("Archivo subido"); },
    onError: () => toast.error("Error al subir"),
  });
  const deleteMutation = trpc.auditsInspections.deleteAuditFile.useMutation({
    onSuccess: () => { refetch(); toast.success("Archivo eliminado"); },
    onError: () => toast.error("Error al eliminar"),
  });

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!validTypes.includes(file.type)) { toast.error("Solo PDF o Excel"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Máximo 50MB"); return; }
    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      await uploadMutation.mutateAsync({
        auditId, companyId,
        fileName: file.name,
        fileData: Array.from(new Uint8Array(arrayBuffer)),
        mimeType: file.type,
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4 text-slate-800">Archivos de Hallazgos</h3>
        <input ref={fileInputRef} type="file" accept=".pdf,.xls,.xlsx" className="hidden" onChange={handleFileSelected} />
        {(files as { id: number; fileName: string; fileUrl: string }[]).length === 0 ? (
          <p className="text-slate-500 text-sm mb-4">No hay archivos subidos aún.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {(files as { id: number; fileName: string; fileUrl: string }[]).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 border rounded p-2">
                <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm truncate max-w-[200px]">
                  {f.fileName}
                </a>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteMutation.mutate({ id: f.id, companyId })}>
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 justify-between">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Upload size={14} className="mr-1" />}
            Subir archivo
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

export default function AuditControl() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem("managerCompanyId") !== null;

  const [companyId] = useState<number | null>(() => {
    if (isProcessLeader && processLeaderSession?.companyId) return processLeaderSession.companyId;
    if (isManagerAccess) {
      const id = localStorage.getItem("managerCompanyId");
      return id ? parseInt(id) : null;
    }
    return getCompanyIdFromLocationOrStorage();
  });

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [openFileModal, setOpenFileModal] = useState<number | null>(null);
  const saveTimers = useRef<Record<number, NodeJS.Timeout>>({});

  const { data, isLoading, refetch } = trpc.auditsInspections.listAudits.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const createMutation = trpc.auditsInspections.createAudit.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Error al crear auditoría"),
  });

  const updateMutation = trpc.auditsInspections.updateAudit.useMutation({
    onError: () => toast.error("Error al guardar"),
  });

  const deleteMutation = trpc.auditsInspections.deleteAudit.useMutation({
    onSuccess: () => { refetch(); toast.success("Auditoría eliminada"); },
    onError: () => toast.error("Error al eliminar"),
  });

  useEffect(() => {
    if (data) setRows(data as AuditRow[]);
  }, [data]);

  const handleChange = useCallback(
    (id: number, field: keyof AuditRow, value: string | number) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
      if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(() => {
        updateMutation.mutate({ id, companyId: companyId!, [field]: value } as Parameters<typeof updateMutation.mutate>[0]);
      }, 600);
    },
    [companyId, updateMutation]
  );

  const numInput = (id: number, field: keyof AuditRow, value: number) => (
    <Input
      type="number"
      min={0}
      value={value}
      onChange={(e) => handleChange(id, field, parseInt(e.target.value) || 0)}
      className="w-16 text-center border-blue-200 focus:border-blue-400 px-1"
    />
  );

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card><CardContent className="pt-6"><Loader2 className="animate-spin" /></CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/audits-inspections?companyId=${companyId}`)}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
          <h1 className="text-xl font-bold text-slate-800">Control de Auditorías</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando...</div>
        ) : (
          <Card className="border-2 border-blue-100">
            <CardContent className="pt-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-blue-700 font-semibold text-xs uppercase">
                    <th className="text-left p-2 min-w-[130px]">Sistema de Gestión</th>
                    <th className="text-left p-2 min-w-[110px]">Fecha</th>
                    <th className="text-left p-2 min-w-[110px]">Interna / Externa</th>
                    <th colSpan={3} className="text-center p-2 border-l border-blue-100">
                      # Hallazgos
                    </th>
                    <th colSpan={3} className="text-center p-2 border-l border-blue-100">
                      # Cierres
                    </th>
                    <th className="text-center p-2 border-l border-blue-100 min-w-[50px]">%</th>
                    <th className="text-center p-2 border-l border-blue-100 min-w-[160px]">Archivos Hallazgos</th>
                    <th className="p-2"></th>
                  </tr>
                  <tr className="text-blue-600 text-xs">
                    <th></th><th></th><th></th>
                    <th className="text-center p-1 border-l border-blue-100">Obs.</th>
                    <th className="text-center p-1">NC Mayor</th>
                    <th className="text-center p-1">NC Menor</th>
                    <th className="text-center p-1 border-l border-blue-100">Obs.</th>
                    <th className="text-center p-1">NC Mayor</th>
                    <th className="text-center p-1">NC Menor</th>
                    <th></th><th></th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-blue-50 hover:bg-blue-50/30">
                      <td className="p-2">
                        <Input
                          value={row.managementSystem}
                          onChange={(e) => handleChange(row.id, "managementSystem", e.target.value)}
                          placeholder="Sistema..."
                          className="border-blue-200 focus:border-blue-400 text-sm"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.auditDate}
                          onChange={(e) => handleChange(row.id, "auditDate", e.target.value)}
                          placeholder="dd-mm-aaaa"
                          className="border-blue-200 focus:border-blue-400 text-sm w-32"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={row.auditType}
                          onChange={(e) => handleChange(row.id, "auditType", e.target.value as "Interna" | "Externa")}
                          className="border border-blue-200 rounded px-2 py-1 text-sm focus:border-blue-400 focus:outline-none bg-white"
                        >
                          <option value="Interna">Interna</option>
                          <option value="Externa">Externa</option>
                        </select>
                      </td>
                      <td className="p-2 border-l border-blue-50">{numInput(row.id, "findingsObservations", row.findingsObservations)}</td>
                      <td className="p-2">{numInput(row.id, "findingsMajorNC", row.findingsMajorNC)}</td>
                      <td className="p-2">{numInput(row.id, "findingsMinorNC", row.findingsMinorNC)}</td>
                      <td className="p-2 border-l border-blue-50">{numInput(row.id, "closuresObservations", row.closuresObservations)}</td>
                      <td className="p-2">{numInput(row.id, "closuresMajorNC", row.closuresMajorNC)}</td>
                      <td className="p-2">{numInput(row.id, "closuresMinorNC", row.closuresMinorNC)}</td>
                      <td className="p-2 text-center font-semibold text-blue-700 border-l border-blue-50">
                        {calcPercent(row)}
                      </td>
                      <td className="p-2 border-l border-blue-50">
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => setOpenFileModal(row.id)}
                          >
                            <Upload size={12} className="mr-1" /> Subir archivo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => setOpenFileModal(row.id)}
                          >
                            <Eye size={12} className="mr-1" /> Ver archivo
                          </Button>
                        </div>
                      </td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-600"
                          onClick={() => {
                            if (confirm("¿Eliminar esta auditoría?"))
                              deleteMutation.mutate({ id: row.id, companyId: companyId! });
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4">
                <Button
                  variant="outline"
                  className="border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
                  onClick={() => createMutation.mutate({ companyId: companyId! })}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
                  + Agregar nueva Auditoría
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {openFileModal !== null && (
          <FileModal
            auditId={openFileModal}
            companyId={companyId!}
            onClose={() => setOpenFileModal(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
