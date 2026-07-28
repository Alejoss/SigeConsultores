import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Download, Upload, FileText, Trash2, X, Paperclip, BarChart2 } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportRow {
  name: string;
  type?: "Mandatoria" | "Reglamentaria" | "Sugerida";
  objective?: string;
  audience?: string;
  plannedAttendees?: number;
  modality?: "Presencial" | "Online" | "Externa";
  responsible?: string;
  plannedDate?: string;
  completed?: "SI" | "NO";
  conductedDate?: string;
  actualAttendees?: number;
  _rowIndex: number;
  _error?: string;
}

interface Training {
  id: number;
  companyId: number;
  name: string;
  objective: string | null;
  type: "Mandatoria" | "Reglamentaria" | "Sugerida";
  audience: string | null;
  plannedAttendees: number;
  modality: "Presencial" | "Online" | "Externa";
  responsible: string | null;
  completed: "SI" | "NO" | null;
  plannedDate: Date | null;
  conductedDate: Date | null;
  actualAttendees: number;
  attendancePercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  name: string;
  objective: string;
  type: "Mandatoria" | "Reglamentaria" | "Sugerida" | "";
  audience: string;
  plannedAttendees: string;
  modality: "Presencial" | "Online" | "Externa" | "";
  responsible: string;
  completed: "SI" | "NO" | "";
  plannedDate: string;
  conductedDate: string;
  actualAttendees: string;
}

const emptyForm: FormData = {
  name: "",
  objective: "",
  type: "",
  audience: "",
  plannedAttendees: "",
  modality: "",
  responsible: "",
  completed: "",
  plannedDate: "",
  conductedDate: "",
  actualAttendees: "",
};

// ─── Constantes para Gantt ────────────────────────────────────────────────────
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Mandatoria:    { bg: "bg-red-100",    text: "text-red-800",    border: "border-red-300" },
  Reglamentaria: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  Sugerida:      { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300" },
};

