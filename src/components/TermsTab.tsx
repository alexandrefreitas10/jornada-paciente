'use client'

import { useState, useEffect } from 'react'
import { DeletedItemsButton } from './DeletedItemsButton'

interface Template {
  id: number
  title: string
  content: string
  file_s3_key: string | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  created_by: string
}

interface PatientTerm {
  id: number
  title: string
  status: 'draft' | 'sent' | 'signed'
  created_at: string
  signed_at: string | null
  signer_name: string | null
  sign_token: string | null
}

interface Props {
  patientId: number
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Aguardando', color: 'bg-blue-100 text-blue-700' },
  signed: { label: 'Assinado', color: 'bg-green-100 text-green-700' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TermsTab({ patientId }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [terms, setTerms] = useState<PatientTerm[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/terms').then(r => r.json()),
      fetch(`/api/patients/${patientId}/terms`).then(r => r.json()),
    ])
      .then(([templates, terms]) => {
        setTemplates(templates)
        setTerms(terms)
      })
      .finally(() => setLoading(false))
  }, [patientId])

  async function handleSend() {
    if (!selectedTemplate) return
    setSending(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/terms/send-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate }),
      })
      if (res.ok) {
        const newTerm: PatientTerm = await res.json()
        setTerms(prev => [newTerm, ...prev])
        setSelectedTemplate(null)
      } else {
        alert((await res.json()).error || 'Erro ao enviar termo')
      }
    } finally {
      setSending(false)
    }
  }

  function getLink(token: string) {
    return `${window.location.origin}/termos/assinar/${token}`
  }

  function shareWhatsApp(term: PatientTerm) {
    if (!term.sign_token) return
    const link = getLink(term.sign_token)
    const msg = encodeURIComponent(
      `Olá! Por favor, acesse o link abaixo para ler e assinar o termo "${term.title}":\n\n${link}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  async function handleDelete(termId: number) {
    if (!confirm('Excluir este termo?')) return
    setDeleting(termId)
    try {
      await fetch(`/api/patients/${patientId}/terms/${termId}`, { method: 'DELETE' })
      setTerms(prev => prev.filter(t => t.id !== termId))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="text-xs text-gray-400 animate-pulse">Carregando...</div>
  }

  return (
    <div className="space-y-4">
      {/* Enviar novo termo */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Enviar termo para assinatura</label>
          <div className="flex gap-2">
            <select
              value={selectedTemplate || ''}
              onChange={e => setSelectedTemplate(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value="">Selecione um termo...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              onClick={handleSend}
              disabled={!selectedTemplate || sending}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
          {templates.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Nenhum termo disponível.{' '}
              <a href="/termos" className="text-violet-600 hover:underline">
                Crie um na biblioteca de termos
              </a>
            </p>
          )}
        </div>
      </div>

      {/* Termos enviados */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Termos deste paciente</h3>
          <DeletedItemsButton patientId={patientId} entityTypes={['term']} />
        </div>

        {terms.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum termo enviado ainda.</p>
        ) : (
          <div className="space-y-2">
            {terms.map(term => (
              <div key={term.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{term.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmt(term.created_at)}
                      {term.signed_at && ` · Assinado por ${term.signer_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${STATUS[term.status].color}`}>
                      {STATUS[term.status].label}
                    </span>
                    {term.status !== 'signed' && (
                      <button
                        onClick={() => handleDelete(term.id)}
                        disabled={deleting === term.id}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50 border border-red-200"
                        title="Excluir este termo"
                      >
                        {deleting === term.id ? '⏳' : '🗑 Excluir'}
                      </button>
                    )}
                  </div>
                </div>

                {term.status === 'sent' && term.sign_token && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => shareWhatsApp(term)}
                      className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                    >
                      💬 WhatsApp
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getLink(term.sign_token!))
                        alert('Link copiado!')
                      }}
                      className="text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                    >
                      📋 Copiar link
                    </button>
                  </div>
                )}

                {term.status === 'signed' && term.sign_token && (
                  <a
                    href={`/api/terms/sign/${term.sign_token}/file?signed=1`}
                    className="inline-block text-xs text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 transition-colors"
                  >
                    ⬇ Baixar assinado
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
