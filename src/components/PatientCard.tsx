// src/components/PatientCard.tsx
import Link from 'next/link'
import { ProgressBar } from './ProgressBar'
import { PatientListItem } from '@/lib/patients'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]

function avatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

interface Props {
  patient: PatientListItem
}

export function PatientCard({ patient }: Props) {
  return (
    <Link href={`/pacientes/${patient.id}`} className="block">
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:shadow-sm transition-all">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${avatarColor(patient.name)}`}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 truncate">{patient.name}</div>
          <div className="text-xs text-gray-500 mb-2">
            {patient.start_date && `Início: ${patient.start_date}`}
            {patient.start_date && patient.duration && ' · '}
            {patient.duration}
          </div>
          <ProgressBar completed={patient.completed_count} total={18} />
        </div>
      </div>
    </Link>
  )
}
