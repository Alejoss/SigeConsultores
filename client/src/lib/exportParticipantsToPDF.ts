import jsPDF from 'jspdf';

interface Participant {
  id: number;
  nombre: string;
  cargo: string;
  objetivo: string;
  responsabilidad: string;
  autoridad: string;
}

export const exportParticipantsToPDF = (participants: Participant[], processName: string) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;
    const MIN_SPACE_FOR_PARTICIPANT = 80; // Espacio mínimo requerido para un participante

    const addTextWithLineBreaks = (text: string, x: number, y: number, maxW: number, fontSize: number = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines as string[], x, y);
      return y + (lines.length * 5) + 5;
    };

    // Función para calcular el espacio que ocupará un bloque de texto
    const calculateTextHeight = (text: string, maxW: number, fontSize: number = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxW);
      return (lines.length * 5) + 5;
    };

    // Title
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text('PARTICIPANTES DEL PROCESO', margin, yPosition);
    yPosition += 10;

    // Company and Process Info
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 11);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Total de Participantes: ${participants.length}`, margin, yPosition, maxWidth, 10);
    yPosition += 8;

    if (participants.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.text('No hay participantes registrados', margin, yPosition);
      const fileName = `Participantes_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      return true;
    }

    // Render each participant
    participants.forEach((participant, idx) => {
      // Calcular el espacio total que necesitará este participante
      const titleHeight = 8;
      const cargoHeight = calculateTextHeight(`Cargo: ${participant.cargo || '(vacío)'}`, maxWidth - 5, 10);
      const objetivoLabelHeight = 5;
      const objetivoHeight = calculateTextHeight((participant.objetivo || '(vacío)') as string, maxWidth - 10, 9);
      const responsabilidadLabelHeight = 5;
      const responsabilidadHeight = calculateTextHeight((participant.responsabilidad || '(vacío)') as string, maxWidth - 10, 9);
      const autoridadLabelHeight = 5;
      const autoridadHeight = calculateTextHeight((participant.autoridad || '(vacío)') as string, maxWidth - 10, 9);
      const spacingAfter = 8;

      const totalHeight = titleHeight + cargoHeight + objetivoLabelHeight + objetivoHeight + 
                         responsabilidadLabelHeight + responsabilidadHeight + 
                         autoridadLabelHeight + autoridadHeight + spacingAfter;

      // Verificar si hay espacio suficiente, si no, agregar nueva página
      // Dejar 40 puntos de margen al final de la página
      if (yPosition + totalHeight > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Participant header
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      (doc.setFont as any)(undefined, 'bold');
      yPosition = addTextWithLineBreaks(`${idx + 1}. ${participant.nombre}`, margin, yPosition, maxWidth, 12);
      (doc.setFont as any)(undefined, 'normal');

      // Cargo
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      yPosition = addTextWithLineBreaks(`Cargo: ${participant.cargo || '(vacío)'}`, margin + 5, yPosition, maxWidth - 5, 10);

      // Objetivo
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      (doc.setFont as any)(undefined, 'bold');
      yPosition = addTextWithLineBreaks('Objetivo del Puesto:' as string, margin + 5, yPosition, maxWidth - 5, 9);
      (doc.setFont as any)(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      yPosition = addTextWithLineBreaks((participant.objetivo || '(vacío)') as string, margin + 10, yPosition, maxWidth - 10, 9);

      // Responsabilidad
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      (doc.setFont as any)(undefined, 'bold');
      yPosition = addTextWithLineBreaks('Responsabilidad:' as string, margin + 5, yPosition, maxWidth - 5, 9);
      (doc.setFont as any)(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      yPosition = addTextWithLineBreaks((participant.responsabilidad || '(vacío)') as string, margin + 10, yPosition, maxWidth - 10, 9);

      // Autoridad
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      (doc.setFont as any)(undefined, 'bold');
      yPosition = addTextWithLineBreaks('Autoridad:' as string, margin + 5, yPosition, maxWidth - 5, 9);
      (doc.setFont as any)(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      yPosition = addTextWithLineBreaks((participant.autoridad || '(vacío)') as string, margin + 10, yPosition, maxWidth - 10, 9);

      yPosition += 8;
    });

    // Save PDF
    const fileName = `Participantes_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
