# Análisis de Trazabilidad Completa: Bug de Duplicación en Criticidad de Partes Interesadas

## Resumen Ejecutivo

El bug de duplicación (2,551 registros duplicados) en la migración de "Criticidad Partes Interesadas" hacia "Cronograma Consolidado" tiene **3 causas raíz**:

1. **Pérdida del ID de la BD en el frontend** (línea 387 de ProcessStakeholderCriticality.tsx)
2. **Falta de UNIQUE constraint en la tabla `criticalityMatrix`**
3. **Lógica de upsert incompleta en el router** (solo actualiza el primer duplicado)

---

## 1. FLUJO DE DATOS COMPLETO

### 1.1 Carga de Datos (Lectura)

```
Usuario abre "Criticidad Partes Interesadas"
  ↓
ProcessStakeholderCriticality.tsx (línea 115)
  → Query: trpc.criticalityMatrix.getWithStakeholders({ processId })
  ↓
server/routers/criticalityMatrix.ts (línea 35-50)
  → SELECT * FROM criticalityMatrix
    LEFT JOIN stakeholders ON criticalityMatrix.stakeholderId = stakeholders.id
    WHERE processId = ?
  ↓
Retorna: Array de CriticalityEntry con TODOS los campos incluyendo ID
  [
    { id: 1, processId: 123, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... },
    { id: 2, processId: 123, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... },  // DUPLICADO
    { id: 3, processId: 123, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... },  // DUPLICADO
    ...
  ]
  ↓
ProcessStakeholderCriticality.tsx (línea 309-316)
  → Mapea criticalityDataFromDb a criticalityByName
  → criticalityByName.set(stakeholderName, crit)  // Guarda SOLO el PRIMERO
  ↓
ProcessStakeholderCriticality.tsx (línea 354-404)
  → savedCriticality = criticalityByName.get(name)  // Obtiene el primer registro
  → ❌ PROBLEMA: Genera nuevo ID temporal (línea 387)
  → return { id: generateUniqueId(), ...savedCriticality }  // PIERDE el ID de la BD
  ↓
Estado React: data.stakeholders[]
  [
    { id: "temp-12345", name: "Stakeholder 1", actionToTake: "Acción 1", ... }
  ]
```

### 1.2 Guardado de Datos (Escritura)

```
Usuario edita "Acciones y Seguimiento" (actionToTake, endDate)
  ↓
ProcessStakeholderCriticality.tsx (línea 230-258)
  → useEffect detecta cambio en data
  → Dispara autosave después de 1.5 segundos
  ↓
handleSave() (línea 476-488)
  → Para cada stakeholder:
    await upsertCriticalityMutation.mutateAsync({
      processId: 123,
      stakeholderId: 45,
      actionToTake: "Acción 1 (editada)",
      endDate: "2026-04-30",
      ... otros campos ...
      // ❌ PROBLEMA: NO PASA ID
    })
  ↓
server/routers/criticalityMatrix.ts (línea 69-150)
  → upsert mutation recibe input SIN id
  → if (input.id) → FALSE, va a else
  → Busca registros existentes (línea 103-107):
    SELECT * FROM criticalityMatrix
    WHERE processId = 123 AND stakeholderId = 45
  → Encuentra 3 registros (los duplicados):
    [
      { id: 1, processId: 123, stakeholderId: 45, ... },
      { id: 2, processId: 123, stakeholderId: 45, ... },
      { id: 3, processId: 123, stakeholderId: 45, ... }
    ]
  → if (existingRecords.length > 0) → TRUE
  → Actualiza SOLO el primero (línea 113-140):
    UPDATE criticalityMatrix SET ... WHERE id = 1
  → Los otros 2 quedan sin actualizar
  ↓
Resultado: 3 registros en la BD, solo 1 actualizado, 2 quedan con datos viejos
```

### 1.3 Migración a Cronograma Consolidado (Lectura)

```
Usuario abre "Cronograma Consolidado"
  ↓
ConsolidatedSchedule.tsx
  → Query: trpc.consolidatedSchedule.getConsolidatedSchedule({ processId })
  ↓
server/routers/consolidatedSchedule.ts (línea 83-123)
  → SELECT * FROM criticalityMatrix WHERE processId = 123 AND actionToTake IS NOT NULL
  ↓
Retorna: 3 registros (todos con la misma acción)
  [
    { id: 1, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... },
    { id: 2, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... },  // DUPLICADO
    { id: 3, stakeholderId: 45, actionToTake: "Acción 1", endDate: "2026-04-30", ... }   // DUPLICADO
  ]
  ↓
Deduplicación (línea 113-127)
  → Intenta deduplicar por (stakeholderId, normalizedAction)
  → Pero la lógica no funciona correctamente
  → Retorna 3 registros en lugar de 1
  ↓
Resultado: Cronograma Consolidado muestra 3 actividades idénticas en abril
```

---

## 2. IDENTIFICACIÓN DE LAS 3 CAUSAS RAÍZ

### Causa Raíz #1: Pérdida del ID en el Frontend

**Archivo:** `client/src/pages/ProcessStakeholderCriticality.tsx`

