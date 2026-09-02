import { useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { ProcessLinkDialog } from "@/components/ProcessLinkDialog";
import { SourceEvidenceButton } from "@/components/SourceEvidenceButton";
import * as XLSX from "xlsx";

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

type ProgramImportField =
  | "action"
  | "responsible"
  | "implementationDate"
  | "completed";
type ProgramImportMapping = Partial<Record<ProgramImportField, number>>;
type ProgramImportData = {
  rows: unknown[][];
  headerRow: number;
  mapping: ProgramImportMapping;
};

type DocumentationModal = {
  programId: number;
  programName: string;
};

const PROGRAM_IMPORT_FIELDS: {
  key: ProgramImportField;
  label: string;
  required?: boolean;
  aliases: string[];
}[] = [
  {
    key: "action",
    label: "Acción",
    required: true,
    aliases: [
      "accion",
      "actividad",
      "tarea",
      "actividad planificada",
      "accion a realizar",
    ],
  },
  {
    key: "responsible",
    label: "Responsable de referencia",
    aliases: ["responsable", "responsable de la accion", "encargado"],
  },
  {
    key: "implementationDate",
    label: "Fecha de implementación",
    aliases: [
      "fecha",
      "fecha de implementacion",
      "fecha limite",
      "vencimiento",
      "plazo",
    ],
  },
  {
    key: "completed",
    label: "Cumplido (SI/NO)",
    aliases: ["cumplido", "completado", "estado", "realizado"],
  },
];

function normalizeImportText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function columnLetter(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function parseProgramDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed)
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}

function parseProgramCompleted(value: unknown): boolean | undefined {
  const normalized = normalizeImportText(value);
  if (
    [
      "si",
      "sí",
      "s",
      "true",
      "1",
      "x",
      "cumplido",
      "completado",
      "realizado",
    ].includes(normalized)
  )
    return true;
  if (["no", "n", "false", "0", "pendiente"].includes(normalized)) return false;
  return undefined;
}

function detectProgramImportMapping(headers: unknown[]): ProgramImportMapping {
  const mapping: ProgramImportMapping = {};
  PROGRAM_IMPORT_FIELDS.forEach(field => {
    const index = headers.findIndex(header =>
      field.aliases.some(alias => normalizeImportText(header).includes(alias))
    );
    if (index >= 0) mapping[field.key] = index;
  });
  return mapping;
}

