import { describe, it, expect } from 'vitest';

describe('Stakeholder Update Logic', () => {
  it('should update existing stakeholders with new data from subprocess map', () => {
    // Simular datos existentes
    const existingStakeholders = [
      {
        id: '1',
        name: 'Área de Producción',
        internalExternal: 'Interno',
        needsSolicita: '',
        needsEntrega: '',
        existingDefenses: '',
      },
      {
        id: '2',
        name: 'Proveedores',
        internalExternal: 'Externo',
        needsSolicita: '',
        needsEntrega: '',
        existingDefenses: '',
      },
    ];

    // Simular datos nuevos del Mapa de Subprocesos
    const newStakeholders = [
      {
        id: '1',
        name: 'Área de Producción',
        internalExternal: 'Interno',
        needsSolicita: 'Materiales de calidad',
        needsEntrega: 'Productos terminados',
        existingDefenses: 'Control de calidad',
      },
      {
        id: '2',
        name: 'Proveedores',
        internalExternal: 'Externo',
        needsSolicita: 'Especificaciones claras',
        needsEntrega: 'Entregas a tiempo',
        existingDefenses: 'Contratos firmados',
      },
      {
        id: '3',
        name: 'Clientes',
        internalExternal: 'Externo',
        needsSolicita: 'Productos personalizados',
        needsEntrega: 'Entrega rápida',
        existingDefenses: 'Garantía',
      },
    ];

    // Aplicar la lógica de actualización
    const updatedStakeholders = existingStakeholders.map(existing => {
      const newData = newStakeholders.find(n => n.name === existing.name);
      if (newData) {
        return {
          ...existing,
          needsSolicita: newData.needsSolicita || existing.needsSolicita,
          needsEntrega: newData.needsEntrega || existing.needsEntrega,
          internalExternal: newData.internalExternal || existing.internalExternal,
          existingDefenses: newData.existingDefenses || existing.existingDefenses,
        };
      }
      return existing;
    });

    // Agregar nuevos asociados
    const existingNames = new Set(existingStakeholders.map(s => s.name));
    const newOnlyStakeholders = newStakeholders.filter(
      s => s.name && !existingNames.has(s.name)
    );

    const finalStakeholders = [...updatedStakeholders, ...newOnlyStakeholders];

    // Validaciones
    expect(finalStakeholders).toHaveLength(3);

    // Verificar que los existentes fueron actualizados
    const produccion = finalStakeholders.find(s => s.name === 'Área de Producción');
    expect(produccion?.needsSolicita).toBe('Materiales de calidad');
    expect(produccion?.needsEntrega).toBe('Productos terminados');
    expect(produccion?.existingDefenses).toBe('Control de calidad');

    const proveedores = finalStakeholders.find(s => s.name === 'Proveedores');
    expect(proveedores?.needsSolicita).toBe('Especificaciones claras');
    expect(proveedores?.needsEntrega).toBe('Entregas a tiempo');
    expect(proveedores?.existingDefenses).toBe('Contratos firmados');

    // Verificar que el nuevo asociado fue agregado
    const clientes = finalStakeholders.find(s => s.name === 'Clientes');
    expect(clientes).toBeDefined();
    expect(clientes?.needsSolicita).toBe('Productos personalizados');
    expect(clientes?.needsEntrega).toBe('Entrega rápida');
    expect(clientes?.existingDefenses).toBe('Garantía');
  });

  it('should handle empty solicita and entrega fields', () => {
    const existingStakeholders = [
      {
        id: '1',
        name: 'Área de Producción',
        internalExternal: 'Interno',
        needsSolicita: 'Datos previos',
        needsEntrega: 'Datos previos',
        existingDefenses: '',
      },
    ];

    const newStakeholders = [
      {
        id: '1',
        name: 'Área de Producción',
        internalExternal: 'Interno',
        needsSolicita: '',
        needsEntrega: '',
        existingDefenses: '',
      },
    ];

    const updatedStakeholders = existingStakeholders.map(existing => {
      const newData = newStakeholders.find(n => n.name === existing.name);
      if (newData) {
        return {
          ...existing,
          needsSolicita: newData.needsSolicita || existing.needsSolicita,
          needsEntrega: newData.needsEntrega || existing.needsEntrega,
          internalExternal: newData.internalExternal || existing.internalExternal,
          existingDefenses: newData.existingDefenses || existing.existingDefenses,
        };
      }
      return existing;
    });

    const produccion = updatedStakeholders[0];
    // Si los nuevos datos están vacíos, debe mantener los datos previos
    expect(produccion.needsSolicita).toBe('Datos previos');
    expect(produccion.needsEntrega).toBe('Datos previos');
  });

  it('should correctly count updated and new stakeholders', () => {
    const existingStakeholders = [
      { id: '1', name: 'Área 1', internalExternal: 'Interno', needsSolicita: '', needsEntrega: '', existingDefenses: '' },
      { id: '2', name: 'Área 2', internalExternal: 'Interno', needsSolicita: '', needsEntrega: '', existingDefenses: '' },
    ];

    const newStakeholders = [
      { id: '1', name: 'Área 1', internalExternal: 'Interno', needsSolicita: 'Nuevo', needsEntrega: 'Nuevo', existingDefenses: '' },
      { id: '3', name: 'Área 3', internalExternal: 'Externo', needsSolicita: 'Nuevo', needsEntrega: 'Nuevo', existingDefenses: '' },
      { id: '4', name: 'Área 4', internalExternal: 'Externo', needsSolicita: 'Nuevo', needsEntrega: 'Nuevo', existingDefenses: '' },
    ];

    const updatedStakeholders = existingStakeholders.map(existing => {
      const newData = newStakeholders.find(n => n.name === existing.name);
      if (newData) {
        return {
          ...existing,
          needsSolicita: newData.needsSolicita || existing.needsSolicita,
          needsEntrega: newData.needsEntrega || existing.needsEntrega,
          internalExternal: newData.internalExternal || existing.internalExternal,
          existingDefenses: newData.existingDefenses || existing.existingDefenses,
        };
      }
      return existing;
    });

    const existingNames = new Set(existingStakeholders.map(s => s.name));
    const newOnlyStakeholders = newStakeholders.filter(
      s => s.name && !existingNames.has(s.name)
    );

    const updatedCount = updatedStakeholders.filter(s => newStakeholders.some(n => n.name === s.name)).length;

    expect(updatedCount).toBe(1); // Solo Área 1 fue actualizada
    expect(newOnlyStakeholders).toHaveLength(2); // Área 3 y Área 4 son nuevas
  });
});
