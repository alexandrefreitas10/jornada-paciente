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
import { OuvidoriaTab } from './OuvidoriaTab'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

type Tab = 'tasks' | 'evolution' | 'photos' | 'bioimpedance' | 'exams' | 'diet' | 'prescricao' | 'terms' | 'medications' | 'estetica' | 'ouvidoria'

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
  initialPrescricoes?: FileRecord[]
  currentUserName: string
  readOnly?: boolean
}

export function PatientDetailClient({ patient, initialMeasurements, initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions, initialPrescricoes = [], currentUserName, readOnly = false }: Props) {
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
    { key: 'prescricao', label: '📋 Prescrições' },
{ key: 'terms', label: '📄 Termos' },
    { key: 'medications', label: '💊 Medicações' },
    { key: 'estetica', label: '✨ Estética' },
    // Ouvidoria só existe no portal do paciente
    ...(readOnly ? [{ key: 'ouvidoria' as Tab, label: '📣 Ouvidoria' }] : []),
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
        {!readOnly && <ProgressBar completed={completedKeys.length} total={ALL_TASK_KEYS.length} />}
        {!readOnly && <PortalAccessBlock patientId={patient.id} patientName={patient.name} />}
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
        {activeTab === 'prescricao' && (
          <FilesTab patientId={patient.id} fileType="prescricao" initialFiles={initialPrescricoes} readOnly={readOnly} />
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
        {activeTab === 'ouvidoria' && (
          <OuvidoriaTab patientId={patient.id} />
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

function PortalAccessBlock({ patientId, patientName }: { patientId: number; patientName: string }) {
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'pending_link' | 'expired' | 'active'>('loading')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/portal-invite`)
      .then(r => r.json())
      .then(data => {
        setStatus(data.status)
        if (data.email) setEmail(data.email)
        if (data.code) setCode(data.code)
        if (data.expiresAt) setExpiresAt(data.expiresAt)
        if (data.token) {
          // Monta o link no navegador — o servidor atrás de proxy (Railway) não conhece o domínio público
          setLink(`${window.location.origin}/portal/ativar/${data.token}`)
        }
      })
      .catch(() => setStatus('none'))
  }, [patientId])

  async function handleGenerate() {
    // Regerar apaga a senha atual — só nesse estado existe senha pra perder.
    if (status === 'active' && !confirm(
      'Isso apaga a senha atual do paciente. Ele vai precisar do código novo para escolher outra. Continuar?'
    )) return

    setGenerating(true)
    setError(null)
    const res = await fetch(`/api/patients/${patientId}/portal-invite`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Erro ao gerar código'); setGenerating(false); return }
    setCode(data.code)
    setExpiresAt(data.expiresAt)
    setStatus('pending')
    setGenerating(false)
  }

  async function handleRevoke() {
    if (!confirm('Revogar acesso do paciente ao portal?')) return
    setRevoking(true)
    await fetch(`/api/patients/${patientId}/portal-invite`, { method: 'DELETE' })
    setStatus('none')
    setEmail('')
    setCode('')
    setExpiresAt('')
    setLink('')
    setRevoking(false)
  }

  function copyMessage() {
    const mensagem = `Oi ${patientName}! Seu acesso ao portal: entre em ${window.location.origin}/portal/ativar e digite o código ${code}`
    navigator.clipboard.writeText(mensagem).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'loading') return null

  const validadeFormatada = expiresAt ? new Date(expiresAt).toLocaleDateString('pt-BR') : ''

  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Acesso do Paciente ao Portal</p>

      {status === 'none' && (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={handleGenerate} disabled={generating}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {generating ? 'Gerando...' : '🔑 Gerar código de acesso'}
          </button>
        </div>
      )}

      {status === 'pending' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 font-medium">⏳ Aguardando ativação</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-mono font-bold tracking-[0.3em] text-gray-900">{code}</p>
            <p className="text-xs text-gray-500 mt-1">válido até {validadeFormatada}</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={copyMessage}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors">
              {copied ? '✓ Copiado' : '📋 Copiar mensagem'}
            </button>
            <button onClick={handleRevoke} disabled={revoking}
              className="px-3 py-2 text-xs text-red-500 hover:text-red-700 transition-colors shrink-0">
              {revoking ? 'Revogando...' : '× Revogar'}
            </button>
          </div>
        </div>
      )}

      {status === 'pending_link' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 font-medium">⏳ Convite antigo aguardando ativação — {email}</p>
          <p className="text-xs text-gray-500">Este é um convite antigo por link. Gerar um código novo substitui este convite.</p>
          <div className="flex gap-2">
            <input readOnly value={link}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50" />
            <button onClick={copyLink}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors shrink-0">
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handleGenerate} disabled={generating}
              className="text-xs text-violet-600 hover:text-violet-800 transition-colors">
              {generating ? 'Gerando...' : '🔑 Gerar código de acesso'}
            </button>
            <button onClick={handleRevoke} disabled={revoking}
              className="text-xs text-red-500 hover:text-red-700 transition-colors">
              {revoking ? 'Revogando...' : '× Revogar convite'}
            </button>
          </div>
        </div>
      )}

      {status === 'expired' && (
        <div className="space-y-2">
          <p className="text-xs text-red-500 font-medium">✕ O código expirou</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={handleGenerate} disabled={generating}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {generating ? 'Gerando...' : '🔑 Gerar novo código'}
          </button>
        </div>
      )}

      {status === 'active' && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-600 font-medium">✅ Portal ativo — {email}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handleGenerate} disabled={generating}
              className="text-xs text-violet-600 hover:text-violet-800 transition-colors">
              {generating ? 'Gerando...' : '🔄 Gerar novo código (redefinir senha)'}
            </button>
            <button onClick={handleRevoke} disabled={revoking}
              className="text-xs text-red-500 hover:text-red-700 transition-colors">
              {revoking ? 'Revogando...' : '× Revogar acesso'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
