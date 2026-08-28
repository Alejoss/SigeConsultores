import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { SourceEvidenceButton } from "@/components/SourceEvidenceButton";

type VerificationMode = "vigencia" | "planificacion" | "ambas";
type ChecklistItem = {
  id: number;
  standardCode: string | null;
  standardName: string;
  description: string | null;
  verificationMode: VerificationMode;
  applicable: boolean;
  notApplicableReason: string | null;
  validFrom: string | Date | null;
  validUntil: string | Date | null;
  responsible: string | null;
  status: "cumplido" | "pendiente" | "vencido" | "no_aplicable";
  compliant: boolean;
  daysRemaining: number | null;
  vigencyMet?: boolean;
  planningMet?: boolean;
  actions: ChecklistAction[];
};

type ChecklistAction = {
  id: number;
  action: string;
  responsible: string | null;
  implementationDate: string | Date | null;
  completed: boolean;
};

type LinkSource = {
  sourceType: "checklist_action" | "checklist_vigency";
  sourceId: number;
  title: string;
};

type ImportItem = {
  standardCode?: string;
  standardName: string;
  description?: string;
  verificationMode?: VerificationMode;
  applicable?: boolean;
  notApplicableReason?: string;
  validFrom?: string;
  validUntil?: string;
  responsible?: string;
  action?: string;
  actionResponsible?: string;
  implementationDate?: string;
  completed?: boolean;
  _rowIndex: number;
};

type ImportField = Exclude<keyof ImportItem, "_rowIndex">;
type SourceColumn = { index: number; label: string; sample: string };
type ImportMapping = Partial<Record<ImportField, number>>;

type MappingFieldDefinition = {
  key: ImportField;
  label: string;
  required?: boolean;
  aliases: string[];
};

const IMPORT_MAPPING_FIELDS: MappingFieldDefinition[] = [
  {
    key: "standardName",
    label: "Estándar o compromiso",
    required: true,
    aliases: [
      "estandar",
      "estándar",
      "requisito",
      "compromiso",
      "criterio",
      "hallazgo",
      "item",
      "ítem",
      "descripcion",
      "descripción",
    ],
  },
  {
    key: "standardCode",
    label: "Código",
    aliases: [
      "codigo",
      "código",
      "numeral",
      "numero",
      "número",
      "referencia",
      "clausula",
      "cláusula",
    ],
  },
  {
    key: "description",
    label: "Detalle",
    aliases: [
      "detalle",
      "descripcion",
      "descripción",
      "observacion",
      "observación",
    ],
  },
  {
    key: "verificationMode",
    label: "Forma de verificación",
    aliases: [
      "forma de verificacion",
      "forma de verificación",
      "verificacion",
      "verificación",
      "tipo de control",
      "control",
    ],
  },
  {
    key: "applicable",
    label: "Aplicable (SI/NO)",
    aliases: ["aplicable", "aplica", "cumple", "conforme"],
  },
  {
    key: "notApplicableReason",
    label: "Justificación no aplicable",
    aliases: [
      "justificacion no aplicable",
      "justificación no aplicable",
      "justificacion",
      "justificación",
      "no aplica",
    ],
  },
  {
    key: "validFrom",
    label: "Vigente desde",
    aliases: ["vigente desde", "inicio vigencia", "fecha inicio", "desde"],
  },
  {
    key: "validUntil",
    label: "Vigente hasta",
    aliases: [
      "vigente hasta",
      "fin vigencia",
      "fecha vencimiento",
      "vencimiento",
      "hasta",
    ],
  },
  {
    key: "action",
    label: "Acción inicial",
    aliases: [
      "accion inicial",
      "acción inicial",
      "accion",
      "acción",
      "actividad",
      "plan de accion",
      "plan de acción",
    ],
  },
  {
    key: "responsible",
    label: "Responsable del estándar",
    aliases: [
      "responsable",
      "responsable estandar",
      "responsable estándar",
      "lider",
      "líder",
      "propietario",
    ],
  },
  {
    key: "actionResponsible",
    label: "Responsable de la acción",
    aliases: [
      "responsable accion",
      "responsable acción",
      "responsable actividad",
    ],
  },
  {
    key: "implementationDate",
    label: "Fecha de implementación",
    aliases: [
      "fecha de implementacion",
      "fecha de implementación",
      "fecha accion",
      "fecha acción",
      "plazo",
      "fecha limite",
      "fecha límite",
    ],
  },
  {
    key: "completed",
    label: "Cumplido (SI/NO)",
    aliases: ["cumplido", "completado", "realizado", "estado", "avance"],
  },
];

