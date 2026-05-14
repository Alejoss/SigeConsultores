import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import OrganizationChartUpload from "./OrganizationChartUpload";
import OrganizationChartViewer from "./OrganizationChartViewer";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface OrganizationChartModuleProps {
  companyId: number;
}

export default function OrganizationChartModule({ companyId }: OrganizationChartModuleProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "view">("view");

  // Get organization chart data
  const { data: chartData, isLoading, refetch } = trpc.organizationChart.getChart.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Create chart mutation
  const createChartMutation = trpc.organizationChart.createChart.useMutation({
    onSuccess: () => {
      toast.success("Organigrama creado exitosamente");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error al crear organigrama: ${error.message}`);
    },
  });

  const handleCreateChart = async () => {
    try {
      await createChartMutation.mutateAsync({
        companyId,
        name: "Organigrama de la Empresa",
        description: "Estructura organizacional de la empresa",
      });
    } catch (error) {
      console.error("Error creating chart:", error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Cargando organigrama...</span>
        </CardContent>
      </Card>
    );
  }

  // If no chart exists, show option to create one
  if (!chartData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crear Organigrama</CardTitle>
          <CardDescription>
            No hay un organigrama creado aún. Crea uno para comenzar a gestionar la estructura organizacional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Una vez creado el organigrama, podrás:
          </p>
          <ul className="text-sm text-gray-600 space-y-2 ml-4">
            <li>✓ Subir un PDF con la estructura organizacional</li>
            <li>✓ Visualizar la estructura organizacional</li>
            <li>✓ Ver el organigrama en diferentes niveles de detalle</li>
            <li>✓ Exportar a PDF</li>
          </ul>
          <Button 
            onClick={handleCreateChart} 
            disabled={createChartMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {createChartMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Creando...
              </>
            ) : (
              "Crear Organigrama"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organigrama de la Empresa</CardTitle>
          <CardDescription>
            Gestiona la estructura organizacional de la empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="view">Ver Organigrama</TabsTrigger>
              <TabsTrigger value="upload">Subir PDF</TabsTrigger>
            </TabsList>

            <TabsContent value="view" className="space-y-4">
              <OrganizationChartViewer chartId={chartData.id} />
            </TabsContent>

            <TabsContent value="upload" className="space-y-4">
              <OrganizationChartUpload 
                chartId={chartData.id}
                onUploadSuccess={() => refetch()}
              />
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
