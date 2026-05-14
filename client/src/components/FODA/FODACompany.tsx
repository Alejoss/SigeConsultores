import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Edit2, Plus, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { exportCompanyFODAToPDF } from "@/lib/exportCompanyFODAToPDF";

interface FODACompanyProps {
  companyId: number;
  isAdmin: boolean;
}

interface CompanyFODAElement {
  id: number;
  type: "Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza";
  description: string;
  justification?: string | null;
  processId?: number | null;
  processName?: string | null;
  isCustom: boolean;
  editedAt?: Date | null;
}

export default function FODACompany({ companyId, isAdmin }: FODACompanyProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingJustification, setEditingJustification] = useState("");
  const [addingType, setAddingType] = useState<"Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza" | null>(null);
  const [newDescription, setNewDescription] = useState("");
  const [newJustification, setNewJustification] = useState("");

  // Fetch company FODA
  const { data: companyFODA = { strengths: [], opportunities: [], weaknesses: [], threats: [] }, refetch } =
    trpc.fodasRouter.getCompanyFODA.useQuery({ companyId });

  // Mutations
  const updateElementMutation = trpc.fodasRouter.updateElement.useMutation({
    onSuccess: () => {
      toast.success("Elemento actualizado");
      setEditingId(null);
      setEditingText("");
      setEditingJustification("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const deleteElementMutation = trpc.fodasRouter.deleteElement.useMutation({
    onSuccess: () => {
      toast.success("Elemento eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const addElementMutation = trpc.fodasRouter.addCustomElement.useMutation({
    onSuccess: () => {
      toast.success("Elemento agregado");
      setAddingType(null);
      setNewDescription("");
      setNewJustification("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleEditStart = (element: CompanyFODAElement) => {
    setEditingId(element.id);
    setEditingText(element.description);
    setEditingJustification(element.justification || "");
  };

  const handleEditSave = () => {
    if (!editingId || !editingText.trim()) return;

    updateElementMutation.mutate({
      companyId,
      id: editingId,
      description: editingText,
      justification: editingJustification,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este elemento?")) {
      deleteElementMutation.mutate({ companyId, id });
    }
  };

  const renderFODAElement = (
    element: CompanyFODAElement,
    bgColor: string,
    textColor: string
  ) => {
    return (
      <div key={element.id} className={`${bgColor} rounded-lg p-4 mb-3 border-l-4 ${
        element.type === "Fortaleza" ? "border-l-green-500" :
        element.type === "Oportunidad" ? "border-l-blue-500" :
        element.type === "Debilidad" ? "border-l-yellow-500" :
        "border-l-red-500"
      }`}>
        {editingId === element.id ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Elemento</label>
              <Textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="Edita el elemento..."
                className="min-h-20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Justificación</label>
              <Textarea
                value={editingJustification}
                onChange={(e) => setEditingJustification(e.target.value)}
                placeholder="Justificación o contexto del elemento..."
                className="min-h-16"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEditSave}
                disabled={updateElementMutation.isPending}
                className="flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
                Guardar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setEditingText("");
                  setEditingJustification("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed font-medium">{element.description}</p>
              {element.justification && (
                <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                  <p className="text-xs text-muted-foreground italic mb-1">Justificación:</p>
                  <p className="text-xs leading-relaxed">{element.justification}</p>
                </div>
              )}
              <div className="flex gap-2 mt-3 flex-wrap">
                {element.isCustom && (
                  <span className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">
                    Agregado manualmente
                  </span>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEditStart(element)}
                  disabled={updateElementMutation.isPending}
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(element.id)}
                  disabled={deleteElementMutation.isPending}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFODAType = (
    title: string,
    elements: CompanyFODAElement[],
    bgColor: string,
    textColor: string,
    type: "Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza"
  ) => {
    return (
      <div className={`${bgColor} rounded-lg p-6 mb-6`}>
        <h3 className={`text-xl font-bold ${textColor} mb-4`}>{title}</h3>

        {elements.length === 0 ? (
          <p className="text-sm text-muted-foreground italic mb-4">No hay {title.toLowerCase()} definidas</p>
        ) : (
          <div className="mb-4">
            {elements.map((element) => renderFODAElement(element, bgColor, textColor))}
          </div>
        )}

        {isAdmin && addingType === type && (
          <div className="bg-background rounded-lg p-4 space-y-3 border-2 border-dashed">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Elemento</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder={`Describe una nueva ${title.toLowerCase()}...`}
                className="min-h-16"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Justificación (opcional)</label>
              <Textarea
                value={newJustification}
                onChange={(e) => setNewJustification(e.target.value)}
                placeholder="Justificación o contexto del elemento..."
                className="min-h-14"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!addingType || !newDescription.trim()) return;
                  addElementMutation.mutate({
                    companyId,
                    type: addingType,
                    description: newDescription,
                    justification: newJustification || undefined,
                  });
                }}
                disabled={addElementMutation.isPending}
                className="flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Agregar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingType(null);
                  setNewDescription("");
                  setNewJustification("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {isAdmin && addingType !== type && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddingType(type)}
            className="w-full flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar {title.toLowerCase()}
          </Button>
        )}
      </div>
    );
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>FODA de la Empresa</CardTitle>
              <CardDescription>Solo gerentes pueden editar esta sección</CardDescription>
            </div>
            <Button
              onClick={() => {
                try {
                  exportCompanyFODAToPDF(companyFODA);
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download size={16} />
              EXPORTAR FODA
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {renderFODAType(
              "Fortalezas",
              companyFODA.strengths,
              "bg-green-50 dark:bg-green-950",
              "text-green-700 dark:text-green-300",
              "Fortaleza"
            )}

            {renderFODAType(
              "Oportunidades",
              companyFODA.opportunities,
              "bg-blue-50 dark:bg-blue-950",
              "text-blue-700 dark:text-blue-300",
              "Oportunidad"
            )}

            {renderFODAType(
              "Debilidades",
              companyFODA.weaknesses,
              "bg-yellow-50 dark:bg-yellow-950",
              "text-yellow-700 dark:text-yellow-300",
              "Debilidad"
            )}

            {renderFODAType(
              "Amenazas",
              companyFODA.threats,
              "bg-red-50 dark:bg-red-950",
              "text-red-700 dark:text-red-300",
              "Amenaza"
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>FODA de la Empresa</CardTitle>
            <CardDescription>Edita y gestiona el FODA consolidado de tu empresa</CardDescription>
          </div>
          <Button
            onClick={() => {
              try {
                exportCompanyFODAToPDF(companyFODA);
                toast.success("PDF descargado exitosamente");
              } catch (error) {
                toast.error("Error al descargar el PDF");
              }
            }}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download size={16} />
            EXPORTAR FODA
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {renderFODAType(
            "Fortalezas",
            companyFODA.strengths,
            "bg-green-50 dark:bg-green-950",
            "text-green-700 dark:text-green-300",
            "Fortaleza"
          )}

          {renderFODAType(
            "Oportunidades",
            companyFODA.opportunities,
            "bg-blue-50 dark:bg-blue-950",
            "text-blue-700 dark:text-blue-300",
            "Oportunidad"
          )}

          {renderFODAType(
            "Debilidades",
            companyFODA.weaknesses,
            "bg-yellow-50 dark:bg-yellow-950",
            "text-yellow-700 dark:text-yellow-300",
            "Debilidad"
          )}

          {renderFODAType(
            "Amenazas",
            companyFODA.threats,
            "bg-red-50 dark:bg-red-950",
            "text-red-700 dark:text-red-300",
            "Amenaza"
          )}
        </div>
      </CardContent>
    </Card>
  );
}
