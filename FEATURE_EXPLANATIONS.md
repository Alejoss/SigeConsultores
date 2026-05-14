# Explicación Detallada de Mejoras Sugeridas para SIGE

## 1. Envío Automático de Invitaciones por Email (SES Integration)

### ¿Qué es?
Integrar Amazon SES (Simple Email Service) para enviar automáticamente confirmaciones por email cuando Javier (o cualquier Manager) crea invitaciones para Dueños de Proceso.

### Situación Actual
- Cuando Javier crea una invitación para un Dueño de Proceso, la invitación se guarda en la BD
- El Dueño de Proceso recibe un enlace de aceptación, pero **no hay notificación por email**
- El Dueño debe estar atento a la plataforma para saber que tiene una invitación pendiente

### Mejora Propuesta
1. **Cuando Javier crea una invitación:**
   - Se envía automáticamente un email al Dueño de Proceso con:
     - Asunto: "Invitación para ser Dueño de Proceso en Lalita S.A."
     - Cuerpo: Explicación de su rol + enlace directo para aceptar
     - Botón CTA: "Aceptar Invitación"

2. **Beneficios:**
   - ✅ El Dueño se entera inmediatamente de su invitación
   - ✅ Aumenta la probabilidad de que acepte (no se olvida)
   - ✅ Profesional y formal
   - ✅ Reduce fricción en el onboarding

3. **Implementación Técnica:**
   - Usar AWS SES (ya está disponible en la plataforma Manus)
   - Crear una función en `server/_core/email.ts` para enviar emails
   - Llamarla desde el router cuando se crea la invitación
   - Usar un template HTML profesional para el email

4. **Ejemplo de Flujo:**
   ```
   Javier crea invitación → Sistema guarda en BD → 
   Sistema envía email a Dueño → Dueño recibe email →
   Dueño hace clic en enlace → Acepta invitación → 
   Dueño accede a su proceso
   ```

---

## 2. Dashboard de Métricas para Admin

### ¿Qué es?
Un panel visual que muestre estadísticas clave de la plataforma: cuántos usuarios hay, cuántos procesos, actividad reciente, etc.

### Situación Actual
- Esteban (Admin) solo ve un listado de empresas
- No hay visibilidad sobre:
  - Cuántos usuarios activos hay
  - Cuántos procesos están siendo gestionados
  - Qué empresas son más activas
  - Cuántos módulos están completados

### Mejora Propuesta
Un dashboard con tarjetas mostrando:

1. **Estadísticas Generales:**
   - Total de empresas: 4
   - Total de usuarios: 12
   - Total de procesos: 45
   - Módulos completados: 78%

2. **Gráficos:**
   - Procesos por empresa (gráfico de barras)
   - Usuarios por rol (gráfico de pastel: Admin, Manager, Process Owner)
   - Actividad en los últimos 30 días (gráfico de línea)
   - Módulos completados por empresa (progreso)

3. **Tabla de Actividad Reciente:**
   - Últimos 10 eventos: "Javier creó invitación para Dolores", "Dolores aceptó invitación", etc.

4. **Beneficios:**
   - ✅ Esteban ve de un vistazo la salud de la plataforma
   - ✅ Identifica empresas que necesitan apoyo
   - ✅ Monitorea adopción de usuarios
   - ✅ Datos para reportes ejecutivos

5. **Implementación Técnica:**
   - Crear nuevos procedimientos tRPC que calculen estadísticas
   - Usar Plotly o Chart.js para gráficos
   - Guardar eventos en tabla `auditLog` (ya existe)
   - Mostrar en nueva página `/admin-metrics`

6. **Ejemplo de Datos:**
   ```
   Empresa: Lalita S.A.
   - Usuarios: 3 (1 Manager, 2 Process Owners)
   - Procesos: 8
   - Módulos completados: 5/9 (56%)
   - Última actividad: Hace 2 horas
   ```

---

## 3. Exportar Procesos a PDF

