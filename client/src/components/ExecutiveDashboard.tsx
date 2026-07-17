import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Legend,
} from "recharts";

interface IndicatorElement {
  id: string;
  name: string;
  indicators: {
    id: string;
    name: string;
    value: number;
  }[];
}

interface ExecutiveDashboardProps {
  elements: IndicatorElement[];
  totalAverage: number;
  processName?: string;
  onClose: () => void;
}

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  indigo: "#6366f1",
  purple: "#a855f7",
  teal: "#14b8a6",
  gray: "#e5e7eb",
};

const INDICATOR_COLORS = [
  COLORS.blue,
  COLORS.indigo,
  COLORS.purple,
  COLORS.teal,
];

function getStatusColor(value: number): string {
  if (value >= 80) return COLORS.green;
  if (value >= 60) return COLORS.yellow;
  return COLORS.red;
}

function getStatusLabel(value: number): string {
  if (value >= 80) return "En Meta";
  if (value >= 60) return "Alerta";
  return "Crítico";
}

// Gauge component using RadialBarChart
function GaugeChart({ value, label }: { value: number; label: string }) {
  const color = getStatusColor(value);
  const data = [
    { name: label, value, fill: color },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="60%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={[{ value: 100, fill: COLORS.gray }, { value, fill: color }]}
            barSize={14}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-2xl font-bold" style={{ color }}>{value}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500 text-center mt-1 max-w-[120px]">{label}</span>
      <span
        className="text-xs font-semibold mt-1 px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {getStatusLabel(value)}
      </span>
    </div>
  );
}

// Donut chart for a single indicator
function DonutChart({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  const data = [
    { name: label, value },
    { name: "Restante", value: Math.max(0, 100 - value) },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={56}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={color} />
              <Cell fill={COLORS.gray} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-800">{value}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-600 text-center mt-2 max-w-[110px] leading-tight">
        {label}
      </span>
    </div>
  );
}

// Custom tooltip for bar chart
function CustomBarTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <p className="text-sm font-semibold text-gray-700 mb-1">{label}</p>
        <p className="text-lg font-bold" style={{ color: getStatusColor(value) }}>
          {value}%
        </p>
        <p className="text-xs text-gray-500">{getStatusLabel(value)}</p>
      </div>
    );
  }
  return null;
}

export default function ExecutiveDashboard({
  elements,
  totalAverage,
  processName,
  onClose,
}: ExecutiveDashboardProps) {
  // Flatten all indicators for bar chart
  const allIndicators = elements.flatMap((el, elIdx) =>
    el.indicators.map((ind) => ({
      name:
        ind.name.length > 28 ? ind.name.substring(0, 26) + "…" : ind.name,
      fullName: ind.name,
      group: el.name,
      value: ind.value,
      color: INDICATOR_COLORS[elIdx % INDICATOR_COLORS.length],
    }))
  );

  // Summary donut data (one per element, using first indicator as representative)
  const elementSummary = elements.map((el, idx) => {
    const avg =
      el.indicators.length > 0
        ? Math.round(
            el.indicators.reduce((s, i) => s + i.value, 0) /
              el.indicators.length
          )
        : 0;
    return {
      name: el.name,
      value: avg,
      color: INDICATOR_COLORS[idx % INDICATOR_COLORS.length],
    };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-t-2xl px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Vista Ejecutiva</h2>
            {processName && (
              <p className="text-blue-200 text-sm mt-0.5">{processName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl font-light leading-none transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-8 space-y-10">
          {/* Avance Total Gauge */}
          <div className="flex flex-col items-center">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Avance Total del Proceso
            </p>
            <div className="relative w-56 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="80%"
                  innerRadius="55%"
                  outerRadius="100%"
                  startAngle={180}
                  endAngle={0}
                  data={[
                    { value: 100, fill: COLORS.gray },
                    { value: totalAverage, fill: getStatusColor(totalAverage) },
                  ]}
                  barSize={18}
                >
                  <RadialBar dataKey="value" cornerRadius={8} background={false} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
                <span
                  className="text-4xl font-extrabold"
                  style={{ color: getStatusColor(totalAverage) }}
                >
                  {totalAverage}%
                </span>
                <span
                  className="text-sm font-semibold mt-1 px-3 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${getStatusColor(totalAverage)}22`,
                    color: getStatusColor(totalAverage),
                  }}
                >
                  {getStatusLabel(totalAverage)}
                </span>
              </div>
            </div>
          </div>

          {/* Donut charts per element */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5 text-center">
              Resumen por Área
            </p>
            <div className="flex flex-wrap justify-center gap-8">
              {elementSummary.map((el) => (
                <DonutChart
                  key={el.name}
                  value={el.value}
                  label={el.name}
                  color={el.color}
                />
              ))}
            </div>
          </div>

          {/* Bar chart — all indicators */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5 text-center">
              Detalle de Indicadores
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={allIndicators}
                margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomBarTooltip />} />
                {/* Reference lines for thresholds */}
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {allIndicators.map((entry, index) => (
                    <Cell key={index} fill={getStatusColor(entry.value)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex justify-center gap-6 mt-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS.green }} />
                En Meta (≥80%)
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS.yellow }} />
                Alerta (60–79%)
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS.red }} />
                Crítico (&lt;60%)
              </span>
            </div>
          </div>

          {/* Individual gauge per element */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5 text-center">
              Estado por Indicador
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              {elements.flatMap((el) =>
                el.indicators.map((ind) => (
                  <GaugeChart
                    key={`${el.id}-${ind.id}`}
                    value={ind.value}
                    label={ind.name}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 flex justify-end rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
