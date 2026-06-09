// src/components/TaskPhase.tsx
'use client'

import { TaskPhase as TaskPhaseType } from '@/lib/task-definitions'

interface Props {
  phase: TaskPhaseType
  completedKeys: string[]
  patientId: number
  onToggle?: (taskKey: string, completed: boolean) => void
}

export function TaskPhase({ phase, completedKeys, onToggle }: Props) {
  const completedInPhase = phase.tasks.filter((t) => completedKeys.includes(t.key)).length

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span>{phase.icon}</span> <span>{phase.label}</span>
        </h3>
        <span className="text-xs text-gray-400">{completedInPhase}/{phase.tasks.length}</span>
      </div>
      <div className="space-y-2">
        {phase.tasks.map((task) => {
          const isChecked = completedKeys.includes(task.key)
          return (
            <label
              key={task.key}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onToggle?.(task.key, e.target.checked)}
                className="w-4 h-4 accent-violet-500 cursor-pointer"
              />
              <span className={isChecked ? 'line-through text-gray-400' : 'text-gray-700'}>
                {task.label}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
