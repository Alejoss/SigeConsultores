import { useState, useEffect, useRef, useMemo } from "react";
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

const MANAGEMENT_SYSTEMS = [
  "Calidad",
  "Ambiente",
  "SSO",
  "Seguridad Física",
  "Responsabilidad Social",
  "Otro",
];

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

  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: programs = [], refetch, isLoading } = trpc.managementPrograms.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const createMutation = trpc.managementPrograms.create.useMutation({
    onSuccess: () => { refetch(); toast.success("Programa agregado"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.managementPrograms.update.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.managementPrograms.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Programa eliminado"); },
    onError: (e) => toast.error(e.message),
  });

  const uploadMutation = trpc.managementPrograms.uploadPlan.useMutation({
    onSuccess: () => { refetch(); toast.success("Planificación subida"); },
    onError: (e) => toast.error(e.message),
  });

  const getPlanUrlMutation = trpc.managementPrograms.getPlanUrl.useQuery;

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

  const handleUpdate = (id: number, field: string, value: any) => {
    if (!companyId) return;
    updateMutation.mutate({ id, companyId, [field]: value });
  };

  const handleDelete = (id: number) => {
    if (!companyId) return;
    if (!confirm("¿Eliminar este programa?")) return;
    deleteMutation.mutate({ id, companyId });
  };

  const handleFileUpload = async (id: number, file: File) => {
    if (!companyId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({
        id,
        companyId,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  // Calculate overall compliance
  const overallCompliance = useMemo(() => {
    if (!programs.length) return 0;
    const total = programs.reduce((sum, p) => {
      const planned = p.plannedActions ?? 0;
      const completed = p.completedActions ?? 0;
      const pct = planned > 0
        ? Math.min(100, Math.round((completed / planned) * 100))
        : 0;
      return sum + pct;
    }, 0);
    return Math.round(total / programs.length);
  }, [programs]);

  if (isAuthLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/audits-inspections")}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Programas</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Gestión de programas de sistemas de gestión
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <p className="text-xs text-blue-600 font-semibold">% Cumplimiento</p>
              <p className={`text-2xl font-bold ${overallCompliance >= 80 ? "text-green-600" : overallCompliance >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                {overallCompliance}%
              </p>
            </div>
          </div>
        </div>

        {/* Programs Table */}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin w-6 h-6 text-blue-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {programs.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center text-slate-400">
                  No hay programas registrados. Agregue el primero.
                </CardContent>
              </Card>
            )}
            {programs.map((program) => {
              const planned = program.plannedActions ?? 0;
              const completed = program.completedActions ?? 0;
              const compliance = planned > 0
                ? Math.min(100, Math.round((completed / planned) * 100))
                : 0;
              return (
                <Card key={program.id} className="border border-slate-200">
                  <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      {/* Nombre del Programa */}
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">
                          Nombre del Programa
                        </label>
                        <Input
                          defaultValue={program.programName}
                          onBlur={(e) => handleUpdate(program.id, "programName", e.target.value)}
                          className="text-sm"
                        />
                      </div>

                      {/* Sistema de Gestión */}
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">
                          Sistema de Gestión
                        </label>
                        <select
                          defaultValue={program.managementSystem}
                          onBlur={(e) => handleUpdate(program.id, "managementSystem", e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                        >
                          {MANAGEMENT_SYSTEMS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Acciones Planificadas */}
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">
                          # Acciones Planificadas
                        </label>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={program.plannedActions ?? 0}
                          onBlur={(e) => handleUpdate(program.id, "plannedActions", parseInt(e.target.value) || 0)}
                          className="text-sm"
                        />
                      </div>

                      {/* Acciones Realizadas */}
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">
                          # Acciones Realizadas
                        </label>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={program.completedActions ?? 0}
                          onBlur={(e) => handleUpdate(program.id, "completedActions", parseInt(e.target.value) || 0)}
                          className="text-sm"
                        />
                      </div>

                      {/* Cumplimiento */}
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">
                          Cumplimiento
                        </label>
                        <div className={`w-full border rounded p-2 text-sm font-bold text-center ${
                          compliance >= 80 ? "bg-green-100 text-green-700 border-green-300"
                          : compliance >= 50 ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                          : "bg-red-100 text-red-700 border-red-300"
                        }`}>
                          {compliance}%
                        </div>
                      </div>
                    </div>

                    {/* File actions */}
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="file"
                        ref={(el) => { fileInputRefs.current[program.id] = el; }}
                        className="hidden"
                        accept=".pdf,.xlsx,.xls,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(program.id, file);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1 text-blue-600 border-blue-300"
                        onClick={() => fileInputRefs.current[program.id]?.click()}
                      >
                        <Upload size={14} /> Subir planificación
                      </Button>
                      {program.planFileName && (
                        <PlanViewButton programId={program.id} companyId={companyId!} fileName={program.planFileName} />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(program.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Button */}
        <div className="mt-6">
          <Button
            onClick={handleAddProgram}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Añadir nuevo programa
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

function PlanViewButton({ programId, companyId, fileName }: { programId: number; companyId: number; fileName: string }) {
  const { data, isLoading } = trpc.managementPrograms.getPlanUrl.useQuery(
    { id: programId, companyId },
    { enabled: true }
  );
  if (isLoading) return <Loader2 size={14} className="animate-spin text-slate-400" />;
  if (!data?.url) return null;
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
    >
      <Eye size={14} /> {fileName}
    </a>
  );
}
