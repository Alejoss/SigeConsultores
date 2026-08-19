import { useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";

const MANAGEMENT_SYSTEMS = [
  "Calidad",
  "Ambiente",
  "SSO",
  "Seguridad Física",
  "Responsabilidad Social",
  "Otro",
];

const PROGRAM_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_PROGRAM_FILE_BYTES = 50 * 1024 * 1024;

type DocumentationModal = {
  programId: number;
  programName: string;
};

function DocumentationModal({
  title,
  files,
  isLoading,
  onClose,
  onDelete,
}: {
  title: string;
  files: { id: number; fileName: string; fileUrl: string }[];
  isLoading: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Documentos de respaldo asociados a este programa.
        </p>
        <div className="mt-4 max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentación...
            </div>
          ) : files.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No hay documentación subida aún.
            </p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-sm font-medium text-blue-600 hover:underline"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                    onClick={() => onDelete(file.id)}
                    title="Eliminar documento"
                  >
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewPlanningButton({
  programId,
  companyId,
  planFileName,
}: {
  programId: number;
  companyId: number;
  planFileName: string | null;
}) {
  const { data, isLoading } = trpc.managementPrograms.getPlanUrl.useQuery(
    { id: programId, companyId },
    { enabled: !!planFileName }
  );

  const handleViewPlanning = () => {
    if (!planFileName) {
      toast.info("Este programa todavía no tiene una planificación subida");
      return;
    }
    if (!data?.url) {
      toast.error("No fue posible abrir la planificación. Inténtelo nuevamente.");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-blue-300 text-blue-700 hover:bg-blue-50"
      onClick={handleViewPlanning}
      disabled={isLoading}
      title={planFileName ?? "No hay planificación subida"}
    >
      {isLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Eye size={14} className="mr-1" />}
      Ver planificación
    </Button>
  );
}

export default function ManagementPrograms() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: plLoading } = useProcessLeaderAuth();
  const { isManagerLogin, managerCompanyId, isLoading: managerLoading } = useManagerAuth();
  const isAuthLoading = managerLoading || plLoading;

  const companyId = useMemo<number | null>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    return getCompanyIdFromLocationOrStorage();
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const planningInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const documentationInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [documentationModal, setDocumentationModal] = useState<DocumentationModal | null>(null);
  const [uploadingDocumentationProgramId, setUploadingDocumentationProgramId] = useState<number | null>(null);

  const { data: programs = [], refetch, isLoading } = trpc.managementPrograms.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const createMutation = trpc.managementPrograms.create.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Programa agregado");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.managementPrograms.update.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.managementPrograms.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Programa eliminado");
    },
    onError: (error) => toast.error(error.message),
  });

  const uploadPlanMutation = trpc.managementPrograms.uploadPlan.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Planificación subida correctamente");
    },
    onError: (error) => toast.error(error.message),
  });

  const documentationQuery = trpc.managementPrograms.listDocumentation.useQuery(
    {
      programId: documentationModal?.programId ?? 0,
      companyId: companyId ?? 0,
    },
    { enabled: !!documentationModal && !!companyId }
  );

  const deleteDocumentationMutation = trpc.managementPrograms.deleteDocumentation.useMutation({
    onSuccess: () => {
      documentationQuery.refetch();
      toast.success("Documento eliminado");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAddProgram = () => {
    if (!companyId) return;
    createMutation.mutate({
      companyId,
      programName: "Nuevo Programa",
      managementSystem: "Calidad",
      plannedActions: 0,
      completedActions: 0,
    });
  };

  const handleUpdate = (id: number, field: string, value: string | number) => {
    if (!companyId) return;
    updateMutation.mutate({ id, companyId, [field]: value });
  };

  const handleDelete = (id: number) => {
    if (!companyId) return;
    if (!confirm("¿Eliminar este programa y todos sus archivos asociados?")) return;
    deleteMutation.mutate({ id, companyId });
  };

  const validateFile = (file: File) => {
    if (!PROGRAM_FILE_TYPES.includes(file.type)) {
      toast.error("Solo se permiten archivos PDF, Word o Excel");
      return false;
    }
    if (file.size > MAX_PROGRAM_FILE_BYTES) {
      toast.error("El archivo no debe superar 50 MB");
      return false;
    }
    return true;
  };

  const handlePlanningFile = async (programId: number, file: File) => {
    if (!companyId || !validateFile(file)) return;
    try {
      const fileData = Array.from(new Uint8Array(await file.arrayBuffer()));
      await uploadPlanMutation.mutateAsync({
        id: programId,
        companyId,
        fileName: file.name,
        fileData,
        mimeType: file.type,
      });
    } catch {
      toast.error("No fue posible subir la planificación");
    } finally {
      const input = planningInputRefs.current[programId];
      if (input) input.value = "";
    }
  };

  const handleDocumentationFiles = async (programId: number, fileList: FileList) => {
    if (!companyId || uploadingDocumentationProgramId !== null) return;
    const validFiles = Array.from(fileList).filter(validateFile);
    if (validFiles.length === 0) return;

    setUploadingDocumentationProgramId(programId);
    const progressToast = toast.loading(
      validFiles.length > 1
        ? `Subiendo 0 de ${validFiles.length} documentos...`
        : "Subiendo documentación..."
    );
    let uploaded = 0;
    const failedFiles: string[] = [];

    try {
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("companyId", String(companyId));
        formData.append("programId", String(programId));

        const response = await fetch("/api/upload/management-program-documentation", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          failedFiles.push(file.name);
          continue;
        }

        uploaded += 1;
        if (validFiles.length > 1) {
          toast.loading(`Subiendo ${uploaded} de ${validFiles.length} documentos...`, { id: progressToast });
        }
      }

      if (documentationModal?.programId === programId) await documentationQuery.refetch();
      if (uploaded > 0) {
        toast.success(
          uploaded === 1 ? "Documento subido correctamente" : `${uploaded} documentos subidos correctamente`,
          { id: progressToast }
        );
      } else {
        toast.error("No fue posible subir la documentación", { id: progressToast });
      }
      if (failedFiles.length > 0) {
        toast.error(`${failedFiles.length} archivo(s) no se pudieron subir. Puede intentarlo nuevamente.`, { id: `${progressToast}-errors` });
      }
    } catch {
      toast.error("No fue posible subir la documentación. Inténtelo nuevamente.", { id: progressToast });
    } finally {
      setUploadingDocumentationProgramId(null);
      const input = documentationInputRefs.current[programId];
      if (input) input.value = "";
    }
  };

  const overallCompliance = useMemo(() => {
    if (!programs.length) return 0;
    const total = programs.reduce((sum, program) => {
      const planned = program.plannedActions ?? 0;
      const completed = program.completedActions ?? 0;
      return sum + (planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0);
    }, 0);
    return Math.round(total / programs.length);
  }, [programs]);

  if (isAuthLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(companyId ? `/audits-inspections?companyId=${companyId}` : "/audits-inspections")}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Programas</h1>
              <p className="mt-0.5 text-sm text-slate-500">Gestión de programas de sistemas de gestión</p>
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-blue-600">% Cumplimiento</p>
            <p className={`text-2xl font-bold ${overallCompliance >= 80 ? "text-green-600" : overallCompliance >= 50 ? "text-yellow-600" : "text-red-600"}`}>
              {overallCompliance}%
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : (
          <div className="space-y-4">
            {programs.length === 0 && (
              <Card><CardContent className="pt-6 text-center text-slate-400">No hay programas registrados. Agregue el primero.</CardContent></Card>
            )}
            {programs.map((program) => {
              const planned = program.plannedActions ?? 0;
              const completed = program.completedActions ?? 0;
              const compliance = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;
              return (
                <Card key={program.id} className="border border-slate-200">
                  <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre del Programa</label>
                        <Input defaultValue={program.programName} onBlur={(event) => handleUpdate(program.id, "programName", event.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Sistema de Gestión</label>
                        <select defaultValue={program.managementSystem} onChange={(event) => handleUpdate(program.id, "managementSystem", event.target.value)} className="w-full rounded border p-2 text-sm">
                          {MANAGEMENT_SYSTEMS.map((system) => <option key={system} value={system}>{system}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500"># Acciones Planificadas</label>
                        <Input type="number" min={0} defaultValue={planned} onBlur={(event) => handleUpdate(program.id, "plannedActions", parseInt(event.target.value, 10) || 0)} className="text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500"># Acciones Realizadas</label>
                        <Input type="number" min={0} defaultValue={completed} onBlur={(event) => handleUpdate(program.id, "completedActions", parseInt(event.target.value, 10) || 0)} className="text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Cumplimiento</label>
                        <div className={`w-full rounded border p-2 text-center text-sm font-bold ${
                          compliance >= 80 ? "border-green-300 bg-green-100 text-green-700" : compliance >= 50 ? "border-yellow-300 bg-yellow-100 text-yellow-700" : "border-red-300 bg-red-100 text-red-700"
                        }`}>{compliance}%</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <input
                        ref={(element) => { documentationInputRefs.current[program.id] = element; }}
                        type="file"
                        className="hidden"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(event) => {
                          if (event.target.files?.length) handleDocumentationFiles(program.id, event.target.files);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-teal-300 text-teal-700 hover:bg-teal-50"
                        onClick={() => documentationInputRefs.current[program.id]?.click()}
                        disabled={uploadingDocumentationProgramId !== null}
                      >
                        {uploadingDocumentationProgramId === program.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
                        {uploadingDocumentationProgramId === program.id ? "Subiendo documentación..." : "Subir documentación"}
                      </Button>
                      <Button size="sm" variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50" onClick={() => setDocumentationModal({ programId: program.id, programName: program.programName })}>
                        <Eye size={14} className="mr-1" /> Ver documentación
                      </Button>
                      <input
                        ref={(element) => { planningInputRefs.current[program.id] = element; }}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handlePlanningFile(program.id, file);
                        }}
                      />
                      <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => planningInputRefs.current[program.id]?.click()} disabled={uploadPlanMutation.isPending}>
                        {uploadPlanMutation.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
                        Subir planificación
                      </Button>
                      <ViewPlanningButton programId={program.id} companyId={companyId!} planFileName={program.planFileName} />
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-700" onClick={() => handleDelete(program.id)}>
                        <Trash2 size={14} className="mr-1" /> Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <Button onClick={handleAddProgram} className="flex w-full items-center justify-center gap-2 bg-blue-500 text-white hover:bg-blue-600" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Añadir nuevo programa
          </Button>
        </div>

        {documentationModal && (
          <DocumentationModal
            title={`Documentación — ${documentationModal.programName}`}
            files={(documentationQuery.data ?? []) as { id: number; fileName: string; fileUrl: string }[]}
            isLoading={documentationQuery.isLoading}
            onClose={() => setDocumentationModal(null)}
            onDelete={(id) => deleteDocumentationMutation.mutate({ id, companyId: companyId! })}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
