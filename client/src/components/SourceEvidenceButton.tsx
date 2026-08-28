import { useState } from "react";
import { Eye, FileText, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SourceType =
  | "checklist_action"
  | "checklist_vigency"
  | "program_action"
  | "company_compliance";

export function SourceEvidenceButton({
  companyId,
  sourceType,
  sourceId,
  compact = false,
}: {
  companyId: number;
  sourceType: SourceType;
  sourceId: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const evidenceQuery = trpc.linkedCommitments.listSourceEvidence.useQuery(
    { companyId, sourceType, sourceId },
    { enabled: open, staleTime: 0 }
  );
  const evidence = evidenceQuery.data || [];

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-slate-300 text-slate-700 hover:bg-slate-50"
        onClick={() => setOpen(true)}
      >
        <Eye className="mr-1 h-4 w-4" />
        {compact ? "Evidencias" : "Ver evidencias de procesos"}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[85vh] w-full max-w-2xl overflow-auto shadow-xl">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Evidencias aportadas por procesos
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Archivos adjuntos por los responsables al gestionar este
                    compromiso.
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-5 space-y-2">
                {evidenceQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando evidencias...
                  </div>
                ) : evidence.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-7 text-center text-sm text-slate-500">
                    Los procesos vinculados aún no han adjuntado evidencias.
                  </p>
                ) : (
                  evidence.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                          <FileText className="h-4 w-4 shrink-0 text-teal-700" />
                          {item.fileName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Subido por: {item.processName}
                        </p>
                      </div>
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border border-teal-300 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50"
                      >
                        Abrir
                      </a>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