function ProgramActionsImportDialog({
  programId,
  companyId,
  rows,
  headerRow,
  mapping,
  onMappingChange,
  onHeaderRowChange,
  onClose,
  onImported,
}: {
  programId: number;
  companyId: number;
  rows: unknown[][];
  headerRow: number;
  mapping: ProgramImportMapping;
  onMappingChange: (mapping: ProgramImportMapping) => void;
  onHeaderRowChange: (headerRow: number) => void;
  onClose: () => void;
  onImported: () => void;
}) {
  const importActions = trpc.managementPrograms.importActions.useMutation({
    onSuccess: result => {
      toast.success(
        `Importación completada: ${result.created} acciones nuevas y ${result.updated} actualizadas.${result.protectedCompletion ? ` ${result.protectedCompletion} cumplimiento(s) vinculado(s) se conservaron.` : ""}`
      );
      onImported();
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const header = rows[headerRow] || [];
  const columns = header.map((value, index) => ({
    index,
    label: String(value || `Columna ${columnLetter(index)}`).trim(),
    sample: rows
      .slice(headerRow + 1)
      .find(row => row[index] !== "" && row[index] !== undefined)?.[index],
  }));
  const buildItems = () => {
    if (mapping.action === undefined) {
      toast.error("Seleccione la columna que contiene la Acción.");
      return;
    }
    const items = rows
      .slice(headerRow + 1)
      .map(row => {
        const action = String(row[mapping.action!] ?? "").trim();
        if (!action) return null;
        return {
          action,
          responsible:
            mapping.responsible === undefined
              ? undefined
              : String(row[mapping.responsible] ?? "").trim() || undefined,
          implementationDate:
            mapping.implementationDate === undefined
              ? undefined
              : parseProgramDate(row[mapping.implementationDate]),
          completed:
            mapping.completed === undefined
              ? undefined
              : parseProgramCompleted(row[mapping.completed]),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (!items.length) {
      toast.error(
        "No se encontraron acciones válidas con la relación seleccionada."
      );
      return;
    }
    importActions.mutate({ programId, companyId, items });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-4xl overflow-auto shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Relacionar planificación Excel
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Puede usar la plantilla de ISGE 360 o cualquier Excel de su
                empresa. Seleccione qué columna corresponde a cada campo.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
          <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <label className="mb-1 block text-sm font-semibold text-violet-900">
              Fila donde están los encabezados
            </label>
            <select
              className="h-9 w-full rounded border border-violet-200 bg-white px-2 text-sm"
              value={String(headerRow)}
              onChange={event => onHeaderRowChange(Number(event.target.value))}
            >
              {rows.slice(0, Math.min(rows.length, 20)).map((row, index) => (
                <option key={index} value={index}>
                  Fila {index + 1}:{" "}
                  {row
                    .map(value => String(value ?? "").trim())
                    .filter(Boolean)
                    .slice(0, 4)
                    .join(" · ")
                    .slice(0, 100) || "vacía"}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Campo de ISGE 360</th>
                  <th className="p-3">Columna de su archivo</th>
                  <th className="p-3">Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {PROGRAM_IMPORT_FIELDS.map(field => {
                  const selected = columns.find(
                    column => column.index === mapping[field.key]
                  );
                  return (
                    <tr key={field.key} className="border-t">
                      <td className="p-3 font-medium text-slate-700">
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-red-600">*</span>
                        )}
                      </td>
                      <td className="p-3">
                        <select
                          className="h-9 w-full rounded border bg-white px-2"
                          value={
                            mapping[field.key] === undefined
                              ? ""
                              : String(mapping[field.key])
                          }
                          onChange={event =>
                            onMappingChange({
                              ...mapping,
                              [field.key]:
                                event.target.value === ""
                                  ? undefined
                                  : Number(event.target.value),
                            })
                          }
                        >
                          <option value="">No importar este dato</option>
                          {columns.map(column => (
                            <option key={column.index} value={column.index}>
                              {columnLetter(column.index)} — {column.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {selected?.sample === undefined
                          ? "—"
                          : String(selected.sample)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <strong className="text-red-600">*</strong> Acción es el único dato
            obligatorio. La importación agrega acciones nuevas y actualiza sólo
            las que coincidan; no elimina acciones ni documentos existentes.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="bg-violet-700 hover:bg-violet-800"
              disabled={importActions.isPending}
              onClick={buildItems}
            >
              {importActions.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Importar y gestionar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando
              documentación...
            </div>
          ) : files.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No hay documentación subida aún.
            </p>
          ) : (
            <ul className="space-y-2">
              {files.map(file => (
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
      toast.error(
        "No fue posible abrir la planificación. Inténtelo nuevamente."
      );
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
      {isLoading ? (
        <Loader2 size={14} className="mr-1 animate-spin" />
      ) : (
        <Eye size={14} className="mr-1" />
      )}
      Ver planificación
    </Button>
  );
}

function ProgramActionsPanel({
  programId,
  companyId,
  onChanged,
}: {
  programId: number;
  companyId: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    action: "",
    responsible: "",
    implementationDate: "",
  });
  const [linkAction, setLinkAction] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [importData, setImportData] = useState<ProgramImportData | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const actionsQuery = trpc.managementPrograms.listActions.useQuery(
    { programId, companyId },
    { enabled: open }
  );
  const refresh = () => {
    actionsQuery.refetch();
    onChanged();
  };
  const create = trpc.managementPrograms.createAction.useMutation({
    onSuccess: () => {
      setDraft({ action: "", responsible: "", implementationDate: "" });
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.managementPrograms.updateAction.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const remove = trpc.managementPrograms.deleteAction.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const actions = actionsQuery.data || [];

  const downloadActionsTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Acción",
        "Responsable de referencia",
        "Fecha de implementación",
        "Cumplido (SI/NO)",
      ],
      ["Actualizar la matriz legal", "Responsable SSO", "2026-10-15", "NO"],
      [
        "Capacitar al personal en el procedimiento",
        "Jefe de Talento Humano",
        "2026-11-10",
        "NO",
      ],
    ]);
    sheet["!cols"] = [{ wch: 55 }, { wch: 32 }, { wch: 24 }, { wch: 20 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Acciones del Programa");
    XLSX.writeFile(workbook, "plantilla-acciones-programa-isge360.xlsx");
  };

  const openImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
        raw: true,
      }) as unknown[][];
      if (!rows.length) throw new Error("El archivo está vacío.");
      let headerRow = 0;
      let bestScore = -1;
      rows.slice(0, Math.min(rows.length, 20)).forEach((row, index) => {
        const score = PROGRAM_IMPORT_FIELDS.reduce(
          (total, field) =>
            total +
            (row.some(cell =>
              field.aliases.some(alias =>
                normalizeImportText(cell).includes(alias)
              )
            )
              ? 1
              : 0),
          0
        );
        if (score > bestScore) {
          bestScore = score;
          headerRow = index;
        }
      });
      setImportData({
        rows,
        headerRow,
        mapping: detectProgramImportMapping(rows[headerRow] || []),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible leer la planificación Excel."
      );
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(current => !current)}
      >
        <span>
          <strong className="text-sm text-violet-900">
            Acciones planificadas
          </strong>
          <span className="ml-2 text-xs text-violet-700">
            {open
              ? `${actions.length} actividad(es) detallada(s)`
              : "Agregar, gestionar y vincular acciones"}
          </span>
        </span>
        {open ? (
          <ChevronUp size={17} className="text-violet-700" />
        ) : (
          <ChevronDown size={17} className="text-violet-700" />
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-violet-200 pt-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={openImport}
          />
          <div className="flex flex-wrap gap-2 rounded-md border border-violet-200 bg-white/70 p-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-violet-300 text-violet-800"
              onClick={downloadActionsTemplate}
            >
              <Upload size={14} className="mr-1 rotate-180" />
              Descargar plantilla
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-violet-300 text-violet-800"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} className="mr-1" />
              Importar planificación Excel
            </Button>
            <span className="self-center text-xs text-slate-500">
              La planificación se vuelve editable y vinculable; el archivo
              documental se conserva por separado.
            </span>
          </div>
          {actionsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando acciones...
            </div>
          ) : (
            actions.map(action => (
              <div
                key={action.id}
                className="grid gap-2 rounded-md border border-violet-100 bg-white p-3 md:grid-cols-[minmax(0,1fr)_170px_145px_90px_110px_100px_34px]"
              >
                <Input
                  defaultValue={action.action}
                  placeholder="Acción"
                  onBlur={event =>
                    update.mutate({
                      id: action.id,
                      programId,
                      companyId,
                      action: event.target.value,
                    })
                  }
                />
                <Input
                  defaultValue={action.responsible || ""}
                  placeholder="Referencia"
                  onBlur={event =>
                    update.mutate({
                      id: action.id,
                      programId,
                      companyId,
                      responsible: event.target.value,
                    })
                  }
                />
                <Input
                  type="date"
                  defaultValue={
                    action.implementationDate
                      ? new Date(action.implementationDate)
                          .toISOString()
                          .slice(0, 10)
                      : ""
                  }
                  onBlur={event =>
                    update.mutate({
                      id: action.id,
                      programId,
                      companyId,
                      implementationDate: event.target.value,
                    })
                  }
                />
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(action.completed)}
                    onChange={event =>
                      update.mutate({
                        id: action.id,
                        programId,
                        companyId,
                        completed: event.target.checked,
                      })
                    }
                  />
                  Cumplido
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-teal-300 text-teal-800 hover:bg-teal-50"
                  onClick={() =>
                    setLinkAction({ id: action.id, title: action.action })
                  }
                >
                  <Link2 size={14} className="mr-1" />
                  Vincular
                </Button>
                <SourceEvidenceButton
                  companyId={companyId}
                  sourceType="program_action"
                  sourceId={action.id}
                  compact
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (confirm("¿Eliminar esta acción?"))
                      remove.mutate({ id: action.id, programId, companyId });
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))
          )}
          {!actionsQuery.isLoading && actions.length === 0 && (
            <p className="py-2 text-sm text-slate-500">
              Todavía no hay acciones detalladas. Los contadores actuales se
              conservan hasta que agregue la primera.
            </p>
          )}
          <div className="grid gap-2 rounded-md border border-dashed border-violet-300 bg-white/70 p-3 md:grid-cols-[minmax(0,1fr)_170px_145px_auto]">
            <Input
              value={draft.action}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              placeholder="Nueva acción *"
            />
            <Input
              value={draft.responsible}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  responsible: event.target.value,
                }))
              }
              placeholder="Referencia (opcional)"
            />
            <Input
              type="date"
              value={draft.implementationDate}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  implementationDate: event.target.value,
                }))
              }
            />
            <Button
              size="sm"
              variant="outline"
              className="border-violet-300 text-violet-800"
              disabled={!draft.action.trim() || create.isPending}
              onClick={() => create.mutate({ programId, companyId, ...draft })}
            >
              {create.isPending && (
                <Loader2 size={14} className="mr-1 animate-spin" />
              )}
              <Plus size={15} className="mr-1" />
              Agregar
            </Button>
          </div>
        </div>
      )}
      {linkAction && (
        <ProcessLinkDialog
          companyId={companyId}
          sourceType="program_action"
          sourceId={linkAction.id}
          title={linkAction.title}
          onClose={() => setLinkAction(null)}
          onLinked={refresh}
        />
      )}
      {importData && (
        <ProgramActionsImportDialog
          programId={programId}
          companyId={companyId}
          rows={importData.rows}
          headerRow={importData.headerRow}
          mapping={importData.mapping}
          onMappingChange={mapping =>
            setImportData(current =>
              current ? { ...current, mapping } : current
            )
          }
          onHeaderRowChange={headerRow =>
            setImportData(current =>
              current
                ? {
                    ...current,
                    headerRow,
                    mapping: detectProgramImportMapping(
                      current.rows[headerRow] || []
                    ),
                  }
                : current
            )
          }
          onClose={() => setImportData(null)}
          onImported={refresh}
        />
      )}
    </div>
  );
}

export default function ManagementPrograms() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: plLoading } =
    useProcessLeaderAuth();
  const {
    isManagerLogin,
    managerCompanyId,
    isLoading: managerLoading,
  } = useManagerAuth();
  const isAuthLoading = managerLoading || plLoading;

  const companyId = useMemo<number | null>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    return getCompanyIdFromLocationOrStorage();
  }, [isManagerLogin, managerCompanyId, processLeaderSession]);

  const planningInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const documentationInputRefs = useRef<
    Record<number, HTMLInputElement | null>
  >({});
  const [documentationModal, setDocumentationModal] =
    useState<DocumentationModal | null>(null);
  const [uploadingDocumentationProgramId, setUploadingDocumentationProgramId] =
    useState<number | null>(null);

  const {
    data: programs = [],
    refetch,
    isLoading,
  } = trpc.managementPrograms.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const createMutation = trpc.managementPrograms.create.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Programa agregado");
    },
    onError: error => toast.error(error.message),
  });

  const updateMutation = trpc.managementPrograms.update.useMutation({
    onSuccess: () => refetch(),
    onError: error => toast.error(error.message),
  });

  const deleteMutation = trpc.managementPrograms.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Programa eliminado");
    },
    onError: error => toast.error(error.message),
  });

  const uploadPlanMutation = trpc.managementPrograms.uploadPlan.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Planificación subida correctamente");
    },
    onError: error => toast.error(error.message),
  });

  const documentationQuery = trpc.managementPrograms.listDocumentation.useQuery(
    {
      programId: documentationModal?.programId ?? 0,
      companyId: companyId ?? 0,
    },
    { enabled: !!documentationModal && !!companyId }
  );

  const deleteDocumentationMutation =
    trpc.managementPrograms.deleteDocumentation.useMutation({
      onSuccess: () => {
        documentationQuery.refetch();
        toast.success("Documento eliminado");
      },
      onError: error => toast.error(error.message),
    });

  const handleAddProgram = () => {
    if (!companyId) return;
    createMutation.mutate({
      companyId,
      programName: "Nuevo Programa",
      managementSystem: "Calidad",
    });
  };

  const handleUpdate = (id: number, field: string, value: string | number) => {
    if (!companyId) return;
    updateMutation.mutate({ id, companyId, [field]: value });
  };

  const handleDelete = (id: number) => {
    if (!companyId) return;
    if (!confirm("¿Eliminar este programa y todos sus archivos asociados?"))
      return;
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

  const handleDocumentationFiles = async (
    programId: number,
    fileList: FileList
  ) => {
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

        const response = await fetch(
          "/api/upload/management-program-documentation",
          {
            method: "POST",
            body: formData,
            credentials: "include",
          }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          failedFiles.push(file.name);
          continue;
        }

        uploaded += 1;
        if (validFiles.length > 1) {
          toast.loading(
            `Subiendo ${uploaded} de ${validFiles.length} documentos...`,
            { id: progressToast }
          );
        }
      }

      if (documentationModal?.programId === programId)
        await documentationQuery.refetch();
      if (uploaded > 0) {
        toast.success(
          uploaded === 1
            ? "Documento subido correctamente"
            : `${uploaded} documentos subidos correctamente`,
          { id: progressToast }
        );
      } else {
        toast.error("No fue posible subir la documentación", {
          id: progressToast,
        });
      }
      if (failedFiles.length > 0) {
        toast.error(
          `${failedFiles.length} archivo(s) no se pudieron subir. Puede intentarlo nuevamente.`,
          { id: `${progressToast}-errors` }
        );
      }
    } catch {
      toast.error(
        "No fue posible subir la documentación. Inténtelo nuevamente.",
        { id: progressToast }
      );
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
      return (
        sum +
        (planned > 0
          ? Math.min(100, Math.round((completed / planned) * 100))
          : 0)
      );
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
              onClick={() =>
                setLocation(
                  companyId
                    ? `/audits-inspections?companyId=${companyId}`
                    : "/audits-inspections"
                )
              }
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Programas</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Gestión de programas de sistemas de gestión
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-blue-600">
              % Cumplimiento
            </p>
            <p
              className={`text-2xl font-bold ${overallCompliance >= 80 ? "text-green-600" : overallCompliance >= 50 ? "text-yellow-600" : "text-red-600"}`}
            >
              {overallCompliance}%
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
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
            {programs.map(program => {
              const planned = program.plannedActions ?? 0;
              const completed = program.completedActions ?? 0;
              const compliance =
                planned > 0
                  ? Math.min(100, Math.round((completed / planned) * 100))
                  : 0;
              return (
                <Card key={program.id} className="border border-slate-200">
                  <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          Nombre del Programa
                        </label>
                        <Input
                          defaultValue={program.programName}
                          onBlur={event =>
                            handleUpdate(
                              program.id,
                              "programName",
                              event.target.value
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          Sistema de Gestión
                        </label>
                        <select
                          defaultValue={program.managementSystem}
                          onChange={event =>
                            handleUpdate(
                              program.id,
                              "managementSystem",
                              event.target.value
                            )
                          }
                          className="w-full rounded border p-2 text-sm"
                        >
                          {MANAGEMENT_SYSTEMS.map(system => (
                            <option key={system} value={system}>
                              {system}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          # Acciones Planificadas
                        </label>
                        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-center text-sm font-bold text-slate-700" title="Indicador automático: se calcula desde Acciones planificadas">
                          {planned}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          # Acciones Realizadas
                        </label>
                        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-center text-sm font-bold text-slate-700" title="Indicador automático: se actualiza cuando el proceso responsable confirma el cumplimiento">
                          {completed}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">
                          Cumplimiento
                        </label>
                        <div
                          className={`w-full rounded border p-2 text-center text-sm font-bold ${
                            compliance >= 80
                              ? "border-green-300 bg-green-100 text-green-700"
                              : compliance >= 50
                                ? "border-yellow-300 bg-yellow-100 text-yellow-700"
                                : "border-red-300 bg-red-100 text-red-700"
                          }`}
                        >
                          {compliance}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <input
                        ref={element => {
                          documentationInputRefs.current[program.id] = element;
                        }}
                        type="file"
                        className="hidden"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={event => {
                          if (event.target.files?.length)
                            handleDocumentationFiles(
                              program.id,
                              event.target.files
                            );
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-teal-300 text-teal-700 hover:bg-teal-50"
                        onClick={() =>
                          documentationInputRefs.current[program.id]?.click()
                        }
                        disabled={uploadingDocumentationProgramId !== null}
                      >
                        {uploadingDocumentationProgramId === program.id ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <Upload size={14} className="mr-1" />
                        )}
                        {uploadingDocumentationProgramId === program.id
                          ? "Subiendo documentación..."
                          : "Subir documentación"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-teal-300 text-teal-700 hover:bg-teal-50"
                        onClick={() =>
                          setDocumentationModal({
                            programId: program.id,
                            programName: program.programName,
                          })
                        }
                      >
                        <Eye size={14} className="mr-1" /> Ver documentación
                      </Button>
                      <input
                        ref={element => {
                          planningInputRefs.current[program.id] = element;
                        }}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) handlePlanningFile(program.id, file);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() =>
                          planningInputRefs.current[program.id]?.click()
                        }
                        disabled={uploadPlanMutation.isPending}
                      >
                        {uploadPlanMutation.isPending ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <Upload size={14} className="mr-1" />
                        )}
                        Subir planificación
                      </Button>
                      <ViewPlanningButton
                        programId={program.id}
                        companyId={companyId!}
                        planFileName={program.planFileName}
                      />
                    </div>

                    <ProgramActionsPanel
                      programId={program.id}
                      companyId={companyId!}
                      onChanged={refetch}
                    />

                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleDelete(program.id)}
                      >
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
          <Button
            onClick={handleAddProgram}
            className="flex w-full items-center justify-center gap-2 bg-blue-500 text-white hover:bg-blue-600"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}{" "}
            Añadir nuevo programa
          </Button>
        </div>

        {documentationModal && (
          <DocumentationModal
            title={`Documentación — ${documentationModal.programName}`}
            files={
              (documentationQuery.data ?? []) as {
                id: number;
                fileName: string;
                fileUrl: string;
              }[]
            }
            isLoading={documentationQuery.isLoading}
            onClose={() => setDocumentationModal(null)}
            onDelete={id =>
              deleteDocumentationMutation.mutate({ id, companyId: companyId! })
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