**Línea 387:**
```typescript
return {
  id: generateUniqueId(),  // ❌ PROBLEMA: Genera ID temporal, pierde ID de BD
  name,
  internalExternal,
  // ... otros campos ...
  actionToTake: savedCriticality.actionToTake || "",
  // ...
};
```

**Impacto:** El componente no sabe qué registro de la BD está editando, así que siempre crea uno nuevo.

**Solución:**
```typescript
// Preservar el ID de la BD si existe
const dbId = savedCriticality?.id;  // Obtener ID de la BD

return {
  id: dbId ? String(dbId) : generateUniqueId(),  // Usar ID de BD si existe
  name,
  // ...
};
```

---

### Causa Raíz #2: Falta de UNIQUE Constraint en la BD

**Archivo:** `drizzle/schema.ts`

**Línea 217-233:**
```typescript
export const criticalityMatrix = mysqlTable("criticalityMatrix", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  // ... otros campos ...
  // ❌ PROBLEMA: NO HAY UNIQUE CONSTRAINT
  // Permite múltiples filas con el mismo (processId, stakeholderId)
});
```

**Impacto:** La BD permite crear múltiples registros para la misma combinación de (processId, stakeholderId).

**Solución:**
```typescript
export const criticalityMatrix = mysqlTable("criticalityMatrix", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  // ... otros campos ...
}, (table) => ({
  uniqueProcessStakeholder: unique().on(table.processId, table.stakeholderId),
}));
```

---

### Causa Raíz #3: Lógica de Upsert Incompleta

**Archivo:** `server/routers/criticalityMatrix.ts`

**Línea 100-150:**
```typescript
} else {
  // UPSERT: Check if record already exists for this stakeholder
  const existingRecords = await db.select().from(criticalityMatrix)
    .where(and(
      eq(criticalityMatrix.processId, input.processId),
      eq(criticalityMatrix.stakeholderId, input.stakeholderId)
    ));

  if (existingRecords.length > 0) {
    // ❌ PROBLEMA: Solo actualiza el PRIMERO
    const existingRecord = existingRecords[0];
    // UPDATE ...
  } else {
    // Crea uno nuevo
  }
}
```

**Impacto:** Si hay múltiples registros duplicados, solo actualiza el primero. Los otros quedan sin cambios.

**Solución:**
- Pasar el `id` desde el frontend
- Usar UPDATE directo por ID en lugar de búsqueda por (processId, stakeholderId)
- Agregar UNIQUE constraint para prevenir nuevos duplicados

---

## 3. TABLA COMPARATIVA: ANTES vs DESPUÉS

| Aspecto | ANTES (Buggy) | DESPUÉS (Corregido) |
|--------|---------------|-------------------|
| **ID en Frontend** | Temporal (`generateUniqueId()`) | ID de la BD si existe |
| **Llamada a upsert()** | Sin ID | Con ID cuando existe |
| **Búsqueda en BD** | Por (processId, stakeholderId) | Por ID directo |
| **UNIQUE Constraint** | No existe | Existe en (processId, stakeholderId) |
| **Duplicados** | 2,551 registros | 0 registros |
| **Registros en Cronograma** | 253 (duplicados) | ~30 (únicos) |

---

## 4. PLAN DE CORRECCIÓN

### Paso 1: Preservar ID en Frontend
- Modificar `StakeholderCriticality` interface para incluir `dbId?: number`
- Cambiar línea 387 para usar `dbId` si existe
- Pasar `id` a `upsertCriticalityMutation.mutateAsync()`

### Paso 2: Agregar UNIQUE Constraint
- Modificar schema en `drizzle/schema.ts`
- Ejecutar `pnpm db:push` para migrar

### Paso 3: Limpiar Duplicados Existentes
- Crear script que consolide duplicados
- Mantener el registro más reciente (por `updatedAt`)
- Eliminar los otros

### Paso 4: Verificar
- Comprobar que no hay más duplicados
- Verificar que Cronograma Consolidado muestra datos correctos
- Ejecutar tests

---

## 5. DATOS ESPERADOS (POST-CORRECCIÓN)

Para el proceso "Postcosecha La Esperanza":

**Antes (Buggy):**
- Abril: 2 actividades (debería ser 3)
- Mayo: 1 actividad (debería ser 0)
- Junio: 6 actividades (debería ser 0)
- Total: 253 registros (debería ser ~30)

**Después (Corregido):**
- Abril: 3 actividades ✓
- Mayo: 0 actividades ✓
- Junio: 0 actividades ✓
- Total: ~30 registros ✓

---

## 6. ARCHIVOS A MODIFICAR

1. `client/src/pages/ProcessStakeholderCriticality.tsx` (línea 28-46, 354-404, 476-488)
2. `drizzle/schema.ts` (línea 217-233)
3. `server/routers/criticalityMatrix.ts` (línea 69-150)
4. Script de limpieza: `scripts/cleanup-criticality-duplicates.mjs` (NUEVO)

---

## 7. VALIDACIÓN

Tests a ejecutar:
- ✅ Cargar criticidad y verificar que se preserva el ID
- ✅ Editar acción y verificar que actualiza el registro existente
- ✅ Verificar que no se crean nuevos duplicados
- ✅ Verificar que Cronograma Consolidado muestra datos correctos
- ✅ Verificar que UNIQUE constraint previene duplicados

