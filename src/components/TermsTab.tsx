'use client'

import { useState, useEffect } from 'react'

interface Term {
  id: number
  title: string
  content: string
  status: 'draft' | 'sent' | 'signed' | 'declined'
  created_by: string
  created_at: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  signature_data: string | null
  sign_token: string | null
}

interface Props {
  patientId: number
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Rascunho',     color: 'bg-gray-100 text-gray-600' },
  sent:     { label: 'Enviado',      color: 'bg-blue-100 text-blue-700' },
  signed:   { label: '✅ Assinado',  color: 'bg-green-100 text-green-700' },
  declined: { label: '❌ Recusado',  color: 'bg-red-100 text-red-700' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TermsTab({ patientId }: Props) {
  const [terms, setTerms] = useState<Term[]>([])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [sending, setSending] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/terms`)
      .then(r => r.json())
      .then(setTerms)
      .catch(() => {})
  }, [patientId])

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      if (res.ok) {
        const term: Term = await res.json()
        setTerms(prev => [term, ...prev])
        setTitle('')
        setContent('')
        setCreating(false)
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
      }
    } finally {
      setSending(null)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este termo?')) return
    await fetch(`/api/patients/${patientId}/terms/${id}`, { method: 'DELETE' })
    setTerms(prev => prev.filter(t => t.id !== id))
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
      {/* Botão novo termo */}
      {!creating && (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          + Novo termo
        </button>
      )}

      {/* Formulário de criação */}
      {creating && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Novo termo</h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título do termo (ex: Termo de Consentimento)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Escreva aqui o conteúdo completo do termo…"
            rows={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim() || !content.trim()}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={() => { setCreating(false); setTitle(''); setContent('') }}
              className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de termos */}
      {terms.length === 0 && !creating && (
        <p className="text-sm text-gray-400 text-center py-10">Nenhum termo criado ainda.</p>
      )}

      {terms.map(term => {
        const st = STATUS_LABEL[term.status] ?? STATUS_LABEL.draft
        const isExpanded = expandedId === term.id

        return (
          <div key={term.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header do card */}
            <div className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-800 truncate">{term.title}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Criado por {term.created_by} · {fmt(term.created_at)}
                </p>
                {term.signed_at && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Assinado por {term.signer_name} em {fmt(term.signed_at)}
                  </p>
                )}
                {term.status === 'sent' && term.sent_at && (
                  <p className="text-xs text-blue-500 mt-0.5">Enviado em {fmt(term.sent_at)} · aguardando assinatura</p>
                )}
              </div>
              <button
                onClick={() => setExpandedId(isExpanded ? null : term.id)}
                className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
              >
                {isExpanded ? '▲ Fechar' : '▼ Ver'}
              </button>
            </div>

            {/* Conteúdo expandido */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {term.content}
                </pre>

                {/* Assinatura */}
                {term.status === 'signed' && term.signature_data && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Assinatura do paciente:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={term.signature_data} alt="Assinatura" className="border border-gray-200 rounded-lg max-h-24 bg-white" />
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-wrap gap-2">
                  {/* Gerar / reenviar link */}
                  {term.status !== 'signed' && (
                    <button
                      onClick={() => handleSend(term)}
                      disabled={sending === term.id}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {sending === term.id ? '…' : term.sign_token ? '🔄 Gerar novo link' : '📤 Gerar link de assinatura'}
                    </button>
                  )}

                  {/* Copiar link */}
                  {term.sign_token && (
                    <button
                      onClick={() => copyLink(term)}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      {copiedId === term.id ? '✅ Copiado!' : '🔗 Copiar link'}
                    </button>
                  )}

                  {/* WhatsApp */}
                  {term.sign_token && (
                    <button
                      onClick={() => shareWhatsApp(term)}
                      className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      📱 WhatsApp
                    </button>
                  )}

                  {/* Excluir */}
                  {term.status !== 'signed' && (
                    <button
                      onClick={() => handleDelete(term.id)}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    >
                      🗑️ Excluir
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
