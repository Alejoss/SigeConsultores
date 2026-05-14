import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MODULE_LABEL_DEFINITIONS } from "@shared/moduleLabelDefinitions";

interface CustomizeModulesPanelProps {
  allCompanies: any[];
  isLoadingCompanies: boolean;
}

export default function CustomizeModulesPanel({
  allCompanies,
  isLoadingCompanies,
}: CustomizeModulesPanelProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hydratedForCompany, setHydratedForCompany] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedResetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftRef = useRef(draft);
  const selectedCompanyIdRef = useRef(selectedCompanyId);
  draftRef.current = draft;
  selectedCompanyIdRef.current = selectedCompanyId;

  const utils = trpc.useUtils();

  const labelsQuery = trpc.moduleCustomization.getLabels.useQuery(
    { companyId: selectedCompanyId || 0 },
    { enabled: selectedCompanyId != null && selectedCompanyId > 0 }
  );

  const upsertMutation = trpc.moduleCustomization.upsert.useMutation({
    onSuccess: async (_data, variables) => {
      await Promise.all([
        utils.moduleCustomization.get.invalidate({
          companyId: variables.companyId,
          moduleName: variables.moduleName,
        }),
        utils.moduleCustomization.getLabels.invalidate({
          companyId: variables.companyId,
        }),
      ]);
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
      setSaveStatus("saved");
      savedResetTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error: any) => {
      setSaveStatus("error");
      toast.error(error.message || "Error al guardar la personalización");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  useEffect(() => {
    setHydratedForCompany(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || labelsQuery.isLoading || !labelsQuery.data) return;
    if (hydratedForCompany === selectedCompanyId) return;
    const data = labelsQuery.data as Record<string, { customLabel?: string | null }>;
    const next: Record<string, string> = {};
    for (const def of MODULE_LABEL_DEFINITIONS) {
      const v = data[def.moduleName]?.customLabel;
      next[def.moduleName] = typeof v === "string" ? v : "";
    }
    setDraft(next);
    setHydratedForCompany(selectedCompanyId);
  }, [selectedCompanyId, labelsQuery.data, labelsQuery.isLoading, hydratedForCompany]);

  const serverSnapshot = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!labelsQuery.data) return;
    const data = labelsQuery.data as Record<string, { customLabel?: string | null }>;
    const snap: Record<string, string> = {};
    for (const def of MODULE_LABEL_DEFINITIONS) {
      const v = data[def.moduleName]?.customLabel;
      snap[def.moduleName] = typeof v === "string" ? v.trim() : "";
    }
    serverSnapshot.current = snap;
  }, [labelsQuery.data]);

  useEffect(() => {
    if (!selectedCompanyId || hydratedForCompany !== selectedCompanyId) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const companyId = selectedCompanyIdRef.current;
      if (!companyId) return;
      const latest = draftRef.current;
      const snap = serverSnapshot.current;
      for (const def of MODULE_LABEL_DEFINITIONS) {
        const want = (latest[def.moduleName] ?? "").trim();
        const have = (snap[def.moduleName] ?? "").trim();
        if (want === have) continue;
        upsertMutation.mutate({
          companyId,
          moduleName: def.moduleName,
          label: want === "" ? null : want,
        });
      }
    }, 1500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [draft, selectedCompanyId, hydratedForCompany]);

  const handleDraftChange = (moduleName: string, value: string) => {
    setDraft((prev) => ({ ...prev, [moduleName]: value }));
  };

  const groups = [...new Set(MODULE_LABEL_DEFINITIONS.map((d) => d.group))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalizar Módulos</CardTitle>
        <CardDescription>
          Un nombre por elemento: cada fila se guarda por separado y una edición nueva sustituye el valor anterior de ese elemento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="company-select">Seleccionar Empresa</Label>
          <select
            id="company-select"
            className="w-full px-3 py-2 border rounded-md text-sm"
            value={selectedCompanyId || ""}
            onChange={(e) => {
              const companyId = parseInt(e.target.value, 10);
              setSelectedCompanyId(companyId || null);
            }}
            disabled={isLoadingCompanies}
          >
            <option value="">-- Selecciona una empresa --</option>
            {allCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {selectedCompanyId && (
          <div className="space-y-6 border-t pt-6">
            <div className="flex items-center gap-2 min-h-6">
              {labelsQuery.isLoading && <p className="text-sm text-slate-500">Cargando personalización…</p>}
              {upsertMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-slate-400 animate-pulse" />
                  <span>Guardando...</span>
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardado</span>
                </div>
              )}
              {saveStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Error al guardar</span>
                </div>
              )}
            </div>

            {groups.map((group) => (
              <div key={group} className="space-y-4">
                <p className="text-sm font-semibold text-slate-800">{group}</p>
                <div className="space-y-4">
                  {MODULE_LABEL_DEFINITIONS.filter((d) => d.group === group).map((def) => (
                    <div key={def.moduleName} className="space-y-2">
                      <Label htmlFor={def.moduleName} className="text-sm">
                        {def.defaultLabel}
                      </Label>
                      <p className="text-xs text-slate-500">{def.description}</p>
                      <Input
                        id={def.moduleName}
                        value={draft[def.moduleName] ?? ""}
                        onChange={(e) => handleDraftChange(def.moduleName, e.target.value)}
                        placeholder={def.defaultLabel}
                        className="text-sm"
                        disabled={labelsQuery.isLoading || hydratedForCompany !== selectedCompanyId}
                      />
                      <p className="text-xs text-slate-400 font-mono">{def.moduleName}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800">
                Los cambios se guardan automáticamente 1,5 s después de dejar de escribir. Deja el campo vacío para usar el nombre por defecto del sistema.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!selectedCompanyId && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              Selecciona una empresa para personalizar sus módulos.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
