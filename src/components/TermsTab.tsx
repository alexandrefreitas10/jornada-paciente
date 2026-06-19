'use client'

import { useState, useEffect, useRef } from 'react'
import { AdminPasswordModal } from './AdminPasswordModal'

interface Term {
  id: number
  title: string
  file_name: string | null
  file_mime: string | null
  status: 'draft' | 'sent' | 'signed'
  created_by: string
  created_at: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  signature_data: string | null
  sign_token: string | null
}

interface Props { patientId: number }

const STATUS: Record<string, { label: string; color: string }> = {
  draft:  { label: 'Rascunho',    color: 'bg-gray-100 text-gray-600' },
  sent:   { label: 'Aguardando',  color: 'bg-blue-100 text-blue-700' },
  signed: { label: '✅ Assinado', color: 'bg-green-100 text-green-700' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TermsTab({ patientId }: Props) {
  const [terms, setTerms] = useState<Term[]>([])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/terms`)
      .then(r => r.json()).then(setTerms).catch(() => {})
  }, [patientId])

  async function handleCreate() {
    if (!title.trim() || !file) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('file', file)
      const res = await fetch(`/api/patients/${patientId}/terms`, { method: 'POST', body: fd })
      if (res.ok) {
        const term: Term = await res.json()
        setTerms(prev => [term, ...prev])
        setTitle(''); setFile(null); setCreating(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSend(term: Term) {
    setSending(term.id)
    try {
      const res = await fetch(`/api/patients/${patientId}/terms/${term.id}/send`, { method: 'POST' })
      if (res.ok) {
        const updated: Term = await res.json()
        setTerms(prev => prev.map(t => t.id === term.id ? updated : t))
        setExpandedId(term.id)
      }
    } finally {
      setSending(null)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/patients/${patientId}/terms/${id}`, { method: 'DELETE' })
    setTerms(prev => prev.filter(t => t.id !== id))
    setPendingDeleteId(null)
  }

  function getLink(token: string) {
    return `${window.location.origin}/termos/assinar/${token}`
  }

  async function copyLink(term: Term) {
    if (!term.sign_token) return
    await navigator.clipboard.writeText(getLink(term.sign_token))
    setCopiedId(term.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function shareWhatsApp(term: Term) {
    if (!term.sign_token) return
    const link = getLink(term.sign_token)
    const msg = encodeURIComponent(`Olá! Por favor, acesse o link abaixo para ler e assinar o termo "${term.title}":\n\n${link}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <div className="space-y-4">
      {pendingDeleteId !== null && (
        <AdminPasswordModal
          onConfirm={() => handleDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
      {!creating && (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          + Adicionar termo
        </button>
      )}

      {creating && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Novo termo</h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Nome do termo (ex: Termo de Consentimento)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Arquivo (PDF ou Word)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
            />
            {file && <p className="text-xs text-gray-400 mt-1">📄 {file.name}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim() || !file}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Enviando…' : 'Salvar'}
            </button>
            <button
              onClick={() => { setCreating(false); setTitle(''); setFile(null) }}
              className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {terms.length === 0 && !creating && (
        <p className="text-sm text-gray-400 text-center py-10">Nenhum termo adicionado ainda.</p>
      )}

      {terms.map(term => {
        const st = STATUS[term.status] ?? STATUS.draft
        const isExpanded = expandedId === term.id

        return (
          <div key={term.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">📄</span>
                  <h3 className="text-sm font-semibold text-gray-800">{term.title}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                {term.file_name && (
                  <p className="text-xs text-gray-400 mt-0.5">{term.file_name}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Criado por {term.created_by} · {fmt(term.created_at)}
                </p>
                {term.signed_at && (
                  <p className="text-xs text-green-600 mt-0.5 font-medium">
                    Assinado por {term.signer_name} em {fmt(term.signed_at)}
                  </p>
                )}
                {term.status === 'sent' && term.sent_at && (
                  <p className="text-xs text-blue-500 mt-0.5">Aguardando assinatura · enviado em {fmt(term.sent_at)}</p>
                )}
              </div>
              <button
                onClick={() => setExpandedId(isExpanded ? null : term.id)}
                className="text-gray-400 hover:text-gray-600 text-xs shrink-0 mt-1"
              >
                {isExpanded ? '▲' : '▼'}
              </button>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
                {/* Assinatura */}
                {term.status === 'signed' && term.signature_data && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Assinatura:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={term.signature_data} alt="Assinatura" className="border border-gray-200 rounded-lg max-h-20 bg-white" />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Download sempre disponível */}
                  <a
                    href={`/api/patients/${patientId}/terms/${term.id}/download`}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                  >
                    ⬇️ Baixar arquivo
                  </a>

                  {/* Gerar/reenviar link */}
                  {term.status !== 'signed' && (
                    <button
                      onClick={() => handleSend(term)}
                      disabled={sending === term.id}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {sending === term.id ? '…' : term.sign_token ? '🔄 Novo link' : '📤 Gerar link de assinatura'}
                    </button>
                  )}

                  {/* Copiar link */}
                  {term.sign_token && term.status !== 'signed' && (
                    <button
                      onClick={() => copyLink(term)}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      {copiedId === term.id ? '✅ Copiado!' : '🔗 Copiar link'}
                    </button>
                  )}

                  {/* WhatsApp */}
                  {term.sign_token && term.status !== 'signed' && (
                    <button
                      onClick={() => shareWhatsApp(term)}
                      className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      📱 WhatsApp
                    </button>
                  )}

                  {/* Excluir (sempre, com senha admin) */}
                  <button
                    onClick={() => setPendingDeleteId(term.id)}
                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                  >
                    🗑️ Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
