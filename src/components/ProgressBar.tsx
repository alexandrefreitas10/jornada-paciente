// src/components/ProgressBar.tsx
interface Props {
  completed: number
  total: number
}

export function ProgressBar({ completed, total }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isComplete = completed === total

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Progresso</span>
        <span>{completed} / {total} tarefas</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          data-testid="progress-fill"
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
