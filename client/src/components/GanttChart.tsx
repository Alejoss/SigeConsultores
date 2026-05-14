import React, { useMemo } from 'react';
import { Gantt, Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  type: 'task' | 'milestone' | 'project';
  dependencies?: string[];
  isDisabled?: boolean;
}

interface GanttChartProps {
  tasks: GanttTask[];
  onTaskChange?: (task: Task) => void;
  onTaskDelete?: (task: Task) => void;
  onTaskSelect?: (task: Task) => void;
  isReadOnly?: boolean;
  height?: number;
  viewMode?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Reusable Gantt Chart Component
 * 
 * Displays project timeline with tasks, dependencies, and progress tracking.
 * Supports drag-and-drop editing (if not read-only).
 * 
 * @example
 * const tasks: GanttTask[] = [
 *   {
 *     id: '1',
 *     name: 'Task 1',
 *     start: new Date(2026, 3, 1),
 *     end: new Date(2026, 3, 10),
 *     progress: 50,
 *     type: 'task',
 *   },
 * ];
 * 
 * <GanttChart tasks={tasks} isReadOnly={false} />
 */
export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  onTaskChange,
  onTaskDelete,
  onTaskSelect,
  isReadOnly = false,
  height = 400,
  viewMode = 'month',
}) => {
  // Convert GanttTask to gantt-task-react Task format
  const ganttTasks: Task[] = useMemo(() => {
    return tasks.map((task) => ({
      start: task.start,
      end: task.end,
      name: task.name,
      id: task.id,
      progress: task.progress,
      type: task.type as 'task' | 'milestone' | 'project',
      dependencies: task.dependencies || [],
      isDisabled: task.isDisabled || isReadOnly,
    }));
  }, [tasks, isReadOnly]);

  const handleTaskChange = (task: Task) => {
    if (!isReadOnly && onTaskChange) {
      onTaskChange(task);
    }
  };

  const handleTaskDelete = (task: Task) => {
    if (!isReadOnly && onTaskDelete) {
      onTaskDelete(task);
    }
  };

  const handleTaskSelect = (task: Task) => {
    if (onTaskSelect) {
      onTaskSelect(task);
    }
  };

  return (
    <div className="w-full overflow-x-auto" style={{ height: `${height}px` }}>
      <Gantt
        tasks={ganttTasks}
        onDateChange={handleTaskChange}
        onDelete={handleTaskDelete}
        onSelect={handleTaskSelect}
        viewMode={viewMode as any}
        columnWidth={60}
        listCellWidth="200px"
        ganttHeight={height}
        todayColor="rgba(252, 248, 227, 0.5)"
        rowHeight={50}
      />
    </div>
  );
};

export default GanttChart;
