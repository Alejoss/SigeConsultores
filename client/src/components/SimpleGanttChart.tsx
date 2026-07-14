import React, { useMemo, useRef, useState } from "react";

export interface SimpleGanttActivity {
  id: string;
  label: string;
  badge: string;
  badgeColor: string;
  dueDate: Date;
  completed: boolean;
}

interface SimpleGanttChartProps {
  activities: SimpleGanttActivity[];
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "Mayo", "Jun", "Jul", "Agos", "Sep", "Oct", "Nov", "Dic"];

const BADGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "OTE":                            { bg: "bg-yellow-100",  text: "text-yellow-800",  dot: "#ca8a04" },
  "Gestión con Partes Interesadas": { bg: "bg-blue-100",    text: "text-blue-800",    dot: "#2563eb" },
  "Cumplimientos":                  { bg: "bg-pink-100",    text: "text-pink-800",    dot: "#db2777" },
  "Fortaleza":                      { bg: "bg-green-100",   text: "text-green-800",   dot: "#16a34a" },
  "Oportunidad":                    { bg: "bg-orange-100",  text: "text-orange-800",  dot: "#ea580c" },
  "Debilidad":                      { bg: "bg-red-100",     text: "text-red-800",     dot: "#dc2626" },
  "Amenaza":                        { bg: "bg-purple-100",  text: "text-purple-800",  dot: "#7c3aed" },
};

function getBadgeStyle(badge: string) {
  return BADGE_COLORS[badge] ?? { bg: "bg-gray-100", text: "text-gray-700", dot: "#6b7280" };
}

export const SimpleGanttChart: React.FC<SimpleGanttChartProps> = ({ activities }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; activity: SimpleGanttActivity } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine year range from activities
  const years = useMemo(() => {
    if (activities.length === 0) return [new Date().getFullYear()];
    const ys = new Set(activities.map(a => a.dueDate.getFullYear()));
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const result: number[] = [];
    for (let y = min; y <= max; y++) result.push(y);
    return result;
  }, [activities]);

  // Build month columns: [{year, month, label}]
  const columns = useMemo(() => {
    const cols: { year: number; month: number; label: string }[] = [];
    years.forEach(y => {
      for (let m = 0; m < 12; m++) {
        cols.push({ year: y, month: m, label: MONTH_LABELS[m] });
      }
    });
    return cols;
  }, [years]);

  const COL_W = 72; // px per month column
  const ROW_H = 40; // px per activity row
  const LABEL_W = 260; // px for the activity label column
  const HEADER_H = 36;

  const totalW = LABEL_W + columns.length * COL_W;
  const totalH = HEADER_H + activities.length * ROW_H;

  // Map activity to column index
  const getColIndex = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    return columns.findIndex(c => c.year === y && c.month === m);
  };

  const today = new Date();
  const todayColIdx = getColIndex(today);
  const todayFraction = today.getDate() / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const todayX = LABEL_W + todayColIdx * COL_W + todayFraction * COL_W;

  return (
    <div ref={containerRef} className="relative overflow-x-auto rounded border border-gray-200 bg-white" style={{ maxHeight: 520 }}>
      <div style={{ width: totalW, minWidth: totalW }}>
        {/* Header row */}
        <div className="flex sticky top-0 z-10 bg-slate-50 border-b border-gray-200" style={{ height: HEADER_H }} translate="no">
          {/* Label column header */}
          <div
            className="flex-shrink-0 flex items-center px-3 text-xs font-semibold text-gray-600 border-r border-gray-200 sticky left-0 bg-slate-50 z-20"
            style={{ width: LABEL_W, minWidth: LABEL_W }}
          >
            Actividad
          </div>
          {/* Month headers */}
          {columns.map((col, i) => (
            <div
              key={`${col.year}-${col.month}`}
              className={`flex-shrink-0 flex flex-col items-center justify-center text-xs font-medium border-r border-gray-100 ${col.month === 0 ? "border-l-2 border-l-gray-300" : ""}`}
              style={{ width: COL_W, minWidth: COL_W }}
            >
              <span className="text-gray-500">{col.label}</span>
              {col.month === 0 && <span className="text-gray-400 text-[10px]">{col.year}</span>}
            </div>
          ))}
        </div>

        {/* Activity rows */}
        <div className="relative">
          {/* Today line */}
          {todayColIdx >= 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
              style={{ left: todayX }}
              title={`Hoy: ${today.toLocaleDateString("es-ES")}`}
            />
          )}

          {activities.map((activity, rowIdx) => {
            const colIdx = getColIndex(activity.dueDate);
            const dotX = colIdx >= 0
              ? LABEL_W + colIdx * COL_W + COL_W / 2
              : -999;
            const dotY = ROW_H / 2;
            const style = getBadgeStyle(activity.badge);
            const isEven = rowIdx % 2 === 0;

            return (
              <div
                key={activity.id}
                className={`flex relative ${isEven ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/40 transition-colors`}
                style={{ height: ROW_H }}
              >
                {/* Label */}
                <div
                  className={`flex-shrink-0 flex items-center gap-2 px-3 border-r border-gray-200 sticky left-0 z-10 ${isEven ? "bg-white" : "bg-slate-50"} hover:bg-blue-50/40`}
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                >
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${style.bg} ${style.text}`}
                  >
                    {activity.badge}
                  </span>
                  <span className="text-xs text-gray-700 truncate" title={activity.label}>
                    {activity.label}
                  </span>
                </div>

                {/* Month cells */}
                {columns.map((col, ci) => (
                  <div
                    key={ci}
                    className={`flex-shrink-0 border-r border-gray-100 ${col.month === 0 ? "border-l-2 border-l-gray-200" : ""}`}
                    style={{ width: COL_W, minWidth: COL_W, height: ROW_H }}
                  />
                ))}

                {/* Milestone dot — rendered as absolute overlay */}
                {colIdx >= 0 && (
                  <div
                    className="absolute flex items-center justify-center cursor-pointer"
                    style={{
                      left: dotX - 10,
                      top: dotY - 10,
                      width: 20,
                      height: 20,
                      zIndex: 5,
                    }}
                    onMouseEnter={e => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (rect) {
                        setTooltip({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                          activity,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {activity.completed ? (
                      // Diamond filled = completed
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <polygon points="8,1 15,8 8,15 1,8" fill={style.dot} stroke="white" strokeWidth="1.5" />
                        <text x="8" y="11.5" textAnchor="middle" fontSize="8" fill="white">✓</text>
                      </svg>
                    ) : (
                      // Diamond outline = pending
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <polygon points="8,1 15,8 8,15 1,8" fill="white" stroke={style.dot} strokeWidth="2" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 12, totalW - 220),
            top: tooltip.y + 12,
            maxWidth: 220,
          }}
        >
          <p className="font-semibold text-gray-900 mb-1">{tooltip.activity.label}</p>
          <p className="text-gray-500 mb-1">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${getBadgeStyle(tooltip.activity.badge).bg} ${getBadgeStyle(tooltip.activity.badge).text}`}>
              {tooltip.activity.badge}
            </span>
          </p>
          <p className="text-gray-600">
            Fecha: {tooltip.activity.dueDate.toLocaleDateString("es-ES")}
          </p>
          <p className={`font-medium mt-1 ${tooltip.activity.completed ? "text-green-700" : "text-orange-600"}`}>
            {tooltip.activity.completed ? "✓ Completada" : "◇ Pendiente"}
          </p>
        </div>
      )}
    </div>
  );
};

export default SimpleGanttChart;
