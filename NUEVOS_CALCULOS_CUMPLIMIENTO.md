# Nuevo Sistema de Cálculo de Cumplimiento de Objetivos Tácticos

## Cambio Principal
**Del viejo sistema:** Cumplimiento basado en tareas completadas
**Al nuevo sistema:** Cumplimiento basado en indicadores reales (Avance de Meta)

## Tres Niveles Jerárquicos de Cálculo

### Nivel 1: % Alcanzado en Objetivos Operativos
**Fórmula:**
```
% Alcanzado = ((Condición Actual - Condición Inicial) / (Meta - Condición Inicial)) × 100
```

**Características:**
- Funciona para aumentos y disminuciones
- Rango: -100% a +100%
- Permite valores >100% (si se supera la meta)
- Permite valores <0% (si va en dirección opuesta)

**Ejemplo 1: Disminuir horas extras (9000 → 6750)**
- Condición Inicial: 9000 horas
- Meta: 6750 horas
- Condición Actual: 8000 horas (después de 1 mes)
- % Alcanzado = ((8000 - 9000) / (6750 - 9000)) × 100 = 44.44%

**Ejemplo 2: Aumentar margen de contribución (19.5% → 25%)**
- Condición Inicial: 19.5%
- Meta: 25%
- Condición Actual: 21.5% (después de 2 meses)
- % Alcanzado = ((21.5 - 19.5) / (25 - 19.5)) × 100 = 36.36%

### Nivel 2: % de Meta Alcanzado en Objetivos Tácticos
**Fórmula:**
```
% de Meta Alcanzado = ((Avance de la Meta - Punto de Partida) / (Meta - Punto de Partida)) × 100
```

**Características:**
- Misma lógica que Nivel 1
- Aplicada al nivel de Objetivo Táctico
- El usuario ingresa "Avance de la Meta" en Planificación
- Se calcula automáticamente el porcentaje

**Ejemplo:**
- Punto de Partida: 19.5%
- Meta: 25%
- Avance de la Meta: 22% (valor ingresado por usuario)
- % de Meta Alcanzado = ((22 - 19.5) / (25 - 19.5)) × 100 = 40.91%

### Nivel 3: % Previsto, % Alcanzado, % Diferencia
**Fórmulas:**
```
% Previsto = SUMA(Ponderación de cada Objetivo Táctico)
% Alcanzado = SUMA(Ponderación × % de Meta Alcanzado / 100)
% Diferencia = % Alcanzado - % Previsto
```

**Ejemplo:**
- Objetivo 1: Ponderación 45%, % Meta Alcanzado 40% → Contribución: 18%
- Objetivo 2: Ponderación 55%, % Meta Alcanzado 50% → Contribución: 27.5%
- % Previsto = 45% + 55% = 100%
- % Alcanzado = 18% + 27.5% = 45.5%
- % Diferencia = 45.5% - 100% = -54.5%

## Validación
- Si Condición Actual = Meta → 100%
- Si Condición Actual = Condición Inicial → 0%
- Si Condición Actual está entre ambos → 0% a 100%

## Cambios en el Código
1. **Remover:** Cálculo basado en tareas completadas
2. **Agregar:** Cálculo basado en "Avance de la Meta" (campo que ya existe en Planificación)
3. **Actualizar:** Fórmulas en TacticalPlanning.tsx para usar los nuevos indicadores
4. **Preservar:** Todos los datos existentes (no borrar información)
