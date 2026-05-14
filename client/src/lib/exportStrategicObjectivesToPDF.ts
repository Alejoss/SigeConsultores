import jsPDF from 'jspdf';

interface StrategicObjective {
  id: number;
  name: string;
  description?: string | null;
  target?: string | null;
  deadline?: string | null;
  responsible?: string | null;
}

export const exportStrategicObjectivesToPDF = (objectives: StrategicObjective[]) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    // Title
    doc.setFontSize(16);
    doc.setTextColor(25, 55, 109);
    doc.text('OBJETIVOS ESTRATÉGICOS', margin, yPosition);
    yPosition += 10;

    // Date
    const date = new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Fecha de generación: ${date}`, margin, yPosition);
    yPosition += 8;

    // Total objectives
    doc.setFontSize(10);
    doc.setTextColor(25, 55, 109);
    doc.text(`Total de Objetivos: ${objectives.length}`, margin, yPosition);
    yPosition += 10;

    // Objectives list
    objectives.forEach((objective, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Objective number and name
      doc.setFontSize(11);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(25, 55, 109);
      const objLines = doc.splitTextToSize(`${index + 1}. ${objective.name}`, maxWidth - 10);
      doc.text(objLines as string[], margin + 5, yPosition);
      yPosition += objLines.length * 5 + 2;

      // Description if available
      if (objective.description) {
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const descLines = doc.splitTextToSize(`Descripción: ${objective.description}`, maxWidth - 10);
        doc.text(descLines as string[], margin + 5, yPosition);
        yPosition += descLines.length * 4 + 2;
      }

      // Target if available
      if (objective.target) {
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const targetLines = doc.splitTextToSize(`Meta: ${objective.target}`, maxWidth - 10);
        doc.text(targetLines as string[], margin + 5, yPosition);
        yPosition += targetLines.length * 4 + 2;
      }

      // Deadline if available
      if (objective.deadline) {
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Fecha Límite: ${objective.deadline}`, margin + 5, yPosition);
        yPosition += 4 + 2;
      }

      // Responsible if available
      if (objective.responsible) {
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Responsable: ${objective.responsible}`, margin + 5, yPosition);
        yPosition += 4 + 2;
      }

      yPosition += 4;
    });

    // Save PDF
    doc.save('Objetivos_Estrategicos.pdf');
  } catch (error) {
    console.error('Error exporting strategic objectives to PDF:', error);
    throw error;
  }
};
