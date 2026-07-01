import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useLocation } from "wouter";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { getAxisBackPath } from "@/lib/sessionScope";
import FODAConsolidation from "@/components/FODA/FODAConsolidation";
import FODACompany from "@/components/FODA/FODACompany";
import { AIChatPanel } from "@/components/AIChatPanel";
import { trpc } from "@/lib/trpc";

/**
 * FODA Module - Main component
 * Displays two pages:
 * 1. Consolidation: Shows all process FODAs and allows selecting elements
 * 2. Company FODA: Shows selected elements and allows editing/adding new ones
 */
export default function FODA() {
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("consolidation");
  const [showAIChat, setShowAIChat] = useState(false);
  const aiQueryMutation = trpc.ai.query.useMutation();

  // Get companyId from localStorage FIRST
  const companyId = useMemo(() => {
    const stored = localStorage.getItem("selectedCompanyId");
    return stored ? parseInt(stored) : 0;
  }, []);

  // Initialize enterpriseVersions with localStorage persistence
  const [enterpriseVersions, setEnterpriseVersions] = useState<Map<string, string>>(() => {
    if (!companyId) return new Map();
    const stored = localStorage.getItem(`foda_enterprise_versions_${companyId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return new Map(Object.entries(parsed));
      } catch (e) {
        return new Map();
      }
    }
    return new Map();
  });

  // Persist to localStorage whenever enterpriseVersions changes
  useEffect(() => {
    if (!companyId) return;
    const toStore = Object.fromEntries(enterpriseVersions);
    localStorage.setItem(`foda_enterprise_versions_${companyId}`, JSON.stringify(toStore));
  }, [enterpriseVersions, companyId]);

  // Check if user is a manager
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  const dashboardRoute = (isManagerAccess || isManagerLogin) ? getAxisBackPath("/manager-dashboard") : "/dashboard";

  const handleAIQuery = async (query: string): Promise<string> => {
    try {
      const response = await aiQueryMutation.mutateAsync({
        companyId,
        moduleType: "FODA",
        query,
        contextData: {
          moduleName: "FODA de la Empresa",
          description: "Usuario consultando sobre análisis FODA (Fortalezas, Oportunidades, Debilidades, Amenazas)",
        },
      });
      return response.response;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Error al consultar IA");
    }
  };

  if (!companyId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Por favor selecciona una empresa</h1>
          <Button onClick={() => setLocation(dashboardRoute)}>Volver al Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        {/* Header with Back Button and AI Chat */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">FODA de la Empresa</h1>
            <p className="text-muted-foreground">
              Consolida los FODA de todos los procesos y crea el FODA general de la empresa
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIChat(!showAIChat)}
              className="flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              {showAIChat ? "Cerrar Asesor" : "Asesor IA"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation(dashboardRoute)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="consolidation">Consolidación de Procesos</TabsTrigger>
                <TabsTrigger value="company">FODA de Empresa</TabsTrigger>
              </TabsList>

              <TabsContent value="consolidation" className="mt-6">
                <FODAConsolidation 
                  companyId={companyId}
                  enterpriseVersions={enterpriseVersions}
                  setEnterpriseVersions={setEnterpriseVersions}
                  onElementSelected={() => setActiveTab("company")} 
                />
              </TabsContent>

              <TabsContent value="company" className="mt-6">
                <FODACompany 
                  companyId={companyId}
                  isAdmin={user?.role === "admin"} 
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* AI Chat Panel */}
          {showAIChat && (
            <div className="lg:col-span-1">
              <AIChatPanel
                title="Asesor FODA"
                placeholder="¿Qué quieres saber sobre FODA?"
                onSendMessage={handleAIQuery}
                onClose={() => setShowAIChat(false)}
                isLoading={aiQueryMutation.isPending}
                maxHeight="h-96"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
