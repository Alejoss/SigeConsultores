import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import OrganizationChartModule from "@/components/OrganizationChartModule";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function OrganizationChart() {
  const { user } = useAuth();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const [, setLocation] = useLocation();
  const [isSaving, setIsSaving] = useState(false);

  // Check if companyId is in URL parameters
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const companyIdFromUrl = urlParams.get('companyId');

  // Use manager company if logged in as manager, otherwise use URL parameter or localStorage
  const selectedCompanyId = useMemo(() => {
    if (isManagerLogin && managerCompanyId) {
      return managerCompanyId;
    }
    if (companyIdFromUrl) return parseInt(companyIdFromUrl);
    const stored = localStorage.getItem("selectedCompanyId") || localStorage.getItem("managerCompanyId");
    return stored ? parseInt(stored) : 0;
  }, [isManagerLogin, managerCompanyId, companyIdFromUrl]);

  const handleExportPDF = (type: "basic" | "extended") => {
    toast.info(`Exportando versión ${type === "basic" ? "básica" : "extendida"}...`);
    // TODO: Implement PDF export
    console.log("Export PDF as", type);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement save functionality
      toast.success("Organigrama guardado exitosamente");
    } catch (error) {
      toast.error("Error al guardar el organigrama");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setLocation("/dashboard");
  };

  if (!selectedCompanyId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">
          <p className="text-gray-600">Por favor, selecciona una empresa primero.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Title and Action Buttons */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Organigrama</h1>
            <p className="text-gray-600 mt-2">
              Gestiona la estructura organizacional de tu empresa
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Export PDF Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Exportar a PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportPDF("basic")}>
                  Versión Básica
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF("extended")}>
                  Versión Extendida
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>

            {/* Back Button */}
            <Button
              onClick={handleBack}
              variant="outline"
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </div>
        </div>

        {/* Organization Chart Module */}
        <OrganizationChartModule companyId={selectedCompanyId} />
      </div>
    </DashboardLayout>
  );
}
