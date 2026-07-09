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

type Tab = 'tasks' | 'evolution' | 'photos' | 'bioimpedance' | 'exams' | 'diet' | 'terms' | 'medications' | 'estetica'

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
  summary: string | null
  created_by?: string | null
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
  currentUserName: string
  readOnly?: boolean
}

export function PatientDetailClient({ patient, initialMeasurements, initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions, currentUserName, readOnly = false }: Props) {
  const [completedKeys, setCompletedKeys] = useState<string[]>(patient.completed_task_keys)
  const [editOpen, setEditOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>(readOnly ? 'evolution' : 'tasks')
  const router = useRouter()

  const TAB_KEY = `patient-tab-${patient.id}`

  useEffect(() => {
    const saved = sessionStorage.getItem(TAB_KEY)
    if (saved && !(readOnly && saved === 'tasks')) setActiveTab(saved as Tab)
  }, [TAB_KEY, readOnly])

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
    ...(readOnly ? [] : [{ key: 'tasks' as Tab, label: 'Tarefas' }]),
    { key: 'evolution', label: 'Evolução' },
    { key: 'photos', label: 'Fotos' },
    { key: 'bioimpedance', label: 'Bioimpedância' },
    { key: 'exams', label: 'Exames' },
    { key: 'diet', label: 'Dietas' },
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
          {!readOnly && (
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setEditOpen(true)}
                className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ✏️ Editar
              </button>
              <DeleteButton patientId={patient.id} patientName={patient.name} />
            </div>
          )}
        </div>
        <ProgressBar completed={completedKeys.length} total={ALL_TASK_KEYS.length} />
        {!readOnly && <PortalAccessBlock patientId={patient.id} />}
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
          <EvolutionTab patientId={patient.id} initialMeasurements={initialMeasurements} initialEvolutionPhotos={initialEvolutionPhotos} initialPrescriptions={initialPrescriptions} currentUserName={currentUserName} readOnly={readOnly} />
        )}
        {activeTab === 'photos' && (
          <FilesTab patientId={patient.id} fileType="photo" initialFiles={initialPhotos} readOnly={readOnly} />
        )}
        {activeTab === 'bioimpedance' && (
          <FilesTab patientId={patient.id} fileType="bioimpedance" initialFiles={initialBioimpedances} readOnly={readOnly} />
        )}
        {activeTab === 'exams' && (
          <ExamsTab patientId={patient.id} initialFiles={initialExams} readOnly={readOnly} />
        )}
        {activeTab === 'diet' && (
          <FilesTab patientId={patient.id} fileType="diet" initialFiles={initialDiets} readOnly={readOnly} />
        )}
{activeTab === 'terms' && (
          <TermsTab patientId={patient.id} readOnly={readOnly} />
        )}
        {activeTab === 'medications' && (
          <MedicationsTab patientId={patient.id} patientName={patient.name} readOnly={readOnly} />
        )}
        {activeTab === 'estetica' && (
          <EsteticaTab patientId={patient.id} readOnly={readOnly} />
        )}
      </div>

      {!readOnly && editOpen && (
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

function PortalAccessBlock({ patientId }: { patientId: number }) {
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'active'>('loading')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/portal-invite`)
      .then(r => r.json())
      .then(data => {
        setStatus(data.status)
        if (data.email) setEmail(data.email)
        if (data.token) {
          setToken(data.token)
          setLink(`${window.location.origin}/portal/ativar/${data.token}`)
        }
      })
      .catch(() => setStatus('none'))
  }, [patientId])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    const res = await fetch(`/api/patients/${patientId}/portal-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Erro ao gerar convite'); setGenerating(false); return }
    setEmail(emailInput)
    setToken(data.token)
    // Monta o link no navegador — o servidor atrás de proxy (Railway) não conhece o domínio público
    setLink(`${window.location.origin}/portal/ativar/${data.token}`)
    setStatus('pending')
    setGenerating(false)
  }

  async function handleRevoke() {
    if (!confirm('Revogar acesso do paciente ao portal?')) return
    setRevoking(true)
    await fetch(`/api/patients/${patientId}/portal-invite`, { method: 'DELETE' })
    setStatus('none')
    setEmail('')
    setToken('')
    setLink('')
    setEmailInput('')
    setRevoking(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'loading') return null

  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Acesso do Paciente ao Portal</p>

      {status === 'none' && (
        <form onSubmit={handleGenerate} className="space-y-2">
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            required
            placeholder="E-mail do paciente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={generating}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {generating ? 'Gerando...' : '🔗 Gerar link de convite'}
          </button>
        </form>
      )}

      {status === 'pending' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 font-medium">⏳ Aguardando ativação — {email}</p>
          <div className="flex gap-2">
            <input readOnly value={link}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50" />
            <button onClick={copyLink}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors shrink-0">
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={revoking}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            {revoking ? 'Revogando...' : '× Revogar convite'}
          </button>
        </div>
      )}

      {status === 'active' && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-600 font-medium">✅ Portal ativo — {email}</p>
          <button onClick={handleRevoke} disabled={revoking}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            {revoking ? 'Revogando...' : '× Revogar acesso'}
          </button>
        </div>
      )}
    </div>
  )
}
