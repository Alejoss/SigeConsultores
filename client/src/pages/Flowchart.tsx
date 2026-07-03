import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from 'lucide-react';
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { AIChatPanel } from "@/components/AIChatPanel";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

export default function Flowchart() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showAIChat, setShowAIChat] = useState(false);
  const { isManagerLogin } = useManagerAuth();
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  
  // Get company ID from localStorage or user context
  const companyId = typeof window !== "undefined" ? parseInt(localStorage.getItem("selectedCompanyId") || "0") : 0;

  const handleModuleClick = (modulePath: string) => {
    setLocation(modulePath);
  };

  const aiQueryMutation = trpc.ai.query.useMutation();

  const handleAIQuery = async (query: string): Promise<string> => {
    try {
      const response = await aiQueryMutation.mutateAsync({
        companyId,
        moduleType: "SIGE",
        query,
        contextData: {
          moduleName: "Flujograma SIGE",
          description: "Usuario consultando sobre el Flujograma SIGE y sus módulos",
        },
      });
      return response.response;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Error al consultar IA");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Flujograma SIGE</h1>
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
              onClick={() => setLocation(getAxisBackPathForRole())}
            >
              ← Volver
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-6 overflow-auto">
            <img
              src="/flujograma-sige.png"
              alt="Flujograma SIGE"
              className="w-full h-auto"
            />
          </div>
          
          {/* AI Chat Panel */}
          {showAIChat && (
            <div className="lg:col-span-1">
              <AIChatPanel
                title="Asesor SIGE"
                placeholder="¿Qué quieres saber del Flujograma SIGE?"
                onSendMessage={handleAIQuery}
                onClose={() => setShowAIChat(false)}
                isLoading={aiQueryMutation.isPending}
                maxHeight="h-96"
              />
            </div>
          )}
        </div>

        {/* Quick Modules — estructura actualizada oct25 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Bloque 1 */}
          <div className="space-y-2">
            <h3 className="font-bold text-blue-900 text-xs uppercase tracking-wide border-b border-blue-200 pb-1">1. Fundamentos Empresariales</h3>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/company-info")}>
                ¿Por qué?, ¿Cómo? y ¿Qué?
              </Button>
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/values")}>
                Valores Empresariales
              </Button>
            </div>
          </div>

          {/* Bloque 2 */}
          <div className="space-y-2">
            <h3 className="font-bold text-blue-900 text-xs uppercase tracking-wide border-b border-blue-200 pb-1">2. Marco Estratégico</h3>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/process-map")}>
                Mapa de Procesos
              </Button>
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/policy")}>
                Política SIG
              </Button>
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/strategic-objectives")}>
                Objetivos Estratégicos
              </Button>
            </div>
          </div>

          {/* Bloque 3 */}
          <div className="space-y-2">
            <h3 className="font-bold text-green-800 text-xs uppercase tracking-wide border-b border-green-200 pb-1">3. Operación y Caracterización</h3>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/process-map")}>
                Subprocesos
              </Button>
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/otg")}>
                OTG
              </Button>
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/ote")}>
                OTE
              </Button>
            </div>
          </div>

          {/* Bloque 4 */}
          <div className="space-y-2">
            <h3 className="font-bold text-green-800 text-xs uppercase tracking-wide border-b border-green-200 pb-1">4. Acciones de Seguimiento</h3>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/indicators")}>
                Indicadores
              </Button>
            </div>
          </div>

          {/* Bloque 5 */}
          <div className="space-y-2">
            <h3 className="font-bold text-orange-800 text-xs uppercase tracking-wide border-b border-orange-200 pb-1">5. Control y Mejora Continua</h3>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => handleModuleClick("/audits-inspections")}>
                Auditorías e Inspecciones
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
