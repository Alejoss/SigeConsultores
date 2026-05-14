# Cálculos de Objetivos Tácticos - Resumen del PDF

## NIVEL 1: % Alcanzado en Objetivos Operativos
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

**Validación:**
- Si Condición Actual = Meta → 100%
- Si Condición Actual = Condición Inicial → 0%
- Si Condición Actual está entre ambos → 0% a 100%

---

## NIVEL 2: % de Meta Alcanzado en Objetivos Tácticos
**Fórmula:**
```
% de Meta Alcanzado = ((Avance de la Meta - Punto de Partida) / (Meta - Punto de Partida)) × 100
```

**Características:**
- Misma lógica que Nivel 1
- Aplicada al nivel de Objetivo Táctico
- El usuario ingresa "Avance de la Meta" en Planificación
- Se calcula automáticamente el porcentaje

**Ejemplo: Margen de contribución**
- Punto de Partida: 19.5%
- Meta: 25%
- Avance de la Meta: 22% (valor ingresado por usuario)
- % de Meta Alcanzado = ((22 - 19.5) / (25 - 19.5)) × 100 = 40.91%

---

## NIVEL 3: % Previsto y % Alcanzado (Indicadores Generales)
**Fórmula para % Previsto:**
```
% Previsto = SUMA(Ponderación de cada Objetivo Táctico)
```

**Fórmula para % Alcanzado:**
```
% Alcanzado = SUMA(Ponderación × % de Meta Alcanzado / 100)
```

**Ejemplo con 2 objetivos:**
- Objetivo 1: Ponderación 50%, % Alcanzado 40% → Contribución: 50 × 40 / 100 = 20%
- Objetivo 2: Ponderación 50%, % Alcanzado 60% → Contribución: 50 × 60 / 100 = 30%
- % Previsto = 50 + 50 = 100%
- % Alcanzado = 20 + 30 = 50%
- % Diferencia = 50 - 100 = -50%

---

## CAMBIOS REQUERIDOS

### a) Campo "Meta" → "Meta del Objetivo"
- **Ubicación:** Planificación de Objetivos Tácticos, bajo "Categoría"
- **Cambio de tipo:** Número → Texto
- **Exclusión de cálculos:** No se usa en % Previsto, % Alcanzado ni % Diferencia
- **Propósito:** Campo descriptivo/informativo solamente

### b) Validación de Cálculos
- **% Previsto:** Suma de ponderaciones (debe ser 100%)
- **% Alcanzado:** Suma ponderada de % de Meta Alcanzado
- **% Diferencia:** % Alcanzado - % Previsto
