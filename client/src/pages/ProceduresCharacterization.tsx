import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, FileText } from 'lucide-react';

interface ProcedureRecord {
  id?: number;
  procedureId?: number;
  name: string;
  code: string;
  version: string;
  date?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
  file?: File;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Procedure {
  id: number;
  processId: number;
  name: string;
  objective: string | null;
  code: string;
  version: string;
  createdDate: string | null;
  lastVersion: string | null;
  procedureFileUrl: string | null;
  procedureFileKey: string | null;
  flowchartFileUrl: string | null;
  flowchartFileKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  name: string;
  objective: string;
  code: string;
  version: string;
  createdDate: string;
  records: ProcedureRecord[];
  procedureFile?: File;
  flowchartFile?: File;
}

interface Props {
  processId: number;
  processName?: string;
  onVolver?: () => void;
}

export default function ProceduresCharacterization({ processId: propProcessId, processName: propProcessName, onVolver }: Props) {
  const [, setLocation] = useLocation();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProcedures, setSelectedProcedures] = useState<Set<number>>(new Set());
  const [procedureRecords, setProcedureRecords] = useState<{ [key: number]: ProcedureRecord[] }>({});
  const [editData, setEditData] = useState<Partial<Procedure> | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingRecord, setEditingRecord] = useState<ProcedureRecord | null>(null);
  const [addingRecordToProcedureId, setAddingRecordToProcedureId] = useState<number | null>(null);
  const [newRecordData, setNewRecordData] = useState<ProcedureRecord>({
    name: "",
    code: "",
    version: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [formData, setFormData] = useState<FormData>({
    name: "",
    objective: "",
    code: "",
    version: "",
    createdDate: new Date().toISOString().split("T")[0],
    records: [],
  });

  const procedureInputRef = useRef<HTMLInputElement>(null);
  const flowchartInputRef = useRef<HTMLInputElement>(null);
  const recordFileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const uploadFileMutation = trpc.procedures.uploadFile.useMutation();
  const createMutation = trpc.procedures.create.useMutation();
  const deleteMutation = trpc.procedures.delete.useMutation();
  const updateMutation = trpc.procedures.update.useMutation();
  const addRecordMutation = trpc.procedures.addRecord.useMutation();
  const getByIdQuery = trpc.procedures.getById.useQuery(
    { procedureId: expandedId || 0 },
    { enabled: expandedId !== null }
  );
  const getByProcessQuery = trpc.procedures.getByProcess.useQuery({ processId: propProcessId });
  const deleteRecordMutation = trpc.procedures.deleteRecord.useMutation();
  const updateRecordMutation = trpc.procedures.updateRecord.useMutation();

  useEffect(() => {
    if (getByProcessQuery.data) {
      setProcedures(getByProcessQuery.data);
    }
  }, [getByProcessQuery.data]);

  useEffect(() => {
    if (getByIdQuery.data && expandedId) {
      setProcedureRecords((prev) => ({
        ...prev,
        [expandedId]: getByIdQuery.data.records || [],
      }));
    }
  }, [getByIdQuery.data, expandedId]);

  useEffect(() => {
    if (expandedId && !procedureRecords[expandedId]) {
      getByIdQuery.refetch();
    }
  }, [expandedId]);

  const uploadFile = async (file: File): Promise<{ url: string; key: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const result = await uploadFileMutation.mutateAsync({
      fileName: file.name,
      fileData: Array.from(uint8Array),
      fileType: file.type,
    });
    return result;
  };

  const handleEditRecord = (record: ProcedureRecord) => {
    setEditingRecordId(record.id || null);
    setEditingRecord({ ...record });
  };

  const handleSaveEditRecord = async () => {
    if (!editingRecord || !editingRecord.id || !editingRecord.procedureId) {
      toast.error("Error: No se puede guardar el registro");
      return;
    }

    try {
      await updateRecordMutation.mutateAsync({
        id: editingRecord.id,
        name: editingRecord.name,
        code: editingRecord.code,
        version: editingRecord.version,
        date: typeof editingRecord.date === 'string'
          ? editingRecord.date
          : new Date().toISOString().split('T')[0],
        fileUrl: editingRecord.fileUrl || undefined,
        fileKey: editingRecord.fileKey || undefined,
      });

      toast.success("Registro actualizado correctamente");
      setEditingRecordId(null);
      setEditingRecord(null);
      
      // Recargar los registros del procedimiento
      if (expandedId) {
        getByIdQuery.refetch();
      }
    } catch (error) {
      toast.error("Error al actualizar el registro");
      console.error(error);
    }
  };

  const handleAddNewRecord = async (procedureId: number) => {
    if (!newRecordData.name || !newRecordData.code || !newRecordData.version) {
      toast.error("Por favor completa todos los campos del registro");
      return;
    }

    try {
      await addRecordMutation.mutateAsync({
        procedureId,
        name: newRecordData.name,
        code: newRecordData.code,
        version: newRecordData.version,
        date: typeof newRecordData.date === 'string' ? newRecordData.date : new Date().toISOString().split('T')[0],
      });

      toast.success("Registro agregado correctamente");
      setAddingRecordToProcedureId(null);
      setNewRecordData({ name: "", code: "", version: "", date: new Date().toISOString().split("T")[0] });
      
      getByProcessQuery.refetch();
      if (expandedId === procedureId) {
        getByIdQuery.refetch();
      }
    } catch (error) {
      toast.error("Error al agregar el registro");
      console.error(error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.code || !formData.version) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }

    try {
      let procedureFileUrl = "";
      let procedureFileKey = "";
      let flowchartFileUrl = "";
      let flowchartFileKey = "";

      if (formData.procedureFile) {
        const result = await uploadFile(formData.procedureFile);
        procedureFileUrl = result.url;
        procedureFileKey = result.key;
      }

      if (formData.flowchartFile) {
        const result = await uploadFile(formData.flowchartFile);
        flowchartFileUrl = result.url;
        flowchartFileKey = result.key;
      }

      const createResult = await createMutation.mutateAsync({
        processId: propProcessId,
        name: formData.name,
        objective: formData.objective,
        code: formData.code,
        version: formData.version,
        createdDate: formData.createdDate,
        procedureFileUrl,
        procedureFileKey,
        flowchartFileUrl,
        flowchartFileKey,
      });

      const procedureId = (createResult as any).id;
      console.log("Procedure created with ID:", procedureId);

      if (!procedureId) {
        toast.error("No se pudo obtener el ID del procedimiento creado");
        return;
      }

      if (formData.records.length > 0) {
        let recordsSaved = 0;
        let recordsError = 0;

        for (const record of formData.records) {
          try {
            let recordFileUrl = "";
            let recordFileKey = "";

            if (record.file) {
              const fileResult = await uploadFile(record.file);
              recordFileUrl = fileResult.url;
              recordFileKey = fileResult.key;
            }

            console.log("Saving record:", record.name, "for procedure:", procedureId);
            await addRecordMutation.mutateAsync({
              procedureId: procedureId as number,
              name: record.name,
              code: record.code,
              version: record.version,
              date: record.date ? (typeof record.date === 'string' ? record.date : new Date(record.date).toISOString().split('T')[0]) : undefined,
              fileUrl: recordFileUrl,
              fileKey: recordFileKey,
            });

            recordsSaved++;
          } catch (error) {
            console.error("Error saving record:", error);
            recordsError++;
          }
        }

        if (recordsSaved > 0) {
          toast.success(`Procedimiento y ${recordsSaved} registro(s) guardado(s)`);
        } else {
          toast.success("Procedimiento guardado correctamente");
        }

        if (recordsError > 0) {
          toast.error(`Error al guardar ${recordsError} registro(s)`);
        }
      } else {
        toast.success("Procedimiento guardado correctamente");
      }

      setFormData({
        name: "",
        objective: "",
        code: "",
        version: "",
        createdDate: new Date().toISOString().split("T")[0],
        records: [],
      });
      setShowForm(false);
      getByProcessQuery.refetch();
    } catch (error) {
      console.error("Error:", error);
      const errorMsg = error instanceof Error ? error.message : "Error desconocido";
      toast.error("Error al subir procedimiento: " + errorMsg);
    }
  };

  const handleEditStart = (procedure: Procedure) => {
    setEditingId(procedure.id);
    setEditData({
      id: procedure.id,
      name: procedure.name,
      objective: procedure.objective,
      code: procedure.code,
      version: procedure.version,
      createdDate: procedure.createdDate,
    });
  };

  const handleEditSave = async () => {
    if (!editData || !editData.id) return;

    try {
      await updateMutation.mutateAsync({
        id: editData.id,
        name: editData.name || undefined,
        objective: editData.objective || undefined,
        code: editData.code || undefined,
        version: editData.version || undefined,
        createdDate: editData.createdDate ? new Date(editData.createdDate).toISOString().split("T")[0] : undefined,
      });

      toast.success("Procedimiento actualizado correctamente");
      setEditingId(null);
      setEditData(null);
      getByProcessQuery.refetch();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al actualizar procedimiento");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditData(null);
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este registro?")) return;

    try {
      await deleteRecordMutation.mutateAsync({ id: recordId });
      toast.success("Registro eliminado correctamente");
      if (expandedId) {
        getByIdQuery.refetch();
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al eliminar registro");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "procedure" | "flowchart") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "procedure") {
      const validTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      if (!validTypes.includes(file.type)) {
        toast.error("Formato de archivo no válido. Usa PDF o Word");
        return;
      }
      setFormData({ ...formData, procedureFile: file });
    } else if (type === "flowchart") {
      if (file.type !== "application/pdf") {
        toast.error("El flujograma debe ser un archivo PDF");
        return;
      }
      setFormData({ ...formData, flowchartFile: file });
    }
  };

  const handleRecordFileChange = (e: React.ChangeEvent<HTMLInputElement>, recordIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const updatedRecords = [...formData.records];
    updatedRecords[recordIndex].file = file;
    setFormData({ ...formData, records: updatedRecords });
    toast.success(`Archivo "${file.name}" agregado al registro`);
  };

  const addRecord = () => {
    setFormData({
      ...formData,
      records: [
        ...formData.records,
        {
          name: "",
          code: "",
          version: "",
          date: new Date().toISOString().split("T")[0],
        },
      ],
    });
  };

  const updateRecord = (index: number, field: keyof ProcedureRecord, value: string) => {
    const updatedRecords = [...formData.records];
    updatedRecords[index] = { ...updatedRecords[index], [field]: value };
    setFormData({ ...formData, records: updatedRecords });
  };

  const removeRecord = (index: number) => {
    setFormData({
      ...formData,
      records: formData.records.filter((_, i) => i !== index),
    });
  };

  const toggleProcedureSelection = (procedureId: number) => {
    const newSelected = new Set(selectedProcedures);
    if (newSelected.has(procedureId)) {
      newSelected.delete(procedureId);
    } else {
      newSelected.add(procedureId);
    }
    setSelectedProcedures(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProcedures.size === filtered.length && filtered.length > 0) {
      setSelectedProcedures(new Set());
    } else {
      setSelectedProcedures(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProcedures.size === 0) {
      toast.error("Por favor selecciona al menos un procedimiento");
      return;
    }

    const confirmDelete = window.confirm(
      `¿Estás seguro de que deseas eliminar ${selectedProcedures.size} procedimiento(s)? Esta acción no se puede deshacer.`
    );

    if (!confirmDelete) return;

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const procedureId of Array.from(selectedProcedures)) {
        try {
          await deleteMutation.mutateAsync({ id: procedureId });
          successCount++;
        } catch (error) {
          console.error(`Error deleting procedure ${procedureId}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} procedimiento(s) eliminado(s) correctamente`);
      }
      if (errorCount > 0) {
        toast.error(`Error al eliminar ${errorCount} procedimiento(s)`);
      }

      setSelectedProcedures(new Set());
      getByProcessQuery.refetch();
    } catch (error) {
      console.error("Error during deletion:", error);
      toast.error("Error al eliminar procedimientos");
    }
  };

  const generateControlDocumentPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const maxWidth = pageWidth - 2 * margin;
    let y = 18;
    const processLabel = propProcessName || `Proceso #${propProcessId}`;
    const today = new Date().toLocaleDateString('es-ES');

    const checkPage = (needed: number) => {
      if (y + needed > pageHeight - 15) { doc.addPage(); y = 18; }
    };

    // ── Encabezado del documento ──────────────────────────────────────────
    doc.setFillColor(30, 58, 138);
    doc.rect(margin, y - 6, maxWidth, 12, 'F');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('CONTROL DE DOCUMENTOS', pageWidth / 2, y + 1, { align: 'center' });
    y += 12;

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Proceso: ${processLabel}`, margin, y);
    y += 6;
    doc.text(`Fecha de generación: ${today}`, margin, y);
    y += 6;
    doc.text(`Total de procedimientos: ${procedures.length}`, margin, y);
    y += 10;

    // ── Un bloque por cada procedimiento ─────────────────────────────────
    procedures.forEach((proc, idx) => {
      checkPage(40);

      // Cabecera del procedimiento
      doc.setFillColor(220, 234, 255);
      doc.rect(margin, y - 4, maxWidth, 8, 'F');
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      const title = `${idx + 1}. ${proc.name}`;
      const titleLines = doc.splitTextToSize(title, maxWidth - 4);
      doc.text(titleLines as string[], margin + 2, y);
      y += titleLines.length * 5 + 3;

      // Datos del procedimiento
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const objLines = doc.splitTextToSize(`Objetivo: ${proc.objective || 'N/A'}`, maxWidth);
      checkPage(objLines.length * 4 + 16);
      doc.text(objLines as string[], margin, y);
      y += objLines.length * 4 + 2;

      doc.text(`Código: ${proc.code}   |   Versión: ${proc.version}   |   Fecha: ${proc.createdDate || 'N/A'}`, margin, y);
      y += 6;

      // Tabla de registros
      const records = procedureRecords[proc.id];
      if (records && records.length > 0) {
        checkPage(14);
        // Encabezado de la tabla
        doc.setFillColor(34, 197, 94);
        doc.rect(margin, y - 3, maxWidth, 7, 'F');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        const colW = [maxWidth * 0.45, maxWidth * 0.2, maxWidth * 0.15, maxWidth * 0.2];
        doc.text('Nombre del Registro', margin + 2, y + 1);
        doc.text('Código', margin + colW[0] + 2, y + 1);
        doc.text('Versión', margin + colW[0] + colW[1] + 2, y + 1);
        doc.text('Fecha', margin + colW[0] + colW[1] + colW[2] + 2, y + 1);
        y += 7;

        records.forEach((rec, ri) => {
          const nameLines = doc.splitTextToSize(rec.name, colW[0] - 4);
          const rowH = Math.max(nameLines.length * 4, 6) + 2;
          checkPage(rowH);
          doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 250 : 255, ri % 2 === 0 ? 252 : 255);
          doc.rect(margin, y - 3, maxWidth, rowH, 'F');
          doc.setFontSize(8);
          doc.setTextColor(40, 40, 40);
          doc.text(nameLines as string[], margin + 2, y);
          doc.text(rec.code || '', margin + colW[0] + 2, y);
          doc.text(rec.version || '', margin + colW[0] + colW[1] + 2, y);
          doc.text(rec.date || 'N/A', margin + colW[0] + colW[1] + colW[2] + 2, y);
          y += rowH;
        });
      } else {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Sin registros asociados', margin + 4, y);
        y += 5;
      }

      y += 6; // Espacio entre procedimientos
    });

    // ── Pie de página en cada hoja ────────────────────────────────────────
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(`Página ${i} de ${totalPages}  |  SIGE Platform  |  ${today}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    const fileName = `Control_Documentos_${processLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const filtered = procedures.filter((proc) => {
    const searchLower = searchTerm.toLowerCase();
    return proc.name.toLowerCase().includes(searchLower) || proc.code.toLowerCase().includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-2xl font-bold">Procedimientos</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (onVolver) {
                onVolver();
              } else {
                setLocation("/process-characterization");
              }
            }}
            className="gap-2"
          >
            <ArrowLeft size={16} />
            VOLVER
          </Button>
          <Button
            variant="outline"
            onClick={generateControlDocumentPDF}
            disabled={procedures.length === 0}
            className="gap-2"
          >
            <FileText size={16} />
            Generar Control de Documentos
          </Button>
          <Button onClick={() => setShowForm(!showForm)} variant="default">
            {showForm ? "Cancelar" : "Registrar nuevo procedimiento"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Nuevo Procedimiento</h3>

          <div className="grid grid-cols-2 gap-4">
            <Input placeholder="Nombre del Procedimiento *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Input placeholder="Código del Procedimiento *" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
          </div>

          <Textarea placeholder="Objetivo del Procedimiento" value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} />

          <div className="grid grid-cols-2 gap-4">
            <Input placeholder="Versión *" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })} />
            <Input type="date" placeholder="Fecha" value={formData.createdDate} onChange={(e) => setFormData({ ...formData, createdDate: e.target.value })} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Archivo de Procedimiento (PDF/Word)</label>
              <input type="file" ref={procedureInputRef} onChange={(e) => handleFileChange(e, "procedure")} accept=".pdf,.doc,.docx" style={{ display: "none" }} />
              <Button onClick={() => procedureInputRef.current?.click()} variant="outline" className="w-full">
                {formData.procedureFile ? `✓ ${formData.procedureFile.name}` : "Seleccionar archivo"}
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Flujograma (PDF)</label>
              <input type="file" ref={flowchartInputRef} onChange={(e) => handleFileChange(e, "flowchart")} accept=".pdf" style={{ display: "none" }} />
              <Button onClick={() => flowchartInputRef.current?.click()} variant="outline" className="w-full">
                {formData.flowchartFile ? `✓ ${formData.flowchartFile.name}` : "Seleccionar archivo"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold">Registros del Procedimiento</h4>
              <Button onClick={addRecord} variant="outline" size="sm">
                + Agregar Registro
              </Button>
            </div>

            {formData.records.map((record, index) => (
              <Card key={index} className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <Input placeholder="Nombre del Registro" value={record.name} onChange={(e) => updateRecord(index, "name", e.target.value)} />
                  <Input placeholder="Código" value={record.code} onChange={(e) => updateRecord(index, "code", e.target.value)} />
                  <Input placeholder="Versión" value={record.version} onChange={(e) => updateRecord(index, "version", e.target.value)} />
                  <Input type="date" value={typeof record.date === 'string' ? record.date : ""} onChange={(e) => updateRecord(index, "date", e.target.value)} />
                </div>

                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={(el) => {
                      if (el) recordFileInputRefs.current[index] = el;
                    }}
                    onChange={(e) => handleRecordFileChange(e, index)}
                    style={{ display: "none" }}
                  />
                  <Button onClick={() => recordFileInputRefs.current[index]?.click()} variant="outline" className="flex-1">
                    {record.file ? `✓ ${record.file.name}` : "Subir Archivo"}
                  </Button>
                  <Button onClick={() => removeRecord(index)} variant="destructive" size="sm">
                    Eliminar
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Button onClick={handleSubmit} className="w-full bg-green-600 hover:bg-green-700">
            Subir Procedimiento
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <Input placeholder="Buscar procedimientos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1" />
          {filtered.length > 0 && (
            <Button
              onClick={toggleSelectAll}
              variant={selectedProcedures.size === filtered.length && filtered.length > 0 ? "default" : "outline"}
              size="sm"
            >
              {selectedProcedures.size === filtered.length && filtered.length > 0 ? "Deseleccionar Todo" : "Seleccionar Todo"}
            </Button>
          )}
        </div>

        {selectedProcedures.size > 0 && (
          <div className="flex gap-2 items-center bg-red-50 p-3 rounded-md border border-red-200">
            <span className="text-sm font-medium text-red-800">{selectedProcedures.size} procedimiento(s) seleccionado(s)</span>
            <Button onClick={handleDeleteSelected} variant="destructive" size="sm" className="ml-auto">
              🗑️ Eliminar Seleccionados
            </Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">No hay procedimientos</p>
      ) : (
        filtered.map((procedure) => (
          <Card key={procedure.id} className={`p-4 transition-colors ${selectedProcedures.has(procedure.id) ? "bg-red-50 border-red-300" : ""}`}>
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={selectedProcedures.has(procedure.id)}
                  onChange={() => toggleProcedureSelection(procedure.id)}
                  className="mt-1 w-5 h-5 cursor-pointer"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{procedure.name}</h3>
                  <p className="text-sm text-gray-600">{procedure.objective}</p>
                  <p className="text-sm text-gray-500">Código: {procedure.code}</p>
                </div>
              </div>
              <Button onClick={() => setExpandedId(expandedId === procedure.id ? null : procedure.id)} variant="ghost">
                {expandedId === procedure.id ? "▼" : "▶"}
              </Button>
            </div>

            {expandedId === procedure.id && (
              <div className="mt-4 space-y-4 border-t pt-4">
                {editingId === procedure.id ? (
                  <div className="space-y-3 bg-blue-50 p-4 rounded-md border border-blue-200">
                    <h4 className="font-semibold text-blue-900">Editar Procedimiento</h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Nombre</label>
                        <Input
                          value={editData?.name || ""}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Código</label>
                        <Input
                          value={editData?.code || ""}
                          onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Versión</label>
                        <Input
                          value={editData?.version || ""}
                          onChange={(e) => setEditData({ ...editData, version: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Fecha</label>
                        <Input
                          type="date"
                          value={editData?.createdDate ? (typeof editData.createdDate === 'string' ? editData.createdDate : new Date(editData.createdDate).toISOString().split("T")[0]) : ""}
                          onChange={(e) => setEditData({ ...editData, createdDate: e.target.value as any })}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Objetivo</label>
                      <Textarea
                        value={editData?.objective || ""}
                        onChange={(e) => setEditData({ ...editData, objective: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleEditSave} className="flex-1 bg-green-600 hover:bg-green-700">
                        Guardar
                      </Button>
                      <Button onClick={handleEditCancel} variant="outline" className="flex-1">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-semibold">Versión: {procedure.version}</p>
                        <p className="font-semibold">Fecha: {procedure.createdDate || "N/A"}</p>
                      </div>
                    </div>

                    <Button onClick={() => handleEditStart(procedure)} variant="outline" className="w-full">
                      ✏️ Editar Procedimiento
                    </Button>
                  </>
                )}

                {procedure.procedureFileUrl && (
                  <Button onClick={() => procedure.procedureFileUrl && window.open(procedure.procedureFileUrl, "_blank")} variant="outline" className="w-full">
                    📄 Descargar Procedimiento
                  </Button>
                )}

                {procedure.flowchartFileUrl && (
                  <Button onClick={() => procedure.flowchartFileUrl && window.open(procedure.flowchartFileUrl, "_blank")} variant="outline" className="w-full">
                    📊 Descargar Flujograma
                  </Button>
                )}

                {procedureRecords[procedure.id] && procedureRecords[procedure.id].length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h4 className="font-semibold text-lg">Registros del Procedimiento</h4>
                    <div className="space-y-2">
                      {procedureRecords[procedure.id].map((record) => (
                        <Card key={record.id} className="p-3 bg-gray-50">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                              <p className="font-medium">{record.name}</p>
                              <p className="text-sm text-gray-600">Código: {record.code}</p>
                              <p className="text-sm text-gray-600">Versión: {record.version}</p>
                              {record.date && (
                                <p className="text-sm text-gray-600">Fecha: {record.date}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {record.fileUrl && (
                                <Button
                                  onClick={() => record.fileUrl && window.open(record.fileUrl, "_blank")}
                                  variant="outline"
                                  size="sm"
                                >
                                  📥 Descargar
                                </Button>
                              )}
                              {record.id && (
                                <>
                                  <Button
                                    onClick={() => handleEditRecord(record)}
                                    variant="outline"
                                    size="sm"
                                  >
                                    ✏️ Editar
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteRecord(record.id!)}
                                    variant="destructive"
                                    size="sm"
                                  >
                                    🗑️
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {editingRecordId && editingRecord && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-md border border-blue-200 space-y-3">
                    <h4 className="font-semibold text-lg">Editar Registro</h4>
                    <div className="grid grid-cols-4 gap-2">
                      <Input
                        placeholder="Nombre del Registro"
                        value={editingRecord.name}
                        onChange={(e) => setEditingRecord({ ...editingRecord, name: e.target.value })}
                      />
                      <Input
                        placeholder="Código"
                        value={editingRecord.code}
                        onChange={(e) => setEditingRecord({ ...editingRecord, code: e.target.value })}
                      />
                      <Input
                        placeholder="Versión"
                        value={editingRecord.version}
                        onChange={(e) => setEditingRecord({ ...editingRecord, version: e.target.value })}
                      />
                      <Input
                        type="date"
                        value={typeof editingRecord.date === 'string' ? editingRecord.date : ""}
                        onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveEditRecord} className="flex-1 bg-green-600 hover:bg-green-700">
                        💾 Guardar Cambios
                      </Button>
                      <Button
                        onClick={() => {
                          setEditingRecordId(null);
                          setEditingRecord(null);
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        ✕ Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {addingRecordToProcedureId === procedure.id && (
                  <div className="mt-6 p-4 bg-green-50 rounded-md border border-green-200 space-y-3">
                    <h4 className="font-semibold text-lg">Agregar Nuevo Registro</h4>
                    <div className="grid grid-cols-4 gap-2">
                      <Input
                        placeholder="Nombre del Registro"
                        value={newRecordData.name}
                        onChange={(e) => setNewRecordData({ ...newRecordData, name: e.target.value })}
                      />
                      <Input
                        placeholder="Código"
                        value={newRecordData.code}
                        onChange={(e) => setNewRecordData({ ...newRecordData, code: e.target.value })}
                      />
                      <Input
                        placeholder="Versión"
                        value={newRecordData.version}
                        onChange={(e) => setNewRecordData({ ...newRecordData, version: e.target.value })}
                      />
                      <Input
                        type="date"
                        value={typeof newRecordData.date === 'string' ? newRecordData.date : ""}
                        onChange={(e) => setNewRecordData({ ...newRecordData, date: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleAddNewRecord(procedure.id)} className="flex-1 bg-green-600 hover:bg-green-700">
                        ✅ Agregar Registro
                      </Button>
                      <Button
                        onClick={() => {
                          setAddingRecordToProcedureId(null);
                          setNewRecordData({ name: "", code: "", version: "", date: new Date().toISOString().split("T")[0] });
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        ✕ Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {addingRecordToProcedureId !== procedure.id && (procedureRecords[procedure.id] && procedureRecords[procedure.id].length > 0) && (
                  <div className="mt-4">
                    <Button
                      onClick={() => {
                        setAddingRecordToProcedureId(procedure.id);
                        setNewRecordData({ name: "", code: "", version: "", date: new Date().toISOString().split("T")[0] });
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      ➕ Agregar Nuevo Registro
                    </Button>
                  </div>
                )}

                {(!procedureRecords[procedure.id] || procedureRecords[procedure.id].length === 0) && addingRecordToProcedureId !== procedure.id && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <Button
                      onClick={() => {
                        setAddingRecordToProcedureId(procedure.id);
                        setNewRecordData({ name: "", code: "", version: "", date: new Date().toISOString().split("T")[0] });
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      ➕ Agregar Primer Registro
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
