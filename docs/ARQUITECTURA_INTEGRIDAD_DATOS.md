# Arquitectura de Integridad de Datos en SIGE

## Introducción

Este documento establece los patrones y mejores prácticas para garantizar la integridad de datos en la plataforma SIGE, basado en lecciones aprendidas de bugs reales.

---

## 1. Patrón: Unicidad de Registros (UNIQUE Constraints)

### Problema Identificado

En matrices de datos donde existe una **relación 1:1 entre dos entidades**, es crítico prevenir duplicados a nivel de base de datos.

**Caso Real:** Tabla `criticalityMatrix` permitía múltiples registros para la misma combinación de (processId, stakeholderId), causando:
- 2,551 registros duplicados
- Datos inconsistentes en reportes
- Lógica de actualización fallida

### Solución: UNIQUE Constraint

**Patrón a aplicar:**

```typescript
// ❌ MAL: Sin constraint
export const criticalityMatrix = mysqlTable("criticalityMatrix", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  actionToTake: text("actionToTake"),
  // ... otros campos
});

// ✅ BIEN: Con UNIQUE constraint
export const criticalityMatrix = mysqlTable("criticalityMatrix", {
  id: int("id").autoincrement().primaryKey(),
  processId: int("processId").notNull(),
  stakeholderId: int("stakeholderId").notNull(),
  actionToTake: text("actionToTake"),
  // ... otros campos
}, (table) => ({
  uniqueProcessStakeholder: unique().on(table.processId, table.stakeholderId),
}));
```

### Cuándo Aplicar

Aplica UNIQUE constraint cuando:
1. **Existe una relación 1:1** entre dos entidades (ej: un proceso tiene UNA criticidad por stakeholder)
2. **Los datos se actualizan frecuentemente** (ej: cambios en acciones, porcentajes)
3. **La deduplicación es manual** (ej: el usuario no debe crear duplicados)

### Tablas Candidatas en SIGE

| Tabla | Constraint Recomendado | Razón |
|-------|------------------------|-------|
| `criticalityMatrix` | `(processId, stakeholderId)` | ✅ Implementado |
| `riskMatrix` | `(processId, riskId)` | Verificar si existe 1:1 |
| `stakeholderCriticalities` | `(processId, stakeholderId)` | Verificar si existe 1:1 |
| `processIndicators` | `(processId, indicatorId)` | Verificar si existe 1:1 |
| `processResources` | `(processId, resourceId)` | Verificar si existe 1:1 |

---

## 2. Patrón: Preservación de ID en Frontend

### Problema Identificado

Cuando un componente frontend carga datos de la BD y luego permite editar, es crítico **preservar el ID original** para que las actualizaciones se dirijan al registro correcto.

**Caso Real:** `ProcessStakeholderCriticality.tsx` generaba un ID temporal al cargar datos:

```typescript
// ❌ MAL: Pierde el ID de la BD
const savedCriticality = criticalityByName.get(name);
return {
  id: generateUniqueId(),  // Nuevo ID temporal, pierde referencia a BD
  name,
  actionToTake: savedCriticality.actionToTake,
  // ...
};
```

Resultado: Cada edición creaba un nuevo registro en lugar de actualizar el existente.

### Solución: Preservar ID de BD

**Patrón a aplicar:**

```typescript
// ✅ BIEN: Preserva el ID de la BD
interface StakeholderCriticality {
  id: string;  // ID de la BD si existe, temporal si es nuevo
  dbId?: number;  // Guardar el ID numérico de la BD
  name: string;
  actionToTake: string;
  // ... otros campos
}

function mapCriticalityToUI(savedCriticality: CriticalityRecord): StakeholderCriticality {
  return {
    id: savedCriticality.id ? String(savedCriticality.id) : generateUniqueId(),
    dbId: savedCriticality.id,  // Guardar para usar en upsert
    name: savedCriticality.name,
    actionToTake: savedCriticality.actionToTake || "",
    // ...
  };
}

// Al guardar, pasar el ID
await upsertMutation.mutateAsync({
  id: item.dbId,  // Pasar el ID de la BD
  processId,
  stakeholderId,
  actionToTake: item.actionToTake,
  // ...
});
```

### Cuándo Aplicar

Aplica este patrón cuando:
1. **El componente carga datos de la BD** y permite editar
2. **Las ediciones deben actualizar registros existentes** (no crear nuevos)
3. **El autosave está habilitado** (cambios frecuentes)

### Checklist para Componentes de Edición

- [ ] ¿Carga datos de la BD? → Preservar ID
- [ ] ¿Permite editar? → Pasar ID al guardar
- [ ] ¿Usa autosave? → Validar que ID se mantiene
- [ ] ¿Tiene UNIQUE constraint en BD? → Verificar que se respeta

---

## 3. Patrón: Lógica de Upsert Correcta

### Problema Identificado

La lógica de upsert debe ser clara y predecible:

```typescript
// ❌ MAL: Búsqueda por múltiples campos, actualiza solo el primero
const existing = await db.select().from(table)
  .where(and(
    eq(table.processId, input.processId),
    eq(table.stakeholderId, input.stakeholderId)
  ));

if (existing.length > 0) {
  // Actualiza solo el primero, los otros quedan sin cambios
  await db.update(table).set(input).where(eq(table.id, existing[0].id));
}
```

