import { Button } from "@/components/ui/button";
import type { StrategicSaveStatus } from "@/hooks/useStrategicAutosave";
export function StrategicSaveState({ status, error, retry }: { status: StrategicSaveStatus; error: string | null; retry: () => void }) {
  const labels = { idle: "", pending: "Cambios pendientes…", saving: "Guardando…", saved: "Guardado", error: "Error al guardar" };
  return <div role="status" aria-live="polite" className={`min-h-6 text-xs flex flex-wrap items-center gap-2 ${status === "error" ? "text-red-700" : "text-slate-500"}`}>
    <span>{labels[status]}{error ? `: ${error}` : ""}</span>
    {status === "error" && <Button type="button" size="sm" variant="outline" onClick={retry}>Reintentar</Button>}
  </div>;
}