// ─── Componente: Cronograma de Gantt ─────────────────────────────────────────
function GanttPanel({ trainings, onClose }: { trainings: Training[]; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // Años disponibles (de las fechas planificadas + año actual)
  const years = Array.from(new Set([
    currentYear,
    ...trainings
      .filter(t => t.plannedDate)
      .map(t => new Date(t.plannedDate as Date | string).getFullYear()),
  ])).sort();

  // Capacitaciones con fecha en el año seleccionado
  const withDate = trainings
    .filter(t => t.plannedDate)
    .map(t => ({
      ...t,
      month: new Date(t.plannedDate as Date | string).getMonth(),
      planYear: new Date(t.plannedDate as Date | string).getFullYear(),
    }))
    .filter(t => t.planYear === year)
    .sort((a, b) => a.month - b.month);

  // Capacitaciones sin fecha planificada
  const noDate = trainings.filter(t => !t.plannedDate);

  const currentMonth = new Date().getMonth();

  return (
    <div className="mt-6 bg-white border rounded-xl shadow-sm overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
        <div className="flex items-center gap-3 flex-wrap">
          <BarChart2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <h3 className="font-bold text-gray-800 text-lg">Cronograma de Gantt — Capacitaciones</h3>
          {/* Selector de año */}
          <div className="flex items-center gap-1 ml-2">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  y === year
                    ? "bg-indigo-600 text-white"
                    : "bg-white border text-gray-600 hover:bg-indigo-50"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 px-5 py-2 bg-gray-50 border-b text-xs flex-wrap">
        {Object.entries(TYPE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm border ${colors.bg} ${colors.border}`} />
            <span className="text-gray-600">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border bg-green-100 border-green-300" />
          <span className="text-gray-600">Impartida</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border bg-gray-100 border-gray-300" />
          <span className="text-gray-500">Sin fecha</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2.5 font-semibold text-gray-700 w-56 sticky left-0 bg-gray-50 z-10 border-r">
                Capacitación
              </th>
              {MONTHS.map((m, i) => (
                <th
                  key={i}
                  className={`text-center py-2.5 font-medium text-xs w-16 ${
                    i === currentMonth && year === currentYear
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-500"
                  }`}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withDate.length === 0 && noDate.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-10 text-gray-400 italic">
                  No hay capacitaciones registradas
                </td>
              </tr>
            ) : withDate.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-6 text-gray-400 italic">
                  No hay capacitaciones con fecha planificada en {year}
                </td>
              </tr>
            ) : null}

            {withDate.map((training, rowIndex) => {
              const colors = TYPE_COLORS[training.type] ?? TYPE_COLORS["Sugerida"];
              const isCompleted = training.completed === "SI";
              // Primeras 3 filas: tooltip hacia abajo; el resto: hacia arriba
              const tooltipDown = rowIndex < 3;
              return (
                <tr key={training.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r">
                    <div
                      className="font-medium text-gray-800 truncate max-w-[200px]"
                      title={training.name}
                    >
                      {training.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{training.type}</div>
                  </td>
                  {MONTHS.map((_, colMonth) => {
                    const isThisMonth = colMonth === training.month;
                    const isCurrent = colMonth === currentMonth && year === currentYear;
                    return (
                      <td
                        key={colMonth}
                        className={`text-center py-2 ${isCurrent ? "bg-indigo-50" : ""}`}
                      >
                        {isThisMonth ? (
                          <div className="relative group flex justify-center">
                            {/* Marcador */}
                            <div
                              className={`mx-1 rounded px-1 py-1 text-xs font-bold border cursor-default ${
                                isCompleted
                                  ? "bg-green-100 text-green-800 border-green-300"
                                  : `${colors.bg} ${colors.text} ${colors.border}`
                              }`}
                            >
                              {isCompleted ? "✓" : "●"}
                            </div>
                            {/* Tooltip enriquecido */}
                            <div className={`absolute ${tooltipDown ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 z-50 hidden group-hover:block pointer-events-none`}>
                              <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px] whitespace-normal">
                                <div className="font-semibold text-sm mb-1.5 leading-tight">{training.name}</div>
                                <div className="space-y-1 text-gray-300">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400">Tipo:</span>
                                    <span className={isCompleted ? "text-green-400" : "text-white"}>{training.type}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400">Fecha:</span>
                                    <span>{MONTHS[training.month]} {year}</span>
                                  </div>
                                  {training.responsible && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-400">Responsable:</span>
                                      <span>{training.responsible}</span>
                                    </div>
                                  )}
                                  {training.modality && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-400">Modalidad:</span>
                                      <span>{training.modality}</span>
                                    </div>
                                  )}
                                  {training.objective && (
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-700">
                                      <span className="text-gray-400">Objetivo:</span>
                                      <div className="mt-0.5 text-gray-200 leading-snug line-clamp-3">{training.objective}</div>
                                    </div>
                                  )}
                                  {isCompleted && (
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 text-green-400 font-medium">
                                      ✓ Capacitación impartida
                                    </div>
                                  )}
                                </div>
                                {/* Flecha del tooltip */}
                                <div className={`absolute ${tooltipDown ? 'bottom-full border-b-gray-900 border-t-transparent' : 'top-full border-t-gray-900 border-b-transparent'} left-1/2 -translate-x-1/2 border-4 border-transparent`} />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Capacitaciones sin fecha — al final, atenuadas */}
            {noDate.map((training) => (
              <tr key={training.id} className="border-b opacity-50">
                <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r">
                  <div
                    className="font-medium text-gray-500 truncate max-w-[200px]"
                    title={training.name}
                  >
                    {training.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{training.type}</div>
                </td>
                {MONTHS.map((_, i) => (
                  <td key={i} className="text-center py-2">
                    {i === 0 ? (
                      <span className="text-xs text-gray-400 italic whitespace-nowrap">Sin fecha</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pie */}
      <div className="px-5 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-4 flex-wrap">
        <span>
          {withDate.length} capacitación{withDate.length !== 1 ? "es" : ""} planificada{withDate.length !== 1 ? "s" : ""} en {year}
        </span>
        {noDate.length > 0 && (
          <span>{noDate.length} sin fecha planificada</span>
        )}
        <span className="ml-auto">✓ Se actualiza automáticamente al editar fechas</span>
      </div>
    </div>
  );
}

// ─── Componente: Respaldos de una capacitación ───────────────────────────────
function TrainingBackupsPanel({ trainingId, companyId, onClose }: {
  trainingId: number;
  companyId: number;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const { data: backups = [], isLoading } = trpc.trainingBackups.list.useQuery(
    { trainingId },
    { enabled: trainingId > 0 }
  );

  const addMutation = trpc.trainingBackups.add.useMutation();
  const deleteMutation = trpc.trainingBackups.delete.useMutation();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/procedure-file", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir el archivo");
      const data = await res.json();
      await addMutation.mutateAsync({
        trainingId,
        companyId,
        fileName: file.name,
        fileUrl: data.url,
        fileKey: data.key || data.url,
        fileSizeBytes: file.size,
      });
      toast.success("Respaldo subido exitosamente");
      await utils.trainingBackups.list.invalidate({ trainingId });
    } catch {
      toast.error("Error al subir el respaldo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (backupId: number) => {
    if (!confirm("¿Eliminar este respaldo?")) return;
    try {
      await deleteMutation.mutateAsync({ backupId });
      toast.success("Respaldo eliminado");
      await utils.trainingBackups.list.invalidate({ trainingId });
    } catch {
      toast.error("Error al eliminar el respaldo");
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mt-4 border rounded-lg bg-gray-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Respaldos de la capacitación
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 py-2">Cargando respaldos...</div>
      ) : backups.length === 0 ? (
        <div className="text-sm text-gray-500 py-2">No hay respaldos subidos aún.</div>
      ) : (
        <div className="space-y-2 mb-3">
          {(backups as any[]).map((backup: any) => (
            <div key={backup.id} className="flex items-center justify-between bg-white border rounded px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <a
                  href={backup.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate max-w-xs"
                >
                  {backup.fileName}
                </a>
                {backup.fileSizeBytes > 0 && (
                  <span className="text-gray-400 flex-shrink-0">{formatSize(backup.fileSizeBytes)}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 flex-shrink-0"
                onClick={() => handleDelete(backup.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Subiendo..." : "Subir respaldo"}
        </Button>
        <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, PowerPoint, imágenes, ZIP</p>
      </div>
    </div>
  );
}

// ─── Componente: Cronograma Anual (archivo) ───────────────────────────────────
function TrainingScheduleButton({ companyId }: { companyId: number }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const { data: schedule } = trpc.trainingSchedules.get.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const upsertMutation = trpc.trainingSchedules.upsert.useMutation();
  const deleteMutation = trpc.trainingSchedules.delete.useMutation();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/procedure-file", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir el archivo");
      const data = await res.json();
      await upsertMutation.mutateAsync({
        companyId,
        year: new Date().getFullYear(),
        fileName: file.name,
        fileUrl: data.url,
        fileKey: data.key || data.url,
        fileSizeBytes: file.size,
      });
      toast.success("Cronograma anual subido exitosamente");
      await utils.trainingSchedules.get.invalidate({ companyId });
    } catch {
      toast.error("Error al subir el cronograma");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar el cronograma anual?")) return;
    try {
      await deleteMutation.mutateAsync({ companyId });
      toast.success("Cronograma eliminado");
      await utils.trainingSchedules.get.invalidate({ companyId });
    } catch {
      toast.error("Error al eliminar el cronograma");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {schedule ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-3 py-1.5 text-sm">
          <FileText className="w-4 h-4 text-green-600" />
          <a
            href={(schedule as any).fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-700 hover:underline font-medium"
          >
            {(schedule as any).fileName}
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
            onClick={handleDelete}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2"
      >
        <Upload className="w-4 h-4" />
        {uploading ? "Subiendo..." : schedule ? "Actualizar Cronograma" : "Subir Cronograma Anual"}
      </Button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Trainings() {
  const [, navigate] = useLocation();
  const companyId = typeof window !== "undefined"
    ? (() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCid = urlParams.get("companyId");
        if (urlCid) return parseInt(urlCid);
        const stored = localStorage.getItem("managerCompanyId") || localStorage.getItem("selectedCompanyId");
        return stored ? parseInt(stored) : 0;
      })()
    : 0;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [backupsPanelId, setBackupsPanelId] = useState<number | null>(null);
  const [showGantt, setShowGantt] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data: trainingsData, isLoading } = trpc.companyTrainings.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const trainings = (trainingsData || []) as Training[];

  const createMutation = trpc.companyTrainings.create.useMutation();
  const updateMutation = trpc.companyTrainings.update.useMutation();
  const deleteMutation = trpc.companyTrainings.delete.useMutation();
  const importBulkMutation = trpc.companyTrainings.importBulk.useMutation();
  const clearByCompanyMutation = trpc.companyTrainings.clearByCompany.useMutation();
  const utils = trpc.useUtils();

  const calcAttendancePercentage = (actual: string, planned: string) => {
    const a = parseInt(actual);
    const p = parseInt(planned);
    if (!a || !p || p === 0) return 0;
    return Math.round((a / p) * 100);
  };

  const handleAddTraining = async () => {
    if (!formData.name || !formData.type) {
      toast.error("Por favor completa los campos requeridos (Capacitación y Tipo)");
      return;
    }
    try {
      await createMutation.mutateAsync({
        companyId,
        name: formData.name,
        objective: formData.objective || undefined,
        type: formData.type as "Mandatoria" | "Reglamentaria" | "Sugerida",
        audience: formData.audience || undefined,
        plannedAttendees: formData.plannedAttendees ? parseInt(formData.plannedAttendees) : undefined,
        modality: formData.modality as "Presencial" | "Online" | "Externa" | undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed ? (formData.completed as "SI" | "NO") : undefined,
        plannedDate: formData.plannedDate || undefined,
        conductedDate: formData.conductedDate || undefined,
        actualAttendees: formData.actualAttendees ? parseInt(formData.actualAttendees) : undefined,
        attendancePercentage: calcAttendancePercentage(formData.actualAttendees, formData.plannedAttendees),
      });
      toast.success("Capacitación creada exitosamente");
      setFormData(emptyForm);
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al crear la capacitación");
    }
  };

  const handleUpdateTraining = async (id: number) => {
    if (!formData.name || !formData.type) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        trainingId: id,
        name: formData.name,
        objective: formData.objective || undefined,
        type: formData.type as "Mandatoria" | "Reglamentaria" | "Sugerida",
        audience: formData.audience || undefined,
        plannedAttendees: formData.plannedAttendees ? parseInt(formData.plannedAttendees) : undefined,
        modality: formData.modality as "Presencial" | "Online" | "Externa" | undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed ? (formData.completed as "SI" | "NO") : undefined,
        plannedDate: formData.plannedDate || undefined,
        conductedDate: formData.conductedDate || undefined,
        actualAttendees: formData.actualAttendees ? parseInt(formData.actualAttendees) : undefined,
        attendancePercentage: calcAttendancePercentage(formData.actualAttendees, formData.plannedAttendees),
      });
      toast.success("Capacitación actualizada exitosamente");
      setFormData(emptyForm);
      setEditingId(null);
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al actualizar la capacitación");
    }
  };

  const handleDeleteTraining = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta capacitación?")) return;
    try {
      await deleteMutation.mutateAsync({ trainingId: id });
      toast.success("Capacitación eliminada");
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al eliminar la capacitación");
    }
  };

  const handleEditTraining = (training: Training) => {
    const toDateStr = (d: Date | null | string) => {
      if (!d) return "";
      const dt = typeof d === "string" ? new Date(d) : d;
      return dt.toISOString().split("T")[0];
    };
    setFormData({
      name: training.name,
      objective: training.objective || "",
      type: training.type,
      audience: training.audience || "",
      plannedAttendees: training.plannedAttendees ? training.plannedAttendees.toString() : "",
      modality: training.modality,
      responsible: training.responsible || "",
      completed: training.completed || "",
      plannedDate: toDateStr(training.plannedDate),
      conductedDate: toDateStr(training.conductedDate),
      actualAttendees: training.actualAttendees ? training.actualAttendees.toString() : "",
    });
    setEditingId(training.id);
    setExpandedId(training.id); // Asegurar que la tarjeta esté expandida para mostrar el formulario inline
  };

  const totalTrainings = trainings.length;
  const conductedTrainings = trainings.filter(t => t.completed === "SI").length;
  const percentageConducted = totalTrainings > 0 ? Math.round((conductedTrainings / totalTrainings) * 100) : 0;
  const trainingsWithAttendance = trainings.filter(t => t.attendancePercentage > 0);
  const percentageAttendance = trainingsWithAttendance.length > 0
    ? Math.round(trainingsWithAttendance.reduce((sum, t) => sum + t.attendancePercentage, 0) / trainingsWithAttendance.length)
    : 0;

  // ─── Importación desde Excel ─────────────────────────────────────────────
  const downloadTemplate = () => {
    const templateData = [
      {
        "Capacitación (Obligatorio)": "Ejemplo: Primeros Auxilios",
        "Tipo (Mandatoria/Reglamentaria/Sugerida)": "Mandatoria",
        "Modalidad (Presencial/Online/Externa)": "Presencial",
        "Objetivo": "Capacitar al personal en primeros auxilios básicos",
        "Destinatario": "Todo el personal",
        "Responsable": "Juan Pérez",
        "Asistentes Previstos": 20,
        "Fecha Planificada (YYYY-MM-DD)": "2026-03-15",
      },
      {
        "Capacitación (Obligatorio)": "Ejemplo: Manejo de Residuos",
        "Tipo (Mandatoria/Reglamentaria/Sugerida)": "Reglamentaria",
        "Modalidad (Presencial/Online/Externa)": "Online",
        "Objetivo": "Cumplir con normativa ambiental",
        "Destinatario": "Área operativa",
        "Responsable": "Ana López",
        "Asistentes Previstos": 15,
        "Fecha Planificada (YYYY-MM-DD)": "2026-05-20",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    // Ancho de columnas
    ws["!cols"] = [{ wch: 35 }, { wch: 38 }, { wch: 35 }, { wch: 45 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_cronograma_capacitaciones.xlsx");
    toast.success("Plantilla descargada");
  };

  const VALID_TYPES = ["Mandatoria", "Reglamentaria", "Sugerida"];
  const VALID_MODALITIES = ["Presencial", "Online", "Externa"];

  // Convierte fecha serial de Excel o string a YYYY-MM-DD
  const excelDateToISO = (val: unknown): string | undefined => {
    if (!val && val !== 0) return undefined;
    const str = String(val).trim();
    if (!str) return undefined;
    // Si es número serial de Excel (ej. 46034)
    const num = Number(str);
    if (!isNaN(num) && num > 1000 && num < 100000) {
      // Excel serial: días desde 1900-01-01 (con bug del año bisiesto de Lotus)
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + num * 86400000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
    // Si es string de fecha (YYYY-MM-DD, DD/MM/YYYY, etc.)
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return undefined;
  };

  // Busca un valor en el row usando múltiples posibles nombres de columna
  const getCol = (row: Record<string, unknown>, ...keys: string[]): string => {
    for (const key of keys) {
      const val = row[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
    }
    return "";
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (rows.length === 0) { setImportError("El archivo está vacío o no tiene filas de datos."); return; }
        const parsed: ImportRow[] = rows.map((row, idx) => {
          // Nombres alternativos de columnas para mayor flexibilidad
          const name = getCol(row,
            "Capacitación (Obligatorio)", "Capacitacion (Obligatorio)",
            "Capacitación", "Capacitacion", "Nombre", "name"
          );
          const rawType = getCol(row,
            "Tipo (Mandatoria/Reglamentaria/Sugerida)", "Tipo", "type"
          );
          const rawModality = getCol(row,
            "Modalidad (Presencial/Online/Externa)", "Modalidad", "modality"
          );
          const rawDate = getCol(row,
            "Fecha Planificada (YYYY-MM-DD)", "Fecha Planificada", "Fecha", "plannedDate"
          ) || row["Fecha Planificada (YYYY-MM-DD)"];
          const type = VALID_TYPES.includes(rawType) ? rawType as ImportRow["type"] : undefined;
          const modality = VALID_MODALITIES.includes(rawModality) ? rawModality as ImportRow["modality"] : undefined;
          const rawAttendees = getCol(row, "Asistentes Previstos", "Asistentes", "plannedAttendees");
          const plannedAttendees = parseInt(rawAttendees) || undefined;
          const plannedDate = excelDateToISO(rawDate);
          // Columnas de seguimiento post-capacitación (I, J, K)
          const rawCompleted = getCol(row, "Capacitación Impartida (SI/NO)", "Capacitacion Impartida (SI/NO)", "Impartida", "completed").toUpperCase();
          const completed: "SI" | "NO" | undefined = rawCompleted === "SI" ? "SI" : rawCompleted === "NO" ? "NO" : undefined;
          const rawConductedDate = getCol(row, "Fecha en la que se Impartió (YYYY-MM-DD)", "Fecha en la que se Impartio (YYYY-MM-DD)", "Fecha Impartida", "conductedDate") || row["Fecha en la que se Impartió (YYYY-MM-DD)"];
          const conductedDate = excelDateToISO(rawConductedDate);
          const rawActualAttendees = getCol(row, "Numero de Asistentes", "Número de Asistentes", "Asistentes Reales", "actualAttendees");
          const actualAttendees = parseInt(rawActualAttendees) || undefined;
          const error = !name ? "Falta el nombre de la capacitación" :
            (rawType && !type) ? `Tipo inválido: "${rawType}"` :
            (rawModality && !modality) ? `Modalidad inválida: "${rawModality}"` : undefined;
          return {
            name,
            type,
            objective: getCol(row, "Objetivo", "objective") || undefined,
            audience: getCol(row, "Destinatario", "Audiencia", "audience") || undefined,
            plannedAttendees,
            modality,
            responsible: getCol(row, "Responsable", "responsible") || undefined,
            plannedDate,
            completed,
            conductedDate,
            actualAttendees,
            _rowIndex: idx + 2,
            _error: error,
          };
        });
        setImportRows(parsed);
        setShowImportModal(true);
      } catch {
        setImportError("No se pudo leer el archivo. Asegúrate de que sea un Excel válido (.xlsx o .xls).");
      }
    };
    reader.readAsArrayBuffer(file);
    // Limpiar input para permitir subir el mismo archivo de nuevo
    e.target.value = "";
  };

  const handleConfirmImport = async () => {
    const validRows = importRows.filter(r => !r._error && r.name);
    if (validRows.length === 0) { toast.error("No hay filas válidas para importar"); return; }
    try {
      // Si modo reemplazar: borrar todas las capacitaciones existentes primero
      if (replaceMode) {
        await clearByCompanyMutation.mutateAsync({ companyId });
      }
      const result = await importBulkMutation.mutateAsync({
        companyId,
        rows: validRows.map(r => ({
          name: r.name,
          type: r.type,
          objective: r.objective,
          audience: r.audience,
          plannedAttendees: r.plannedAttendees,
          modality: r.modality,
          responsible: r.responsible,
          plannedDate: r.plannedDate,
          completed: r.completed,
          conductedDate: r.conductedDate,
          actualAttendees: r.actualAttendees,
        })),
      });
      const action = replaceMode ? "reemplazaron" : "importaron";
      toast.success(`Se ${action} ${result.inserted} capacitaciones exitosamente`);
      setShowImportModal(false);
      setImportRows([]);
      setReplaceMode(false);
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al importar las capacitaciones");
    }
  };

  const exportToExcel = () => {
    const toDateStr = (d: Date | null | string) => {
      if (!d) return "";
      const dt = typeof d === "string" ? new Date(d) : d;
      return dt.toLocaleDateString("es-ES");
    };
    const data = trainings.map(t => ({
      "Capacitación": t.name,
      "Tipo": t.type,
      "Modalidad": t.modality,
      "Objetivo": t.objective || "",
      "Destinatario": t.audience || "",
      "Responsable": t.responsible || "",
      "Asistentes Previstos": t.plannedAttendees,
      "Fecha Planificada": toDateStr(t.plannedDate),
      "Impartida": t.completed || "",
      "Fecha Impartida": toDateStr(t.conductedDate),
      "Asistentes Reales": t.actualAttendees,
      "% Asistencia": `${Math.round(t.attendancePercentage)}%`,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Capacitaciones");
    XLSX.writeFile(workbook, "capacitaciones_empresa.xlsx");
    toast.success("Archivo exportado exitosamente");
  };

  const toDisplayDate = (d: Date | null | string) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("es-ES");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Capacitaciones</h1>
          <Button variant="outline" onClick={() => {
            const cid = localStorage.getItem("managerCompanyId") || localStorage.getItem("selectedCompanyId");
            navigate(cid ? `/audits-inspections?companyId=${cid}` : "/audits-inspections");
          }}>
            ← Volver
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-white border-l-4 border-l-purple-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Total de Capacitaciones</div>
              <div className="text-3xl font-bold text-purple-600">{totalTrainings}</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">% Capacitaciones Impartidas</div>
              <div className="text-3xl font-bold text-blue-600">{percentageConducted} %</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-green-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">% Asistencia</div>
              <div className="text-3xl font-bold text-green-600">{percentageAttendance} %</div>
            </CardContent>
          </Card>
        </div>

        {/* Lista */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Capacitaciones Registradas</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Botón Gantt */}
              <Button
                variant={showGantt ? "default" : "outline"}
                onClick={() => setShowGantt(!showGantt)}
                className={`flex items-center gap-2 ${showGantt ? "bg-indigo-600 hover:bg-indigo-700" : ""}`}
              >
                <BarChart2 className="w-4 h-4" />
                Cronograma de Gantt
              </Button>
              {/* Botón Cronograma Anual */}
              <TrainingScheduleButton companyId={companyId} />
              {/* Botón Descargar Plantilla */}
              <Button onClick={downloadTemplate} variant="outline" className="flex gap-2 border-emerald-400 text-emerald-700 hover:bg-emerald-50">
                <FileText className="w-4 h-4" />
                Descargar Plantilla
              </Button>
              {/* Botón Importar desde Excel */}
              <Button
                onClick={() => importFileRef.current?.click()}
                variant="outline"
                className="flex gap-2 border-blue-400 text-blue-700 hover:bg-blue-50"
              >
                <Upload className="w-4 h-4" />
                Importar desde Excel
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
              />
              {/* Botón Exportar Excel */}
              <Button onClick={exportToExcel} variant="outline" className="flex gap-2">
                <Download className="w-4 h-4" />
                Exportar a Excel
              </Button>
              {/* Botón Eliminar todas */}
              {trainings.length > 0 && (
                <Button
                  variant="destructive"
                  className="flex gap-2"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar las ${trainings.length} capacitaciones? Esta acción no se puede deshacer.`)) {
                      clearByCompanyMutation.mutate({ companyId });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar todas
                </Button>
              )}
            </div>
          </div>

          {/* Panel Gantt */}
          {showGantt && (
            <GanttPanel
              trainings={trainings}
              onClose={() => setShowGantt(false)}
            />
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Cargando capacitaciones...</div>
          ) : trainings.length === 0 ? (
            <Card className="bg-white mt-4">
              <CardContent className="pt-6 text-center text-gray-500">
                No hay capacitaciones registradas aún
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 mt-4">
              {trainings.map((training) => (
                <Card key={training.id} className="bg-white">
                  <div
                    className="p-5 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                    onClick={() => {
                      setExpandedId(expandedId === training.id ? null : training.id);
                      if (backupsPanelId === training.id) setBackupsPanelId(null);
                    }}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">{training.name}</h3>
                      <div className="flex gap-2 flex-wrap text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded">{training.type}</span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">{training.modality}</span>
                        {training.completed === "SI" && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">✓ Impartida</span>
                        )}
                        {training.completed === "NO" && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded">Pendiente</span>
                        )}
                      </div>
                    </div>
                    {expandedId === training.id
                      ? <ChevronUp className="w-5 h-5 text-gray-400" />
                      : <ChevronDown className="w-5 h-5 text-gray-400" />
                    }
                  </div>

                  {expandedId === training.id && (
                    <CardContent className="pt-0 pb-6 border-t">
                      {/* Formulario inline de edición */}
                      {editingId === training.id ? (
                        <div className="mt-4 space-y-4">
                          <h3 className="text-sm font-bold text-blue-700 mb-2">Editando capacitación</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Capacitación *</label>
                              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nombre de la capacitación" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Objetivo</label>
                              <Textarea value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} placeholder="Objetivo" className="min-h-[60px]" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo *</label>
                              <NativeSelect value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as FormData["type"] })}>
                                <option value="">Selecciona el tipo</option>
                                <option value="Mandatoria">Mandatoria</option>
                                <option value="Reglamentaria">Reglamentaria</option>
                                <option value="Sugerida">Sugerida</option>
                              </NativeSelect>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Modalidad</label>
                              <NativeSelect value={formData.modality} onChange={(e) => setFormData({ ...formData, modality: e.target.value as FormData["modality"] })}>
                                <option value="">Selecciona la modalidad</option>
                                <option value="Presencial">Presencial</option>
                                <option value="Online">Online</option>
                                <option value="Externa">Externa</option>
                              </NativeSelect>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Destinatario</label>
                              <Input value={formData.audience} onChange={(e) => setFormData({ ...formData, audience: e.target.value })} placeholder="Destinatario" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Responsable</label>
                              <Input value={formData.responsible} onChange={(e) => setFormData({ ...formData, responsible: e.target.value })} placeholder="Responsable" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Asistentes Previstos</label>
                              <Input type="number" value={formData.plannedAttendees} onChange={(e) => setFormData({ ...formData, plannedAttendees: e.target.value })} placeholder="0" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha Planificada</label>
                              <Input type="date" value={formData.plannedDate} onChange={(e) => setFormData({ ...formData, plannedDate: e.target.value })} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">¿Fue Impartida?</label>
                              <NativeSelect value={formData.completed} onChange={(e) => setFormData({ ...formData, completed: e.target.value as FormData["completed"] })}>
                                <option value="">¿Fue impartida?</option>
                                <option value="SI">Sí</option>
                                <option value="NO">No</option>
                              </NativeSelect>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha en que se Impartió</label>
                              <Input type="date" value={formData.conductedDate} onChange={(e) => setFormData({ ...formData, conductedDate: e.target.value })} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Número de Asistentes</label>
                              <Input type="number" value={formData.actualAttendees} onChange={(e) => setFormData({ ...formData, actualAttendees: e.target.value })} placeholder="0" />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button onClick={() => handleUpdateTraining(training.id)} className="bg-blue-600 hover:bg-blue-700">Actualizar</Button>
                            <Button variant="outline" onClick={() => { setFormData(emptyForm); setEditingId(null); }}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => { if (window.confirm('¿Eliminar esta capacitación?')) { handleDeleteTraining(training.id); setEditingId(null); } }}>Eliminar</Button>
                          </div>
                        </div>
                      ) : (
                      <>
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                        {training.objective && (
                          <div className="col-span-2">
                            <span className="font-semibold text-gray-700">Objetivo: </span>
                            <span className="text-gray-600">{training.objective}</span>
                          </div>
                        )}
                        {training.audience && (
                          <div>
                            <span className="font-semibold text-gray-700">Destinatario: </span>
                            <span className="text-gray-600">{training.audience}</span>
                          </div>
                        )}
                        {training.responsible && (
                          <div>
                            <span className="font-semibold text-gray-700">Responsable: </span>
                            <span className="text-gray-600">{training.responsible}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-gray-700">Asistentes Previstos: </span>
                          <span className="text-gray-600">{training.plannedAttendees}</span>
                        </div>
                        {training.plannedDate && (
                          <div>
                            <span className="font-semibold text-gray-700">Fecha Planificada: </span>
                            <span className="text-gray-600">{toDisplayDate(training.plannedDate)}</span>
                          </div>
                        )}
                        {training.conductedDate && (
                          <div>
                            <span className="font-semibold text-gray-700">Fecha Impartida: </span>
                            <span className="text-gray-600">{toDisplayDate(training.conductedDate)}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-gray-700">Asistentes Reales: </span>
                          <span className="text-gray-600">{training.actualAttendees}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">% Asistencia: </span>
                          <span className={`font-semibold ${
                            training.attendancePercentage >= 80 ? "text-green-600"
                            : training.attendancePercentage >= 60 ? "text-yellow-600"
                            : "text-red-600"
                          }`}>{Math.round(training.attendancePercentage)}%</span>
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div className="flex gap-2 mt-4 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => handleEditTraining(training)}>
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBackupsPanelId(backupsPanelId === training.id ? null : training.id);
                          }}
                        >
                          <Paperclip className="w-4 h-4" />
                          Respaldos
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteTraining(training.id)}>
                          Eliminar
                        </Button>
                      </div>

                      {/* Panel de respaldos */}
                      {backupsPanelId === training.id && (
                        <TrainingBackupsPanel
                          trainingId={training.id}
                          companyId={companyId}
                          onClose={() => setBackupsPanelId(null)}
                        />
                      )}
                      </>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Formulario de nueva capacitación (solo visible cuando NO se está editando inline) */}
        <Card className="bg-white">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
            <CardTitle>Nueva Capacitación</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Capacitación *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la capacitación"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Objetivo</label>
              <Textarea
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                placeholder="Describe el objetivo de la capacitación"
                className="min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo *</label>
              <NativeSelect
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as FormData["type"] })}
              >
                <option value="">Selecciona el tipo de capacitación</option>
                <option value="Mandatoria">Mandatoria</option>
                <option value="Reglamentaria">Reglamentaria</option>
                <option value="Sugerida">Sugerida</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Destinatario</label>
              <Input
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                placeholder="Ejemplo: todo el personal, personal de mantenimiento, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Asistentes Previstos</label>
              <Input
                type="number"
                value={formData.plannedAttendees}
                onChange={(e) => setFormData({ ...formData, plannedAttendees: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Modalidad</label>
              <NativeSelect
                value={formData.modality}
                onChange={(e) => setFormData({ ...formData, modality: e.target.value as FormData["modality"] })}
              >
                <option value="">Selecciona la modalidad</option>
                <option value="Presencial">Presencial</option>
                <option value="Online">Online</option>
                <option value="Externa">Externa</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Responsable</label>
              <Input
                value={formData.responsible}
                onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                placeholder="Nombre del responsable de la capacitación"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Planificada</label>
              <Input
                type="date"
                value={formData.plannedDate}
                onChange={(e) => setFormData({ ...formData, plannedDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Capacitación Impartida</label>
              <NativeSelect
                value={formData.completed}
                onChange={(e) => setFormData({ ...formData, completed: e.target.value as FormData["completed"] })}
              >
                <option value="">¿Fue impartida?</option>
                <option value="SI">Sí</option>
                <option value="NO">No</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha en la que se Impartió</label>
              <Input
                type="date"
                value={formData.conductedDate}
                onChange={(e) => setFormData({ ...formData, conductedDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Asistentes</label>
              <Input
                type="number"
                value={formData.actualAttendees}
                onChange={(e) => setFormData({ ...formData, actualAttendees: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex gap-2 pt-2">
              {editingId ? (
                <>
                  <Button onClick={() => handleUpdateTraining(editingId)} className="bg-blue-600 hover:bg-blue-700">
                    Actualizar
                  </Button>
                  <Button variant="outline" onClick={() => { setFormData(emptyForm); setEditingId(null); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddTraining} className="bg-purple-600 hover:bg-purple-700">
                  Agregar Capacitación
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Vista Previa de Importación */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Vista previa de importación</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {importRows.filter(r => !r._error).length} filas válidas de {importRows.length} detectadas.
                  {importRows.some(r => r._error) && (
                    <span className="text-red-500 ml-2">{importRows.filter(r => r._error).length} con errores (no se importarán).</span>
                  )}
                </p>
              </div>
              <button onClick={() => { setShowImportModal(false); setImportRows([]); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tabla de vista previa */}
            <div className="overflow-auto flex-1 p-4">
              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{importError}</div>
              )}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Capacitación</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Tipo</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Modalidad</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Responsable</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Fecha Planificada</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Asistentes</th>
                    <th className="border px-3 py-2 text-left text-xs font-semibold text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row) => (
                    <tr key={row._rowIndex} className={row._error ? "bg-red-50" : "hover:bg-gray-50"}>
                      <td className="border px-3 py-2 text-gray-400 text-xs">{row._rowIndex}</td>
                      <td className="border px-3 py-2 font-medium text-gray-900">{row.name || <span className="text-red-400 italic">Sin nombre</span>}</td>
                      <td className="border px-3 py-2">
                        {row.type ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.type === "Mandatoria" ? "bg-red-100 text-red-700" :
                            row.type === "Reglamentaria" ? "bg-orange-100 text-orange-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{row.type}</span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="border px-3 py-2 text-gray-700">{row.modality || <span className="text-gray-400 text-xs">—</span>}</td>
                      <td className="border px-3 py-2 text-gray-700">{row.responsible || <span className="text-gray-400 text-xs">—</span>}</td>
                      <td className="border px-3 py-2 text-gray-700">{row.plannedDate || <span className="text-gray-400 text-xs">—</span>}</td>
                      <td className="border px-3 py-2 text-gray-700 text-center">{row.plannedAttendees || <span className="text-gray-400 text-xs">—</span>}</td>
                      <td className="border px-3 py-2">
                        {row._error ? (
                          <span className="flex items-center gap-1 text-red-600 text-xs"><X className="w-3 h-3" />{row._error}</span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">✓ Válida</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pie del modal */}
            <div className="p-6 border-t bg-gray-50 rounded-b-xl">
              {/* Toggle reemplazar */}
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-orange-200 bg-orange-50">
                <input
                  type="checkbox"
                  id="replaceMode"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 cursor-pointer"
                />
                <label htmlFor="replaceMode" className="text-sm cursor-pointer">
                  <span className="font-semibold text-orange-700">Reemplazar todo</span>
                  <span className="text-orange-600 ml-1">— elimina las capacitaciones existentes e importa las del Excel (evita duplicados)</span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Solo se importarán las filas marcadas como <span className="text-green-600 font-medium">✓ Válida</span>.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setShowImportModal(false); setImportRows([]); setReplaceMode(false); }}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    disabled={importBulkMutation.isPending || clearByCompanyMutation.isPending || importRows.filter(r => !r._error).length === 0}
                    className={replaceMode ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700"}
                  >
                    {(importBulkMutation.isPending || clearByCompanyMutation.isPending)
                      ? (replaceMode ? "Reemplazando..." : "Importando...")
                      : replaceMode
                        ? `Reemplazar con ${importRows.filter(r => !r._error).length} capacitaciones`
                        : `Importar ${importRows.filter(r => !r._error).length} capacitaciones`
                    }
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
