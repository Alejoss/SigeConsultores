import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface Training {
  id: number;
  trainingName: string;
  objective?: string;
  type?: string;
  targetAudience?: string;
  plannedAttendees?: number;
  modality?: string;
  responsible?: string;
  isDelivered?: 'Si' | 'No';
  plannedDate?: string;
  deliveryDate?: string;
  actualAttendees?: number;
  isMandatory: boolean;
  isInternal: boolean;
  trainer?: string;
  month: number;
  year: number;
}

export default function Trainings() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [expandedTrainings, setExpandedTrainings] = useState<Set<number>>(new Set());
  
  // Form state for new training
  const [newTrainingName, setNewTrainingName] = useState("");
  const [newTrainingObjective, setNewTrainingObjective] = useState("");
  const [newTrainingType, setNewTrainingType] = useState("");
  const [newTrainingAudience, setNewTrainingAudience] = useState("");
  const [newTrainingPlannedAttendees, setNewTrainingPlannedAttendees] = useState("");
  const [newTrainingModality, setNewTrainingModality] = useState("");
  const [newTrainingResponsible, setNewTrainingResponsible] = useState("");
  const [newTrainingIsDelivered, setNewTrainingIsDelivered] = useState<'Si' | 'No'>('No');
  const [newTrainingPlannedDate, setNewTrainingPlannedDate] = useState("");
  const [newTrainingDeliveryDate, setNewTrainingDeliveryDate] = useState("");
  const [newTrainingActualAttendees, setNewTrainingActualAttendees] = useState("");
  const [newTrainingMandatory, setNewTrainingMandatory] = useState(false);
  const [newTrainingInternal, setNewTrainingInternal] = useState(true);
  const [newTrainingTrainer, setNewTrainingTrainer] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  const handleAddTraining = () => {
    if (!newTrainingName.trim()) return;
    setTrainings([
      ...trainings,
      {
        id: Date.now(),
        trainingName: newTrainingName,
        objective: newTrainingObjective,
        type: newTrainingType,
        targetAudience: newTrainingAudience,
        plannedAttendees: newTrainingPlannedAttendees ? parseInt(newTrainingPlannedAttendees) : undefined,
        modality: newTrainingModality,
        responsible: newTrainingResponsible,
        isDelivered: newTrainingIsDelivered,
        plannedDate: newTrainingPlannedDate,
        deliveryDate: newTrainingDeliveryDate,
        actualAttendees: newTrainingActualAttendees ? parseInt(newTrainingActualAttendees) : undefined,
        isMandatory: newTrainingMandatory,
        isInternal: newTrainingInternal,
        trainer: newTrainingTrainer,
        month: selectedMonth,
        year: selectedYear,
      },
    ]);
    
    // Reset form
    setNewTrainingName("");
    setNewTrainingObjective("");
    setNewTrainingType("");
    setNewTrainingAudience("");
    setNewTrainingPlannedAttendees("");
    setNewTrainingModality("");
    setNewTrainingResponsible("");
    setNewTrainingIsDelivered('No');
    setNewTrainingPlannedDate("");
    setNewTrainingDeliveryDate("");
    setNewTrainingActualAttendees("");
    setNewTrainingMandatory(false);
    setNewTrainingInternal(true);
    setNewTrainingTrainer("");
  };

  const handleDeleteTraining = (id: number) => {
    setTrainings(trainings.filter((t) => t.id !== id));
  };

  const toggleExpandedTraining = (id: number) => {
    const newExpanded = new Set(expandedTrainings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTrainings(newExpanded);
  };

  const totalTrainings = trainings.length;
  const deliveredTrainings = trainings.filter((t) => t.isDelivered === 'Si').length;
  const percentageDelivered = totalTrainings > 0 ? Math.round((deliveredTrainings / totalTrainings) * 100) : 0;
  const mandatoryCount = trainings.filter((t) => t.isMandatory).length;
  const internalCount = trainings.filter((t) => t.isInternal).length;

  if (!processId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">
              Por favor, selecciona un proceso desde el Mapa de Procesos
            </p>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/process-map")}
            >
              Volver al Mapa de Procesos
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Capacitaciones</h1>
          <p className="text-slate-600 mt-2">
            Gestiona el plan de capacitación del personal
          </p>
        </div>

        {/* Training Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Total Capacitaciones</p>
              <p className="text-3xl font-bold text-slate-900">{totalTrainings}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">% Impartidas</p>
              <p className="text-3xl font-bold text-green-600">{percentageDelivered}%</p>
              <p className="text-xs text-slate-500 mt-1">({deliveredTrainings}/{totalTrainings})</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Obligatorias</p>
              <p className="text-3xl font-bold text-red-900">{mandatoryCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">Internas</p>
              <p className="text-3xl font-bold text-blue-900">{internalCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Add New Training */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agregar Nueva Capacitación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Nombre de la capacitación..."
                value={newTrainingName}
                onChange={(e) => setNewTrainingName(e.target.value)}
              />
              <Input
                placeholder="Tipo de capacitación..."
                value={newTrainingType}
                onChange={(e) => setNewTrainingType(e.target.value)}
              />
              <Input
                placeholder="Público objetivo..."
                value={newTrainingAudience}
                onChange={(e) => setNewTrainingAudience(e.target.value)}
              />
              <Input
                placeholder="Número de asistentes planificado..."
                type="number"
                value={newTrainingPlannedAttendees}
                onChange={(e) => setNewTrainingPlannedAttendees(e.target.value)}
              />
              <Input
                placeholder="Modalidad (presencial, virtual, etc)..."
                value={newTrainingModality}
                onChange={(e) => setNewTrainingModality(e.target.value)}
              />
              <Input
                placeholder="Responsable..."
                value={newTrainingResponsible}
                onChange={(e) => setNewTrainingResponsible(e.target.value)}
              />
              <Input
                placeholder="Capacitador..."
                value={newTrainingTrainer}
                onChange={(e) => setNewTrainingTrainer(e.target.value)}
              />
              <Input
                placeholder="Fecha planificada..."
                type="date"
                value={newTrainingPlannedDate}
                onChange={(e) => setNewTrainingPlannedDate(e.target.value)}
              />
            </div>
            
            <Textarea
              placeholder="Objetivo de la capacitación..."
              value={newTrainingObjective}
              onChange={(e) => setNewTrainingObjective(e.target.value)}
              className="min-h-[80px]"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-semibold text-slate-600 block mb-2">Capacitación impartida</label>
                <select
                  value={newTrainingIsDelivered}
                  onChange={(e) => setNewTrainingIsDelivered(e.target.value as 'Si' | 'No')}
                  className={`w-full px-3 py-2 border rounded text-sm font-semibold ${
                    newTrainingIsDelivered === 'Si' 
                      ? 'bg-green-100 text-green-700 border-green-300' 
                      : 'bg-red-100 text-red-700 border-red-300'
                  }`}
                >
                  <option value="Si">Sí</option>
                  <option value="No">No</option>
                </select>
              </div>
              <Input
                placeholder="Fecha de impartición..."
                type="date"
                value={newTrainingDeliveryDate}
                onChange={(e) => setNewTrainingDeliveryDate(e.target.value)}
              />
              <Input
                placeholder="Número de asistentes real..."
                type="number"
                value={newTrainingActualAttendees}
                onChange={(e) => setNewTrainingActualAttendees(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newTrainingMandatory}
                  onChange={(e) => setNewTrainingMandatory(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Obligatoria</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newTrainingInternal}
                  onChange={(e) => setNewTrainingInternal(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Interna</span>
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border rounded text-sm"
              >
                {months.map((month, idx) => (
                  <option key={idx} value={idx + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border rounded text-sm"
              >
                {[2024, 2025, 2026, 2027].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            
            <Button
              onClick={handleAddTraining}
              disabled={!newTrainingName.trim()}
              className="w-full"
            >
              <Plus size={20} />
              Agregar Capacitación
            </Button>
          </CardContent>
        </Card>

        {/* Training List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Capacitaciones Registradas</CardTitle>
            <CardDescription>
              {totalTrainings > 0 ? `${totalTrainings} capacitación(es) registrada(s)` : 'No hay capacitaciones registradas'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trainings.length === 0 ? (
              <p className="text-center text-slate-600 py-6">
                No hay capacitaciones programadas aún
              </p>
            ) : (
              <div className="space-y-3">
                {trainings.map((training) => {
                  const isExpanded = expandedTrainings.has(training.id);
                  
                  return (
                    <Card key={training.id} className="border">
                      {/* Header colapsable */}
                      <CardHeader
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleExpandedTraining(training.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-900">
                                {training.trainingName}
                              </h3>
                              {training.isMandatory && (
                                <span className="px-2 py-1 bg-red-100 text-red-900 text-xs rounded font-medium">
                                  Obligatoria
                                </span>
                              )}
                              {training.isInternal && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-900 text-xs rounded font-medium">
                                  Interna
                                </span>
                              )}
                              <span className={`px-2 py-1 text-xs rounded font-medium ${
                                training.isDelivered === 'Si'
                                  ? 'bg-green-100 text-green-900'
                                  : 'bg-yellow-100 text-yellow-900'
                              }`}>
                                {training.isDelivered === 'Si' ? '✓ Impartida' : '✗ Pendiente'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTraining(training.id);
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </Button>
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </div>
                        </div>
                      </CardHeader>

                      {/* Expanded content */}
                      {isExpanded && (
                        <CardContent className="space-y-4 border-t pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {training.objective && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Objetivo</p>
                                <p className="text-sm text-slate-900">{training.objective}</p>
                              </div>
                            )}
                            {training.type && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Tipo</p>
                                <p className="text-sm text-slate-900">{training.type}</p>
                              </div>
                            )}
                            {training.targetAudience && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Destinatario</p>
                                <p className="text-sm text-slate-900">{training.targetAudience}</p>
                              </div>
                            )}
                            {training.plannedAttendees && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Número de Asistentes Planificado</p>
                                <p className="text-sm text-slate-900">{training.plannedAttendees}</p>
                              </div>
                            )}
                            {training.modality && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Modalidad</p>
                                <p className="text-sm text-slate-900">{training.modality}</p>
                              </div>
                            )}
                            {training.responsible && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Responsable</p>
                                <p className="text-sm text-slate-900">{training.responsible}</p>
                              </div>
                            )}
                            {training.plannedDate && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Fecha Planificada</p>
                                <p className="text-sm text-slate-900">{training.plannedDate}</p>
                              </div>
                            )}
                            {training.isDelivered && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Capacitación Impartida</p>
                                <p className={`text-sm font-semibold ${
                                  training.isDelivered === 'Si' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {training.isDelivered}
                                </p>
                              </div>
                            )}
                            {training.deliveryDate && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Fecha de Impartición</p>
                                <p className="text-sm text-slate-900">{training.deliveryDate}</p>
                              </div>
                            )}
                            {training.actualAttendees && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Número de Asistentes Real</p>
                                <p className="text-sm text-slate-900">{training.actualAttendees}</p>
                              </div>
                            )}
                            {training.trainer && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600">Capacitador</p>
                                <p className="text-sm text-slate-900">{training.trainer}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setLocation("/process-characterization")}
            className="flex-1"
          >
            Volver a Caracterización
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
