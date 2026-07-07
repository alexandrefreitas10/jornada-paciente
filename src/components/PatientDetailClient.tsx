'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PatientDetail } from '@/lib/patients'
import { Measurement } from '@/lib/measurements'
import { TASK_PHASES, ALL_TASK_KEYS } from '@/lib/task-definitions'
import { ProgressBar } from './ProgressBar'
import { TaskPhase } from './TaskPhase'
import { PatientModal } from './PatientModal'
import { DeleteButton } from './DeleteButton'
import { EvolutionTab } from './EvolutionTab'
import { FilesTab } from './FilesTab'
import { ExamsTab } from './ExamsTab'
import { EvolucaoResumoTab } from './EvolucaoResumoTab'
import { TermsTab } from './TermsTab'
import { MedicationsTab } from './MedicationsTab'
import { EsteticaTab } from './EsteticaTab'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

type Tab = 'tasks' | 'evolution' | 'photos' | 'bioimpedance' | 'exams' | 'diet' | 'resumo' | 'terms' | 'medications' | 'estetica'

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
  summary: string | null
  created_by?: string | null
}

interface SummaryTopics {
  objetivos_principais: string
  tratamentos_anteriores: string
  queixas_principais: string
  qualidade_sono: string
  intestino: string
  libido: string
  padrao_alimentar: string
  atividade_fisica: string
  doencas_previas_cirurgias: string
  medicacao_suplementos: string
}

interface EvolutionSummary {
  id: number
  patient_id: number
  audio_s3_key: string | null
  audio_name: string | null
  transcription: string
  summary: SummaryTopics
  created_at: string
}

interface Props {
  patient: PatientDetail
  initialMeasurements: Measurement[]
  initialPhotos: FileRecord[]
  initialBioimpedances: FileRecord[]
  initialExams: FileRecord[]
  initialDiets: FileRecord[]
  initialEvolutionPhotos: FileRecord[]
  initialPrescriptions: FileRecord[]
  initialSummaries: EvolutionSummary[]
  currentUserName: string
}

export function PatientDetailClient({ patient, initialMeasurements, initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions, initialSummaries, currentUserName }: Props) {
  const [completedKeys, setCompletedKeys] = useState<string[]>(patient.completed_task_keys)
  const [editOpen, setEditOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const router = useRouter()

  const TAB_KEY = `patient-tab-${patient.id}`

  useEffect(() => {
    const saved = sessionStorage.getItem(TAB_KEY)
    if (saved) setActiveTab(saved as Tab)
  }, [TAB_KEY])

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    sessionStorage.setItem(TAB_KEY, tab)
  }

  async function handleToggle(taskKey: string, completed: boolean) {
    setCompletedKeys((prev) =>
      completed ? [...prev, taskKey] : prev.filter((k) => k !== taskKey)
    )
    const method = completed ? 'POST' : 'DELETE'
    await fetch(`/api/patients/${patient.id}/tasks/${taskKey}`, { method })
  }

  async function handleEdit(data: { name: string; start_date: string; duration: string; notes: string }) {
    const res = await fetch(`/api/patients/${patient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Erro ao atualizar')
    router.refresh()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tasks', label: 'Tarefas' },
    { key: 'evolution', label: 'Evolução' },
    { key: 'photos', label: 'Fotos' },
    { key: 'bioimpedance', label: 'Bioimpedância' },
    { key: 'exams', label: 'Exames' },
    { key: 'diet', label: 'Dietas' },
    { key: 'resumo', label: 'Resumo de Evolução' },
    { key: 'terms', label: '📄 Termos' },
    { key: 'medications', label: '💊 Medicações' },
    { key: 'estetica', label: '✨ Estética' },
  ]

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Navegação */}
      <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">
        ← Voltar
      </button>

      {/* Cabeçalho do paciente */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 ${avatarColor(patient.name)}`}>
            {patient.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{patient.name}</h1>
            <p className="text-sm text-gray-500">
              {patient.start_date && `Início: ${patient.start_date}`}
              {patient.start_date && patient.duration && ' · '}
              {patient.duration}
            </p>
            {patient.notes && (
              <p className="text-sm text-gray-500 italic mt-1">{patient.notes}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ✏️ Editar
            </button>
            <DeleteButton patientId={patient.id} patientName={patient.name} />
          </div>
        </div>
        <ProgressBar completed={completedKeys.length} total={ALL_TASK_KEYS.length} />
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba ativa */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {activeTab === 'tasks' && (
          TASK_PHASES.map((phase) => (
            <TaskPhase
              key={phase.key}
              phase={phase}
              completedKeys={completedKeys}
              patientId={patient.id}
              patientName={patient.name}
              onToggle={handleToggle}
            />
          ))
        )}
        {activeTab === 'evolution' && (
          <EvolutionTab patientId={patient.id} initialMeasurements={initialMeasurements} initialEvolutionPhotos={initialEvolutionPhotos} initialPrescriptions={initialPrescriptions} currentUserName={currentUserName} />
        )}
        {activeTab === 'photos' && (
          <FilesTab patientId={patient.id} fileType="photo" initialFiles={initialPhotos} />
        )}
        {activeTab === 'bioimpedance' && (
          <FilesTab patientId={patient.id} fileType="bioimpedance" initialFiles={initialBioimpedances} />
        )}
        {activeTab === 'exams' && (
          <ExamsTab patientId={patient.id} initialFiles={initialExams} />
        )}
        {activeTab === 'diet' && (
          <FilesTab patientId={patient.id} fileType="diet" initialFiles={initialDiets} />
        )}
        {activeTab === 'resumo' && (
          <EvolucaoResumoTab patientId={patient.id} initialSummaries={initialSummaries} />
        )}
        {activeTab === 'terms' && (
          <TermsTab patientId={patient.id} />
        )}
        {activeTab === 'medications' && (
          <MedicationsTab patientId={patient.id} patientName={patient.name} />
        )}
        {activeTab === 'estetica' && (
          <EsteticaTab patientId={patient.id} />
        )}
      </div>

      {editOpen && (
        <PatientModal
          title="Editar Paciente"
          initial={{
            name: patient.name,
            start_date: patient.start_date,
            duration: patient.duration,
            notes: patient.notes,
          }}
          onSave={handleEdit}
          onClose={() => setEditOpen(false)}
        />
      )}
    </main>
  )
}