function columnLetter(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function getMappingColumns(
  rows: unknown[][],
  headerRow: number
): SourceColumn[] {
  const width = Math.max(...rows.map(row => row.length), 0);
  const firstDataRow =
    rows.find(
      (row, index) =>
        index > headerRow && row.some(cell => String(cell ?? "").trim() !== "")
    ) || [];
  return Array.from({ length: width }, (_, index) => {
    const heading =
      headerRow >= 0 ? String(rows[headerRow]?.[index] ?? "").trim() : "";
    return {
      index,
      label: heading || `Columna ${columnLetter(index)}`,
      sample: String(firstDataRow[index] ?? "").trim(),
    };
  });
}

function detectHeaderRow(rows: unknown[][]) {
  const maximum = Math.min(rows.length, 20);
  for (let rowIndex = 0; rowIndex < maximum; rowIndex += 1) {
    const values = rows[rowIndex].map(normalized).filter(Boolean);
    if (values.length < 2) continue;
    const matched = values.filter(value =>
      IMPORT_MAPPING_FIELDS.some(field =>
        field.aliases.some(
          alias =>
            value === normalized(alias) || value.includes(normalized(alias))
        )
      )
    ).length;
    if (matched > 0) return rowIndex;
  }
  return 0;
}

function detectImportMapping(columns: SourceColumn[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const field of IMPORT_MAPPING_FIELDS) {
    const column = columns.find(candidate => {
      const heading = normalized(candidate.label);
      return field.aliases.some(
        alias =>
          heading === normalized(alias) || heading.includes(normalized(alias))
      );
    });
    if (column) mapping[field.key] = column.index;
  }
  return mapping;
}

const modeLabel: Record<VerificationMode, string> = {
  vigencia: "Por vigencia",
  planificacion: "Por planificación",
  ambas: "Por ambas",
};

function asDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function spreadsheetDate(value: unknown) {
  if (!value) return undefined;
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

function parseYesNo(value: unknown) {
  const text = normalized(value);
  if (["si", "sí", "s", "true", "1", "x"].includes(text)) return true;
  if (["no", "n", "false", "0"].includes(text)) return false;
  return undefined;
}

function parseMode(value: unknown): VerificationMode | undefined {
  const text = normalized(value);
  if (!text) return undefined;
  if (
    text.includes("ambas") ||
    (text.includes("vigencia") && text.includes("plan"))
  )
    return "ambas";
  if (text.includes("vigencia")) return "vigencia";
  if (text.includes("plan")) return "planificacion";
  return undefined;
}

function compactStandardTitle(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 500) return text;
  const candidate = text.slice(0, 496);
  const lastBreak = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("; "),
    candidate.lastIndexOf(", ")
  );
  const end = lastBreak >= 120 ? lastBreak + 1 : candidate.length;
  return `${candidate.slice(0, end).trim()}…`;
}

function preserveFullStandardText(standardText: string, detailText: string) {
  const completeStandard = standardText.trim();
  const suppliedDetail = detailText.trim();
  const sections: string[] = [];
  if (completeStandard.length > 500)
    sections.push(`Texto completo del estándar:\n${completeStandard}`);
  if (
    suppliedDetail &&
    normalized(suppliedDetail) !== normalized(completeStandard)
  )
    sections.push(suppliedDetail);
  return sections.join("\n\n") || undefined;
}

