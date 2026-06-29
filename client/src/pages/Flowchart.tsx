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
import { getAxisBackPath } from "@/lib/sessionScope";

export default function Flowchart() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showAIChat, setShowAIChat] = useState(false);
  const { isManagerLogin } = useManagerAuth();
  const isManagerAccess = user?.role === "user" && typeof window !== "undefined" && localStorage.getItem("isManagerAccess") === "true";
  
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
              onClick={() => setLocation((isManagerAccess || isManagerLogin) ? getAxisBackPath("/manager-dashboard") : "/dashboard")}
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

        {/* Quick Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h3 className="font-bold text-blue-900 text-sm">1. FUNDAMENTOS EMPRESARIALES</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/strategic-objectives")}
              >
                Objetivos Estratégicos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/values")}
              >
                Valores
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/policy")}
              >
                Política
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-blue-900 text-sm">2. GESTIÓN DE PROCESOS</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/process-map")}
              >
                Mapa de Procesos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/process-characterization")}
              >
                Caracterización
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-blue-900 text-sm">3. INDICADORES</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModuleClick("/indicators")}
              >
                Indicadores
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
