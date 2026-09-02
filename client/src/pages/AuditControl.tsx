import { Fragment, useState, useEffect, useRef, useCallback } from "react";
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
import { OperationalFindingsPanel } from "@/components/OperationalFindingsPanel";

type AuditRow = {
  id: number;
  companyId: number;
  managementSystem: string;
  auditDate: string;
  auditType: "Interna" | "Externa";
  findingsObservations: number;
  findingsMajorNC: number;
  findingsMinorNC: number;
  findingsOM: number;
  closuresObservations: number;
  closuresMajorNC: number;
  closuresMinorNC: number;
  closuresOM: number;
  orderIndex: number;
};

function calcPercent(row: AuditRow): string {
  const totalFindings =
    row.findingsMajorNC + row.findingsMinorNC + row.findingsObservations + row.findingsOM;
  const totalClosures =
    row.closuresMajorNC + row.closuresMinorNC + row.closuresObservations + row.closuresOM;
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
    if (data) {
      // Ensure new OM fields default to 0 for existing rows that don't have them yet
      setRows((data as AuditRow[]).map((r) => ({
        ...r,
        findingsOM: r.findingsOM ?? 0,
        closuresOM: r.closuresOM ?? 0,
      })));
    }
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

  const derivedCount = (label: string, value: number) => (
    <div
      className="flex h-8 w-full flex-col items-center justify-center rounded border border-blue-100 bg-blue-50/50 leading-none"
      title="Indicador automático: se calcula desde Gestionar hallazgos y los cierres confirmados por los procesos vinculados"
    >
      <span className="text-[8px] font-semibold text-blue-600">{label}</span>
      <span className="mt-0.5 text-xs font-bold text-slate-700">{value}</span>
    </div>
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
      <div className="max-w-full px-4 py-8" translate="no">
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
            <CardContent className="pt-4 pb-4">
              <div className="overflow-x-auto">
              <table className="min-w-[960px] table-fixed border-collapse text-xs" style={{ width: "calc(100% - 12px)" }}>
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "9.5%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} />
                  <col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} /><col style={{ width: "4.6%" }} />
                  <col style={{ width: "4.2%" }} />
                  <col style={{ width: "21%" }} />
                  <col style={{ width: "4.5%" }} />
                </colgroup>
                <thead>
                  <tr className="text-blue-700 font-semibold text-[10px] uppercase">
                    <th className="text-left p-1">Sistema de Gestión</th>
                    <th className="text-left p-1">Fecha</th>
                    <th className="text-left p-1">Interna / Externa</th>
                    <th colSpan={4} className="text-center p-1 border-l border-blue-100">
                      # Hallazgos
                    </th>
                    <th colSpan={4} className="text-center p-1 border-l border-blue-100">
                      # Cierres
                    </th>
                    <th className="text-center p-1 border-l border-blue-100">%</th>
                    <th className="text-center p-1 border-l border-blue-100">Archivos Hallazgos</th>
                    <th className="p-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                    <tr className="border-t border-blue-50 hover:bg-blue-50/30">
                      <td className="p-1">
                        <Input
                          value={row.managementSystem}
                          onChange={(e) => handleChange(row.id, "managementSystem", e.target.value)}
                          placeholder="Sistema..."
                          className="h-8 w-full min-w-0 border-blue-200 text-xs focus:border-blue-400"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          value={row.auditDate}
                          onChange={(e) => handleChange(row.id, "auditDate", e.target.value)}
                          placeholder="dd-mm-aaaa"
                          className="h-8 w-full min-w-0 border-blue-200 text-xs focus:border-blue-400"
                        />
                      </td>
                      <td className="p-1">
                        <select
                          value={row.auditType}
                          onChange={(e) => handleChange(row.id, "auditType", e.target.value as "Interna" | "Externa")}
                          className="h-8 w-full min-w-0 border border-blue-200 rounded px-1 text-xs focus:border-blue-400 focus:outline-none bg-white"
                        >
                          <option value="Interna">Interna</option>
                          <option value="Externa">Externa</option>
                        </select>
                      </td>
                      {/* Indicadores automáticos: cada etiqueta se repite por fila. */}
                      <td className="p-1 border-l border-blue-50">{derivedCount("NC Mayor", row.findingsMajorNC)}</td>
                      <td className="p-1">{derivedCount("NC Menor", row.findingsMinorNC)}</td>
                      <td className="p-1">{derivedCount("Obs.", row.findingsObservations)}</td>
                      <td className="p-1">{derivedCount("OM", row.findingsOM)}</td>
                      <td className="p-1 border-l border-blue-50">{derivedCount("NC Mayor", row.closuresMajorNC)}</td>
                      <td className="p-1">{derivedCount("NC Menor", row.closuresMinorNC)}</td>
                      <td className="p-1">{derivedCount("Obs.", row.closuresObservations)}</td>
                      <td className="p-1">{derivedCount("OM", row.closuresOM)}</td>
                      <td className="p-1 text-center font-semibold text-blue-700 border-l border-blue-50">
                        {calcPercent(row)}
                      </td>
                      <td className="p-1 border-l border-blue-50">
                        <div className="flex gap-0.5 justify-center whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-1 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            title="Subir archivo de hallazgos"
                            onClick={() => setOpenFileModal(row.id)}
                          >
                            <Upload size={11} className="mr-0.5" /> Subir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-1.5 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => setOpenFileModal(row.id)}
                          >
                            <Eye size={12} className="mr-1" /> Ver archivo
                          </Button>
                        </div>
                      </td>
                      <td className="p-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-full min-w-0 p-0 text-red-400 hover:text-red-600"
                          onClick={() => {
                            if (confirm("¿Eliminar esta auditoría?"))
                              deleteMutation.mutate({ id: row.id, companyId: companyId! });
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                    <tr className="border-t border-blue-50 bg-slate-50/50">
                      <td colSpan={14} className="px-2 pb-3 pt-1">
                        <OperationalFindingsPanel
                          companyId={companyId!}
                          sourceType="audit"
                          sourceId={row.id}
                          title="Gestionar hallazgos"
                          onSummaryChanged={refetch}
                        />
                      </td>
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>

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