function LinkCommitmentsDialog({
  companyId,
  source,
  onClose,
  onLinked,
}: {
  companyId: number;
  source: LinkSource;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { data: processes = [], isLoading } = trpc.processMap.list.useQuery({
    companyId,
  });
  const progressQuery = trpc.linkedCommitments.listSourceProgress.useQuery({
    companyId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
  });
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const createLinks = trpc.linkedCommitments.createLinks.useMutation({
    onSuccess: result => {
      onLinked();
      const message = result.created
        ? `${result.created} compromiso(s) vinculado(s)${result.alreadyLinked ? `; ${result.alreadyLinked} ya existía(n)` : ""}.`
        : "Los procesos seleccionados ya tenían este compromiso vinculado.";
      toast.success(message);
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const existingProcessIds = new Set(progressQuery.data?.processIds || []);
  const selectedIds = Object.entries(selected)
    .filter(([, enabled]) => enabled)
    .map(([id]) => Number(id));
  const allSelected =
    processes.length > 0 &&
    processes.every(
      process => selected[process.id] || existingProcessIds.has(process.id)
    );

  const toggleAll = (enabled: boolean) => {
    const values: Record<number, boolean> = {};
    for (const process of processes) {
      if (!existingProcessIds.has(process.id)) values[process.id] = enabled;
    }
    setSelected(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Vincular a procesos
              </h2>
              <p className="mt-1 text-sm text-slate-600">{source.title}</p>
              <p className="mt-2 text-xs text-slate-500">
                Seleccione uno, varios o todos los procesos. Cada Jefe verá la
                responsabilidad en <strong>Compromisos vinculados</strong>.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
          {progressQuery.data && progressQuery.data.total > 0 && (
            <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              Avance actual:{" "}
              <strong>
                {progressQuery.data.fulfilled} de {progressQuery.data.total}
              </strong>{" "}
              procesos han cumplido este compromiso.
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-medium text-slate-700">
              Procesos del Mapa
            </span>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={event => toggleAll(event.target.checked)}
              />
              Seleccionar todos
            </label>
          </div>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {isLoading ? (
              <p className="py-5 text-center text-sm text-slate-500">
                Cargando procesos...
              </p>
            ) : processes.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-500">
                Primero registre procesos en el Mapa de Procesos.
              </p>
            ) : (
              processes.map(process => {
                const existing = existingProcessIds.has(process.id);
                return (
                  <label
                    key={process.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${existing ? "border-teal-200 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span>
                      <strong className="text-slate-800">{process.name}</strong>
                      <span className="ml-2 text-xs text-slate-500 capitalize">
                        {process.processType}
                      </span>
                    </span>
                    {existing ? (
                      <span className="text-xs font-semibold text-teal-700">
                        Ya vinculado
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={Boolean(selected[process.id])}
                        onChange={event =>
                          setSelected(current => ({
                            ...current,
                            [process.id]: event.target.checked,
                          }))
                        }
                      />
                    )}
                  </label>
                );
              })
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800"
              disabled={!selectedIds.length || createLinks.isPending}
              onClick={() =>
                createLinks.mutate({
                  companyId,
                  sourceType: source.sourceType,
                  sourceId: source.sourceId,
                  processIds: selectedIds,
                })
              }
            >
              {createLinks.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Link2 className="mr-1 h-4 w-4" />
              Vincular seleccionados
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ item }: { item: ChecklistItem }) {
  const config =
    item.status === "cumplido"
      ? {
          label: "Cumplido",
          className: "bg-green-100 text-green-800 border-green-200",
          icon: CheckCircle2,
        }
      : item.status === "vencido"
        ? {
            label: "Vencido",
            className: "bg-red-100 text-red-700 border-red-200",
            icon: XCircle,
          }
        : item.status === "no_aplicable"
          ? {
              label: "No aplicable",
              className: "bg-slate-100 text-slate-600 border-slate-200",
              icon: ShieldCheck,
            }
          : {
              label: "Pendiente",
              className: "bg-amber-100 text-amber-800 border-amber-200",
              icon: CalendarClock,
            };
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      <Icon size={13} />
      {config.label}
    </span>
  );
}

export default function ManagementSystemChecklist() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: processLeaderLoading } =
    useProcessLeaderAuth();
  const {
    isManagerLogin,
    managerCompanyId,
    isLoading: managerLoading,
  } = useManagerAuth();
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const managementSystemId = Number(query.get("managementSystemId"));
  const companyId = useMemo<number | null>(() => {
    if (isManagerLogin && managerCompanyId) return managerCompanyId;
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    const companyFromUrl = Number(query.get("companyId"));
    if (Number.isFinite(companyFromUrl) && companyFromUrl > 0)
      return companyFromUrl;
    const stored = localStorage.getItem("selectedCompanyId");
    return stored ? Number(stored) : getCompanyIdFromLocationOrStorage();
  }, [isManagerLogin, managerCompanyId, processLeaderSession, query]);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [openChecklistSections, setOpenChecklistSections] = useState<
    Record<number, { vigencia?: boolean; planificacion?: boolean }>
  >({});
  const [showNewItem, setShowNewItem] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showImportMapping, setShowImportMapping] = useState(false);
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [rawImportRows, setRawImportRows] = useState<unknown[][]>([]);
  const [importHeaderRow, setImportHeaderRow] = useState(0);
  const [importMapping, setImportMapping] = useState<ImportMapping>({});
  const [newItem, setNewItem] = useState({
    standardCode: "",
    standardName: "",
    description: "",
    verificationMode: "planificacion" as VerificationMode,
    responsible: "",
  });
  const [newActions, setNewActions] = useState<
    Record<
      number,
      { action: string; responsible: string; implementationDate: string }
    >
  >({});
  const [linkSource, setLinkSource] = useState<LinkSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checklistQuery = trpc.managementSystemChecklist.getChecklist.useQuery(
    { managementSystemId, companyId: companyId || 0 },
    { enabled: Boolean(companyId && managementSystemId) }
  );
  const refresh = () => checklistQuery.refetch();
  const updateItem =
    trpc.managementSystemChecklist.updateChecklistItem.useMutation({
      onSuccess: refresh,
      onError: e => toast.error(e.message),
    });
  const createItem =
    trpc.managementSystemChecklist.createChecklistItem.useMutation({
      onSuccess: () => {
        setNewItem({
          standardCode: "",
          standardName: "",
          description: "",
          verificationMode: "planificacion",
          responsible: "",
        });
        setShowNewItem(false);
        refresh();
        toast.success("Estándar agregado");
      },
      onError: e => toast.error(e.message),
    });
  const deleteItem =
    trpc.managementSystemChecklist.deleteChecklistItem.useMutation({
      onSuccess: refresh,
      onError: e => toast.error(e.message),
    });
  const createAction =
    trpc.managementSystemChecklist.createChecklistAction.useMutation({
      onSuccess: (_data, values) => {
        setNewActions(current => ({
          ...current,
          [values.checklistItemId]: {
            action: "",
            responsible: "",
            implementationDate: "",
          },
        }));
        refresh();
      },
      onError: e => toast.error(e.message),
    });
  const updateAction =
    trpc.managementSystemChecklist.updateChecklistAction.useMutation({
      onSuccess: refresh,
      onError: e => toast.error(e.message),
    });
  const deleteAction =
    trpc.managementSystemChecklist.deleteChecklistAction.useMutation({
      onSuccess: refresh,
      onError: e => toast.error(e.message),
    });
  const importChecklist =
    trpc.managementSystemChecklist.importChecklist.useMutation({
      onSuccess: result => {
        setShowImportPreview(false);
        setImportItems([]);
        refresh();
        toast.success(
          `Importación completada: ${result.created} nuevos, ${result.updated} actualizados y ${result.actionsAdded} acciones agregadas.`
        );
      },
      onError: e => toast.error(e.message),
    });

  const data = checklistQuery.data;

  const downloadTemplate = () => {
    const rows = [
      [
        "Código",
        "Estándar o compromiso",
        "Detalle",
        "Forma de verificación",
        "Aplicable (SI/NO)",
        "Justificación no aplicable",
        "Vigente desde",
        "Vigente hasta",
        "Acción inicial",
        "Responsable",
        "Fecha de implementación",
        "Cumplido (SI/NO)",
      ],
      [
        "BASC-4.1",
        "Control de acceso a instalaciones",
        "Mantener el procedimiento y registro de control de acceso.",
        "Ambas",
        "SI",
        "",
        "2026-01-01",
        "2026-12-31",
        "Actualizar el registro mensual de visitantes",
        "Responsable de Seguridad",
        "2026-03-31",
        "NO",
      ],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 16 },
      { wch: 42 },
      { wch: 56 },
      { wch: 25 },
      { wch: 20 },
      { wch: 34 },
      { wch: 16 },
      { wch: 16 },
      { wch: 52 },
      { wch: 30 },
      { wch: 22 },
      { wch: 18 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Checklist operativo");
    XLSX.writeFile(workbook, "plantilla-checklist-sistema-gestion.xlsx");
  };

  const importColumns = useMemo(
    () => getMappingColumns(rawImportRows, importHeaderRow),
    [rawImportRows, importHeaderRow]
  );

  const buildImportPreview = () => {
    const standardNameColumn = importMapping.standardName;
    if (standardNameColumn === undefined) {
      toast.error(
        "Seleccione la columna que contiene el estándar o compromiso."
      );
      return;
    }
    const firstDataRow = importHeaderRow >= 0 ? importHeaderRow + 1 : 0;
    const text = (row: unknown[], field: ImportField) => {
      const source = importMapping[field];
      return source === undefined ? "" : String(row[source] ?? "").trim();
    };
    const parsed = rawImportRows
      .slice(firstDataRow)
      .map((row, index) => {
        const originalStandardName = text(row, "standardName");
        if (!originalStandardName) return null;
        const standardName = compactStandardTitle(originalStandardName);
        const description = preserveFullStandardText(
          originalStandardName,
          text(row, "description")
        );
        const standardResponsible = text(row, "responsible");
        const actionResponsible =
          text(row, "actionResponsible") || standardResponsible;
        return {
          _rowIndex: firstDataRow + index + 1,
          standardCode: text(row, "standardCode") || undefined,
          standardName,
          description,
          verificationMode: parseMode(text(row, "verificationMode")),
          applicable: parseYesNo(text(row, "applicable")),
          notApplicableReason: text(row, "notApplicableReason") || undefined,
          validFrom: spreadsheetDate(
            importMapping.validFrom === undefined
              ? undefined
              : row[importMapping.validFrom]
          ),
          validUntil: spreadsheetDate(
            importMapping.validUntil === undefined
              ? undefined
              : row[importMapping.validUntil]
          ),
          responsible: standardResponsible || undefined,
          action: text(row, "action") || undefined,
          actionResponsible: actionResponsible || undefined,
          implementationDate: spreadsheetDate(
            importMapping.implementationDate === undefined
              ? undefined
              : row[importMapping.implementationDate]
          ),
          completed: parseYesNo(text(row, "completed")),
        } as ImportItem;
      })
      .filter((item): item is ImportItem => Boolean(item));

    if (!parsed.length) {
      toast.error(
        "No se encontraron estándares válidos con el mapeo seleccionado."
      );
      return;
    }
    setImportItems(parsed);
    setShowImportMapping(false);
    setShowImportPreview(true);
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
        raw: true,
      }) as unknown[][];
      if (rows.length < 1) throw new Error("El archivo está vacío.");
      const headerRow = detectHeaderRow(rows);
      const columns = getMappingColumns(rows, headerRow);
      setRawImportRows(rows);
      setImportHeaderRow(headerRow);
      setImportMapping(detectImportMapping(columns));
      setShowImportMapping(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible leer la planilla."
      );
    } finally {
      event.target.value = "";
    }
  };

  if (managerLoading || processLeaderLoading || checklistQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando checklist operativo...
        </div>
      </DashboardLayout>
    );
  }

  if (!companyId || !managementSystemId || !data) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl py-16 text-center text-slate-500">
          No fue posible identificar el Sistema de Gestión solicitado.
        </div>
      </DashboardLayout>
    );
  }

  const { system, items, summary } = data as {
    system: { systemName: string; certification: string };
    items: ChecklistItem[];
    summary: {
      total: number;
      applicable: number;
      compliant: number;
      percentage: number;
      pending: number;
      expired: number;
      expiringSoon: number;
      nonApplicable: number;
      pendingActions: number;
    };
  };

  const saveItem = (item: ChecklistItem, values: Record<string, unknown>) =>
    updateItem.mutate({
      id: item.id,
      managementSystemId,
      companyId,
      ...values,
    });
  const saveAction = (
    item: ChecklistItem,
    action: ChecklistAction,
    values: Record<string, unknown>
  ) =>
    updateAction.mutate({
      id: action.id,
      checklistItemId: item.id,
      managementSystemId,
      companyId,
      ...values,
    });

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLocation(
                  `/audits-inspections/management-systems?companyId=${companyId}`
                )
              }
            >
              <ArrowLeft size={16} className="mr-1" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Checklist operativo
              </h1>
              <p className="text-sm text-slate-500">
                {system.systemName}{" "}
                {system.certification ? `· ${system.certification}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download size={15} className="mr-1" />
              Descargar plantilla
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 text-blue-700"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} className="mr-1" />
              Importar desde Excel
            </Button>
            <Button
              size="sm"
              className="bg-teal-700 hover:bg-teal-800"
              onClick={() => setShowNewItem(true)}
            >
              <Plus size={15} className="mr-1" />
              Agregar estándar
            </Button>
          </div>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Card className="border-teal-200 bg-teal-50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-teal-700">
                Implementación
              </p>
              <p className="mt-1 text-3xl font-bold text-teal-800">
                {summary.percentage}%
              </p>
              <p className="text-xs text-slate-500">
                {summary.compliant} de {summary.applicable} aplicables
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Estándares
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-800">
                {summary.total}
              </p>
              <p className="text-xs text-slate-500">
                {summary.nonApplicable} no aplicables
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-amber-600">
                Pendientes
              </p>
              <p className="mt-1 text-3xl font-bold text-amber-700">
                {summary.pending}
              </p>
              <p className="text-xs text-slate-500">
                {summary.pendingActions} acciones abiertas
              </p>
            </CardContent>
          </Card>
          <Card className={summary.expired ? "border-red-200 bg-red-50" : ""}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-red-600">
                Vencidos
              </p>
              <p className="mt-1 text-3xl font-bold text-red-700">
                {summary.expired}
              </p>
              <p className="text-xs text-slate-500">requieren atención</p>
            </CardContent>
          </Card>
          <Card
            className={
              summary.expiringSoon ? "border-yellow-200 bg-yellow-50" : ""
            }
          >
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-yellow-700">
                Próximos a vencer
              </p>
              <p className="mt-1 text-3xl font-bold text-yellow-800">
                {summary.expiringSoon}
              </p>
              <p className="text-xs text-slate-500">en los próximos 30 días</p>
            </CardContent>
          </Card>
        </section>

        {showNewItem && (
          <Card className="mb-5 border-teal-300 bg-teal-50">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">
                  Nuevo estándar o compromiso
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowNewItem(false)}
                >
                  Cancelar
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Código (opcional)"
                  value={newItem.standardCode}
                  onChange={e =>
                    setNewItem({ ...newItem, standardCode: e.target.value })
                  }
                />
                <Input
                  placeholder="Estándar o compromiso *"
                  value={newItem.standardName}
                  onChange={e =>
                    setNewItem({ ...newItem, standardName: e.target.value })
                  }
                />
                <Textarea
                  className="md:col-span-2"
                  placeholder="Detalle del requisito"
                  value={newItem.description}
                  onChange={e =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                />
                <select
                  className="h-10 rounded-md border bg-white px-3 text-sm"
                  value={newItem.verificationMode}
                  onChange={e =>
                    setNewItem({
                      ...newItem,
                      verificationMode: e.target.value as VerificationMode,
                    })
                  }
                >
                  <option value="planificacion">Por planificación</option>
                  <option value="vigencia">Por vigencia</option>
                  <option value="ambas">Por ambas</option>
                </select>
                <Input
                  placeholder="Responsable de referencia (opcional)"
                  value={newItem.responsible}
                  onChange={e =>
                    setNewItem({ ...newItem, responsible: e.target.value })
                  }
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  disabled={
                    !newItem.standardName.trim() || createItem.isPending
                  }
                  className="bg-teal-700 hover:bg-teal-800"
                  onClick={() =>
                    createItem.mutate({
                      managementSystemId,
                      companyId,
                      ...newItem,
                    })
                  }
                >
                  {createItem.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Agregar estándar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="space-y-4">
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <ClipboardCheck className="mx-auto mb-3 h-9 w-9 text-teal-500" />
                <p className="font-medium">
                  Aún no hay estándares en este checklist.
                </p>
                <p className="mt-1 text-sm">
                  Descargue la plantilla para importarlos o agregue el primero
                  manualmente.
                </p>
              </CardContent>
            </Card>
          ) : (
            items.map(item => {
              const itemExpanded = Boolean(expanded[item.id]);
              const actionDraft = newActions[item.id] || {
                action: "",
                responsible: "",
                implementationDate: "",
              };
              const sections = openChecklistSections[item.id] || {};
              const showVigency = Boolean(sections.vigencia);
              const showPlanning = Boolean(sections.planificacion);
              const toggleSection = (section: "vigencia" | "planificacion") =>
                setOpenChecklistSections(current => ({
                  ...current,
                  [item.id]: {
                    ...current[item.id],
                    [section]: !current[item.id]?.[section],
                  },
                }));
              return (
                <Card
                  key={item.id}
                  className={`overflow-hidden border ${item.status === "vencido" ? "border-red-300" : item.status === "cumplido" ? "border-green-200" : "border-slate-200"}`}
                >
                  <CardContent className="p-0">
                    <button
                      className="flex w-full items-center justify-between gap-4 bg-slate-50 px-5 py-4 text-left hover:bg-slate-100"
                      onClick={() =>
                        setExpanded(current => ({
                          ...current,
                          [item.id]: !current[item.id],
                        }))
                      }
                    >
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {item.standardCode && (
                            <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                              {item.standardCode}
                            </span>
                          )}
                          <StatusBadge item={item} />
                          <span className="text-xs text-slate-500">
                            {modeLabel[item.verificationMode]}
                          </span>
                        </div>
                        <p className="truncate font-semibold text-slate-800">
                          {item.standardName}
                        </p>
                      </div>
                      {itemExpanded ? (
                        <ChevronUp className="shrink-0 text-slate-500" />
                      ) : (
                        <ChevronDown className="shrink-0 text-slate-500" />
                      )}
                    </button>
                    {itemExpanded && (
                      <div className="space-y-5 p-5">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Código
                            </label>
                            <Input
                              defaultValue={item.standardCode || ""}
                              onBlur={e =>
                                saveItem(item, { standardCode: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Estándar o compromiso
                            </label>
                            <Input
                              defaultValue={item.standardName}
                              onBlur={e =>
                                saveItem(item, { standardName: e.target.value })
                              }
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Detalle
                            </label>
                            <Textarea
                              defaultValue={item.description || ""}
                              onBlur={e =>
                                saveItem(item, { description: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Forma de verificación
                            </label>
                            <select
                              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              value={item.verificationMode}
                              onChange={e =>
                                saveItem(item, {
                                  verificationMode: e.target
                                    .value as VerificationMode,
                                })
                              }
                            >
                              <option value="vigencia">Por vigencia</option>
                              <option value="planificacion">
                                Por planificación
                              </option>
                              <option value="ambas">Por ambas</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Responsable de referencia
                            </label>
                            <Input
                              defaultValue={item.responsible || ""}
                              onBlur={e =>
                                saveItem(item, { responsible: e.target.value })
                              }
                              placeholder="Cargo o referencia (opcional)"
                            />
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={!item.applicable}
                              onChange={e =>
                                saveItem(item, {
                                  applicable: !e.target.checked,
                                })
                              }
                            />
                            No aplicable
                          </label>
                          {!item.applicable && (
                            <Textarea
                              className="mt-3 bg-white"
                              placeholder="Justificación obligatoria para auditoría"
                              defaultValue={item.notApplicableReason || ""}
                              onBlur={e =>
                                saveItem(item, {
                                  notApplicableReason: e.target.value,
                                })
                              }
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t pt-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-blue-300 text-blue-800"
                            onClick={() => toggleSection("vigencia")}
                          >
                            <CalendarClock size={15} className="mr-1" />
                            Vigente{" "}
                            {showVigency ? (
                              <ChevronUp size={14} className="ml-1" />
                            ) : (
                              <ChevronDown size={14} className="ml-1" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-violet-300 text-violet-800"
                            onClick={() => toggleSection("planificacion")}
                          >
                            <ClipboardCheck size={15} className="mr-1" />
                            Planificar{" "}
                            {showPlanning ? (
                              <ChevronUp size={14} className="ml-1" />
                            ) : (
                              <ChevronDown size={14} className="ml-1" />
                            )}
                          </Button>
                        </div>
                        {showVigency && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-blue-900">
                                  Vigente
                                </h3>
                                <p className="text-xs text-blue-700">
                                  Registre el período de vigencia del
                                  certificado, requisito o compromiso.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {item.verificationMode !== "planificacion" && (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="border-teal-300 bg-white text-teal-800 hover:bg-teal-100"
                                      onClick={() =>
                                        setLinkSource({
                                          sourceType: "checklist_vigency",
                                          sourceId: item.id,
                                          title: `Vigencia: ${item.standardName}`,
                                        })
                                      }
                                    >
                                      <Link2 size={14} className="mr-1" />
                                      Vincular
                                    </Button>
                                    <SourceEvidenceButton
                                      companyId={companyId}
                                      sourceType="checklist_vigency"
                                      sourceId={item.id}
                                      compact
                                    />
                                  </>
                                )}
                                {item.daysRemaining !== null && (
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-bold ${item.daysRemaining < 0 ? "bg-red-100 text-red-700" : item.daysRemaining <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}
                                  >
                                    {item.daysRemaining < 0
                                      ? `Vencido hace ${Math.abs(item.daysRemaining)} día(s)`
                                      : `${item.daysRemaining} día(s) de vigencia`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">
                                  Vigente desde
                                </label>
                                <Input
                                  type="date"
                                  value={asDateInput(item.validFrom)}
                                  onChange={e =>
                                    saveItem(item, {
                                      validFrom: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">
                                  Vigente hasta
                                </label>
                                <Input
                                  type="date"
                                  value={asDateInput(item.validUntil)}
                                  onChange={e =>
                                    saveItem(item, {
                                      validUntil: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {showPlanning && (
                          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-violet-900">
                                  Planificar
                                </h3>
                                <p className="text-xs text-violet-700">
                                  El requisito se cumple cuando todas sus
                                  acciones estén marcadas como cumplidas.
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-violet-800">
                                {
                                  item.actions.filter(
                                    action => action.completed
                                  ).length
                                }
                                /{item.actions.length} acciones cumplidas
                              </span>
                            </div>
                            <div className="space-y-3">
                              {item.actions.map(action => (
                                <div
                                  key={action.id}
                                  className="grid gap-2 rounded-md border bg-white p-3 md:grid-cols-[minmax(0,1fr)_180px_145px_90px_112px_100px_34px]"
                                >
                                  <Input
                                    defaultValue={action.action}
                                    onBlur={e =>
                                      saveAction(item, action, {
                                        action: e.target.value,
                                      })
                                    }
                                    placeholder="Acción"
                                  />
                                  <Input
                                    defaultValue={action.responsible || ""}
                                    onBlur={e =>
                                      saveAction(item, action, {
                                        responsible: e.target.value,
                                      })
                                    }
                                    placeholder="Referencia"
                                  />
                                  <Input
                                    type="date"
                                    value={asDateInput(
                                      action.implementationDate
                                    )}
                                    onChange={e =>
                                      saveAction(item, action, {
                                        implementationDate: e.target.value,
                                      })
                                    }
                                  />
                                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={action.completed}
                                      onChange={e =>
                                        saveAction(item, action, {
                                          completed: e.target.checked,
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
                                      setLinkSource({
                                        sourceType: "checklist_action",
                                        sourceId: action.id,
                                        title: action.action,
                                      })
                                    }
                                  >
                                    <Link2 size={14} className="mr-1" />
                                    Vincular
                                  </Button>
                                  <SourceEvidenceButton
                                    companyId={companyId}
                                    sourceType="checklist_action"
                                    sourceId={action.id}
                                    compact
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-red-500"
                                    onClick={() => {
                                      if (confirm("¿Eliminar esta acción?"))
                                        deleteAction.mutate({
                                          id: action.id,
                                          checklistItemId: item.id,
                                          managementSystemId,
                                          companyId,
                                        });
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 grid gap-2 rounded-md border border-dashed border-violet-300 p-3 md:grid-cols-[minmax(0,1fr)_190px_145px_auto]">
                              <Input
                                value={actionDraft.action}
                                onChange={e =>
                                  setNewActions(current => ({
                                    ...current,
                                    [item.id]: {
                                      ...actionDraft,
                                      action: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Nueva acción"
                              />
                              <Input
                                value={actionDraft.responsible}
                                onChange={e =>
                                  setNewActions(current => ({
                                    ...current,
                                    [item.id]: {
                                      ...actionDraft,
                                      responsible: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Referencia (opcional)"
                              />
                              <Input
                                type="date"
                                value={actionDraft.implementationDate}
                                onChange={e =>
                                  setNewActions(current => ({
                                    ...current,
                                    [item.id]: {
                                      ...actionDraft,
                                      implementationDate: e.target.value,
                                    },
                                  }))
                                }
                              />
                              <Button
                                disabled={
                                  !actionDraft.action.trim() ||
                                  createAction.isPending
                                }
                                variant="outline"
                                className="border-violet-300 text-violet-800"
                                onClick={() =>
                                  createAction.mutate({
                                    checklistItemId: item.id,
                                    managementSystemId,
                                    companyId,
                                    ...actionDraft,
                                  })
                                }
                              >
                                <Plus size={15} className="mr-1" />
                                Agregar
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-end border-t pt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (
                                confirm(
                                  "¿Eliminar este estándar y sus acciones? Esta acción no elimina el archivo original de checklist."
                                )
                              )
                                deleteItem.mutate({
                                  id: item.id,
                                  managementSystemId,
                                  companyId,
                                });
                            }}
                          >
                            <Trash2 size={15} className="mr-1" />
                            Eliminar estándar
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onImportFile}
        />
        {linkSource && (
          <LinkCommitmentsDialog
            companyId={companyId}
            source={linkSource}
            onClose={() => setLinkSource(null)}
            onLinked={refresh}
          />
        )}
        {showImportMapping && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-h-[90vh] w-full max-w-5xl overflow-auto">
              <CardContent className="p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Relacionar columnas de su Excel
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      La plantilla de ISGE 360 no es obligatoria. Seleccione qué
                      columna de su archivo corresponde a cada dato; los campos
                      que no existan pueden dejarse sin relacionar.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowImportMapping(false);
                      setRawImportRows([]);
                    }}
                  >
                    Cerrar
                  </Button>
                </div>
                <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <label className="mb-1 block text-sm font-semibold text-blue-900">
                    Fila donde están los encabezados
                  </label>
                  <select
                    className="h-10 w-full rounded-md border border-blue-200 bg-white px-3 text-sm"
                    value={String(importHeaderRow)}
                    onChange={event => {
                      const headerRow = Number(event.target.value);
                      setImportHeaderRow(headerRow);
                      setImportMapping(
                        detectImportMapping(
                          getMappingColumns(rawImportRows, headerRow)
                        )
                      );
                    }}
                  >
                    <option value="-1">
                      El archivo no tiene encabezados; la primera fila contiene
                      datos
                    </option>
                    {rawImportRows
                      .slice(0, Math.min(rawImportRows.length, 20))
                      .map((row, index) => (
                        <option key={index} value={index}>
                          Fila {index + 1}:{" "}
                          {row
                            .slice(0, 4)
                            .map(value => String(value ?? "").trim())
                            .filter(Boolean)
                            .join(" · ")
                            .slice(0, 110) || "vacía"}
                        </option>
                      ))}
                  </select>
                  <p className="mt-2 text-xs text-blue-700">
                    Se detectó automáticamente la fila{" "}
                    {importHeaderRow >= 0
                      ? importHeaderRow + 1
                      : "sin encabezados"}
                    . Puede cambiarla si su archivo contiene títulos, logotipos
                    o filas iniciales antes de la tabla.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Campo de ISGE 360</th>
                        <th className="p-3">Columna de su archivo</th>
                        <th className="p-3">Ejemplo detectado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {IMPORT_MAPPING_FIELDS.map(field => {
                        const selectedColumn = importColumns.find(
                          column => column.index === importMapping[field.key]
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
                                className="h-9 w-full rounded-md border bg-white px-2 text-sm"
                                value={
                                  importMapping[field.key] === undefined
                                    ? ""
                                    : String(importMapping[field.key])
                                }
                                onChange={event =>
                                  setImportMapping(current => ({
                                    ...current,
                                    [field.key]:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  }))
                                }
                              >
                                <option value="">No importar este dato</option>
                                {importColumns.map(column => (
                                  <option
                                    key={column.index}
                                    value={column.index}
                                  >
                                    {columnLetter(column.index)} —{" "}
                                    {column.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3 text-xs text-slate-500">
                              {selectedColumn?.sample || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  <span className="font-semibold text-red-600">*</span> El único
                  campo obligatorio es Estándar o compromiso. Si su archivo no
                  usa códigos, ISGE 360 usará el texto del estándar para evitar
                  duplicados.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowImportMapping(false);
                      setRawImportRows([]);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-teal-700 hover:bg-teal-800"
                    onClick={buildImportPreview}
                  >
                    Continuar a vista previa
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {showImportPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-h-[85vh] w-full max-w-3xl overflow-auto">
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Vista previa de importación
                    </h2>
                    <p className="text-sm text-slate-500">
                      Se crearán estándares nuevos y se actualizarán los
                      coincidentes. Las celdas vacías no borran información
                      existente.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowImportPreview(false)}
                  >
                    Cerrar
                  </Button>
                </div>
                <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
                  <FileSpreadsheet className="mr-1 inline" size={16} />
                  {importItems.length} filas válidas listas para procesar.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b text-slate-500">
                      <tr>
                        <th className="p-2">Fila</th>
                        <th className="p-2">Código</th>
                        <th className="p-2">Estándar</th>
                        <th className="p-2">Verificación</th>
                        <th className="p-2">Acción inicial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importItems.slice(0, 12).map(item => (
                        <tr key={item._rowIndex} className="border-b">
                          <td className="p-2">{item._rowIndex}</td>
                          <td className="p-2">{item.standardCode || "—"}</td>
                          <td className="p-2 font-medium">
                            {item.standardName}
                          </td>
                          <td className="p-2">
                            {item.verificationMode
                              ? modeLabel[item.verificationMode]
                              : "Planificación"}
                          </td>
                          <td className="p-2">{item.action || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importItems.length > 12 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Se muestran las primeras 12 filas.
                  </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowImportPreview(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-teal-700 hover:bg-teal-800"
                    disabled={importChecklist.isPending}
                    onClick={() =>
                      importChecklist.mutate({
                        managementSystemId,
                        companyId,
                        items: importItems,
                      })
                    }
                  >
                    {importChecklist.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Importar y actualizar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
