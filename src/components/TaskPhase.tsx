// src/components/TaskPhase.tsx
'use client'

import { useState } from 'react'
import { TaskPhase as TaskPhaseType } from '@/lib/task-definitions'

const FORM_URL = 'https://56wzdb18.forms.app/formulario-sem-titulo'

interface Props {
  phase: TaskPhaseType
  completedKeys: string[]
  patientId: number
  patientName?: string
  onToggle?: (taskKey: string, completed: boolean) => void
}

export function TaskPhase({ phase, completedKeys, patientName, onToggle }: Props) {
  const completedInPhase = phase.tasks.filter((t) => completedKeys.includes(t.key)).length
  const [copied, setCopied] = useState(false)

  function copyFormLink() {
    navigator.clipboard.writeText(FORM_URL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function sendFormWhatsApp() {
    const msg = encodeURIComponent(
      `Olá${patientName ? `, ${patientName.split(' ')[0]}` : ''}! 😊\n\nPor favor, preencha o formulário abaixo antes da sua consulta:\n${FORM_URL}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

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
            <div key={task.key} className="flex items-center gap-2">
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer flex-1">
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
              {task.key === 'questionario_pre' && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={copyFormLink}
                    title="Copiar link do formulário"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors shrink-0 ${copied ? 'bg-gray-100 border-gray-300 text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                  >
                    {copied ? '✅ Copiado' : '🔗 Link'}
                  </button>
                  <button
                    onClick={sendFormWhatsApp}
                    title="Enviar formulário pelo WhatsApp"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors shrink-0"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.552 4.116 1.52 5.845L0 24l6.34-1.498A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.37l-.36-.214-3.727.88.944-3.638-.235-.374A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                    Formulário
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