### ¿Qué es?
Permitir que los usuarios descarguen la caracterización completa de un proceso en formato PDF para impresión o archivo.

### Situación Actual
- La caracterización del proceso está en la plataforma (online)
- No hay forma de descargar o imprimir
- Si necesitan compartir con terceros, deben hacer screenshots

### Mejora Propuesta
Un botón "Descargar PDF" en la página de Caracterización del Proceso que genere un PDF con:

1. **Contenido del PDF:**
   - Encabezado: Logo de la empresa + nombre del proceso
   - Sección 1: Información básica
     - Nombre del proceso
     - Tipo (Estratégico, Misional, Soporte)
     - Macro proceso
     - Descripción
   
   - Sección 2: Participantes
     - Tabla con: Nombre, Rol, Responsabilidad
   
   - Sección 3: Recursos
     - Tabla con: Recurso, Tipo, Cantidad
   
   - Sección 4: Mapa de Subprocesos
     - Tabla con: Entrada, Subprocesos, Salida
   
   - Sección 5: Matriz de Criticidad
     - Tabla con: Asociado, Necesidades, Defensas
   
   - Sección 6: FODA
     - Fortalezas, Oportunidades, Debilidades, Amenazas
   
   - Sección 7: Matriz de Riesgos
     - Tabla con: Riesgo, Probabilidad, Impacto, Controles
   
   - Pie de página: Fecha de generación, empresa, versión

2. **Beneficios:**
   - ✅ Documentación formal del proceso
   - ✅ Facilita auditorías
   - ✅ Permite compartir con stakeholders externos
   - ✅ Archivo permanente para referencia
   - ✅ Cumple requisitos de ISO 9001

3. **Implementación Técnica:**
   - Usar librería `pdfkit` o `weasyprint` (ya disponible)
   - Crear función en servidor que genere PDF
   - Endpoint tRPC que retorne el PDF
   - Botón en UI que descargue el archivo

4. **Ejemplo de Flujo:**
   ```
   Usuario abre Caracterización del Proceso →
   Hace clic en "Descargar PDF" →
   Sistema recopila todos los datos →
   Genera PDF con formato profesional →
   Descarga archivo: "Proceso_Diseño_2026-02-07.pdf"
   ```

5. **Estructura del PDF:**
   ```
   ┌─────────────────────────────────┐
   │  LOGO    Lalita S.A.            │
   │  PROCESO: Diseño de Productos   │
   ├─────────────────────────────────┤
   │ 1. INFORMACIÓN BÁSICA           │
   │    - Tipo: Misional             │
   │    - Macro: Producción          │
   ├─────────────────────────────────┤
   │ 2. PARTICIPANTES                │
   │    [Tabla de personas]          │
   ├─────────────────────────────────┤
   │ 3. RECURSOS                     │
   │    [Tabla de recursos]          │
   ├─────────────────────────────────┤
   │ ... más secciones ...           │
   ├─────────────────────────────────┤
   │ Generado: 07/02/2026            │
   │ Versión: 1.0                    │
   └─────────────────────────────────┘
   ```

---

## Comparación de Impacto

| Mejora | Complejidad | Impacto | Tiempo Estimado |
|--------|-------------|--------|-----------------|
| **Emails SES** | Media | Alto (UX) | 4-6 horas |
| **Dashboard Métricas** | Alta | Alto (Negocio) | 8-12 horas |
| **Exportar PDF** | Media | Alto (Funcionalidad) | 6-8 horas |

---

## Recomendación de Prioridad

1. **Primero: Emails SES** ← Rápido, alto impacto en UX
2. **Segundo: Exportar PDF** ← Funcionalidad muy solicitada
3. **Tercero: Dashboard Métricas** ← Más complejo pero muy valioso

---

## Preguntas para Esteban

1. ¿Cuál de estas tres mejoras es más importante para tu negocio?
2. ¿Necesitas más estadísticas en el dashboard?
3. ¿El PDF debe incluir firmas digitales?
4. ¿Quieres que los emails tengan un template personalizado por empresa?
