import React from 'react';

interface MonthlyProgressTrackerProps {
  monthlyProgress: boolean[];
  onChange: (newProgress: boolean[]) => void;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'Mayo', 'Jun', 'Jul', 'Agos', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const MonthlyProgressTracker: React.FC<MonthlyProgressTrackerProps> = ({ monthlyProgress, onChange }) => {
  const completedCount = monthlyProgress.filter(m => m).length;
  const percentage = (completedCount / 12) * 100;
  
  // Get current month (0-11)
  const currentMonth = new Date().getMonth();

  const handleMonthClick = (index: number) => {
    const newProgress = [...monthlyProgress];
    newProgress[index] = !newProgress[index];
    onChange(newProgress);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">% Completado: {percentage.toFixed(0)}% ({completedCount}/12 meses)</span>
      </div>
      
      <div className="flex gap-1 flex-wrap" translate="no">
        {MONTHS.map((month, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleMonthClick(index)}
              title={MONTH_NAMES[index]}
              className={`
                w-8 h-8 rounded border-2 transition-all flex items-center justify-center text-xs font-bold
                ${monthlyProgress[index] 
                  ? 'bg-green-500 border-green-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                }
                ${index === currentMonth ? 'ring-2 ring-blue-400' : ''}
              `}
            >
              {monthlyProgress[index] ? '✓' : ''}
            </button>
            <span className="text-xs text-gray-600 font-semibold">{month}</span>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        Haz clic en cada mes para marcar como completado. El mes actual está resaltado en azul.
      </div>
    </div>
  );
};