### Solución: Upsert Explícito

**Patrón a aplicar:**

```typescript
// ✅ BIEN: Upsert explícito con ID
if (input.id) {
  // UPDATE: Actualizar por ID
  await db.update(table)
    .set(input)
    .where(eq(table.id, input.id));
} else {
  // INSERT: Crear nuevo registro
  // Nota: Si hay UNIQUE constraint, MySQL lanzará error si ya existe
  await db.insert(table).values(input);
}

// O usar onDuplicateKeyUpdate para MySQL:
await db.insert(table)
  .values(input)
  .onDuplicateKeyUpdate({
    set: {
      actionToTake: input.actionToTake,
      endDate: input.endDate,
      // ... campos a actualizar
    }
  });
```

### Ventajas

| Aspecto | Búsqueda + Update | Upsert Explícito |
|--------|------------------|-----------------|
| **Claridad** | Confuso | Claro |
| **Duplicados** | Posibles | Prevenidos por UNIQUE |
| **Performance** | 2 queries | 1 query |
| **Mantenibilidad** | Difícil | Fácil |

---

## 4. Caso de Estudio: Bug de Criticidad de Partes Interesadas

### Resumen del Problema

**Síntoma:** El Cronograma Consolidado mostraba 253 actividades duplicadas en lugar de ~30 únicas.

**Causa Raíz:** 3 fallos en cascada:
1. Frontend perdía el ID de la BD
2. BD no tenía UNIQUE constraint
3. Upsert actualizaba solo el primer duplicado

### Impacto

| Métrica | Antes | Después |
|---------|-------|---------|
| Registros en BD | 2,551 | 1,191 |
| Duplicados | 2,551 | 0 |
| Actividades en Cronograma | 253 | ~30 |
| Consistencia de Datos | ❌ Fallida | ✅ Garantizada |

### Correcciones Aplicadas

1. **Frontend:** Preservar ID de BD en `ProcessStakeholderCriticality.tsx`
2. **BD:** Agregar UNIQUE constraint en `criticalityMatrix`
3. **Limpieza:** Script para eliminar 1,460 duplicados históricos
4. **Tests:** Validar que UNIQUE constraint previene nuevos duplicados

### Validación

```bash
# Verificar que no hay duplicados
SELECT processId, stakeholderId, COUNT(*) as count
FROM criticalityMatrix
GROUP BY processId, stakeholderId
HAVING count > 1;

# Resultado esperado: 0 filas
```

---

## 5. Checklist de Integridad de Datos

### Para Nuevas Tablas

- [ ] ¿Existe una relación 1:1 entre dos campos? → Agregar UNIQUE constraint
- [ ] ¿Se actualizan frecuentemente? → Implementar upsert explícito
- [ ] ¿El frontend edita estos datos? → Preservar ID de BD
- [ ] ¿Hay datos históricos? → Crear script de limpieza
- [ ] ¿Hay tests? → Validar UNIQUE constraint

### Para Tablas Existentes

- [ ] Revisar si hay duplicados
- [ ] Agregar UNIQUE constraint si corresponde
- [ ] Actualizar componentes frontend para preservar ID
- [ ] Crear script de limpieza si hay datos históricos
- [ ] Agregar tests de integridad

---

## 6. Herramientas y Scripts

### Script de Limpieza de Duplicados

```bash
# Ubicación: scripts/cleanup-criticality-duplicates.mjs
# Uso: node scripts/cleanup-criticality-duplicates.mjs

# Función:
# 1. Identifica grupos de duplicados por (processId, stakeholderId)
# 2. Mantiene el registro más reciente
# 3. Elimina los duplicados
# 4. Agrega UNIQUE constraint
```

### Query para Detectar Duplicados

```sql
-- Detectar duplicados en cualquier tabla
SELECT 
  processId, 
  stakeholderId, 
  COUNT(*) as count,
  GROUP_CONCAT(id ORDER BY id) as ids
FROM criticalityMatrix
GROUP BY processId, stakeholderId
HAVING count > 1
ORDER BY count DESC;
```

---

## 7. Referencias

- **Documento de Análisis:** `TRAZABILIDAD_BUG_DUPLICACION.md`
- **Archivos Modificados:**
  - `client/src/pages/ProcessStakeholderCriticality.tsx`
  - `drizzle/schema.ts`
  - `server/routers/criticalityMatrix.ts`
- **Tests:** `server/__tests__/uniqueConstraintTest.test.ts`

---

## 8. Próximos Pasos

### Corto Plazo (1-2 semanas)
1. Aplicar UNIQUE constraint a `riskMatrix` y `stakeholderCriticalities`
2. Auditar componentes frontend para preservación de ID
3. Crear tests de integridad para todas las matrices

### Mediano Plazo (1 mes)
1. Implementar validación de integridad en CI/CD
2. Crear dashboard de "Data Quality" para monitorear duplicados
3. Documentar patrones en wiki interna

### Largo Plazo (3+ meses)
1. Migrar a arquitectura event-sourcing para auditoría completa
2. Implementar soft deletes para recuperación de datos
3. Crear sistema de reconciliación automática

---

**Última Actualización:** Abril 13, 2026  
**Autor:** Análisis Automatizado de Bugs  
**Estado:** ✅ Implementado y Validado
