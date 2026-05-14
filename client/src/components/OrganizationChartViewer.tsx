import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, FileText, Trash2, Loader2 } from "lucide-react";

interface OrganizationChartViewerProps {
  chartId: number;
}

export default function OrganizationChartViewer({
  chartId,
}: OrganizationChartViewerProps) {
  const { data: files = [], isLoading, refetch } = trpc.organizationChart.getFiles.useQuery({
    chartId,
  });

  const deleteMutation = trpc.organizationChart.deletePDF.useMutation({
    onSuccess: () => {
      toast.success("Organigrama eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  const activeFile = files[0];

  const handleDelete = () => {
    if (!activeFile) return;
    if (confirm("¿Estás seguro de que deseas eliminar el organigrama actual?")) {
      deleteMutation.mutate({ fileId: activeFile.id });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Cargando organigrama...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
            <FileText className="w-12 h-12 text-gray-300" />
            <p className="text-center">
              No hay un organigrama subido aún. Ve a la pestaña <strong>Subir PDF</strong> para cargar uno.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FileText className="w-4 h-4" />
          <span>{activeFile.fileName}</span>
        </div>

        <div className="flex gap-2">
          <a href={activeFile.fileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Descargar
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
            {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </div>

      {/* PDF Viewer */}
      {activeFile && (
        <div className="w-full border rounded-lg overflow-hidden bg-gray-100">
          <iframe
            src={activeFile.fileUrl}
            className="w-full h-[700px]"
            title={activeFile.fileName}
          />
        </div>
      )}
    </div>
  );
}
