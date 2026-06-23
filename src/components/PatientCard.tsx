import Link from 'next/link'
import { ProgressBar } from './ProgressBar'
import { PatientListItem } from '@/lib/patients'
import { ArchivePatientButton } from './ArchivePatientButton'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]

function avatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

function treatmentWeeks(startDate: string, duration: string): { elapsed: number; total: number } | null {
  const total = parseInt(duration, 10)
  if (!startDate || isNaN(total) || total <= 0) return null
  const start = new Date(startDate)
  if (isNaN(start.getTime())) return null
  const diffMs = Date.now() - start.getTime()
  const elapsed = Math.min(Math.max(Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)), 0), total)
  return { elapsed, total }
}

interface Props {
  patient: PatientListItem
}

export function PatientCard({ patient }: Props) {
  const treatment = treatmentWeeks(patient.start_date, patient.duration)

  return (
    <div className="flex items-center gap-2">
      <Link href={`/pacientes/${patient.id}`} className="block flex-1 min-w-0">
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:shadow-sm transition-all">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${avatarColor(patient.name)}`}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 truncate">{patient.name}</div>
          <div className="text-xs text-gray-500 mb-2">
            {patient.start_date && `Início: ${new Date(patient.start_date).toLocaleDateString('pt-BR')}`}
            {patient.duration && ` · ${patient.duration} sem.`}
            {patient.created_by && (
              <span className="block text-gray-400 mt-0.5">Criado por {patient.created_by}</span>
            )}
          </div>

          {/* Barra de progresso do tratamento */}
          {treatment && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-400">Semana {treatment.elapsed} de {treatment.total}</span>
                <span className="text-xs text-gray-400">{Math.round((treatment.elapsed / treatment.total) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${treatment.elapsed >= treatment.total ? 'bg-emerald-500' : 'bg-blue-400'}`}
                  style={{ width: `${(treatment.elapsed / treatment.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <ProgressBar completed={patient.completed_count} total={19} />
        </div>
      </div>
      </Link>
      <ArchivePatientButton patientId={patient.id} patientName={patient.name} />
    </div>
  )
}
