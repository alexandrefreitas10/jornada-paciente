'use client'

import { useEffect, useRef, useState, use } from 'react'
import SignaturePad from 'signature_pad'

function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskDate(v: string) {
  return v.replace(/\D/g, '').slice(0, 8)
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
}

interface Term {
  id: number
  title: string
  content: string | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  status: string
  signer_name: string | null
}

// Parse {{Field}} tokens from text content into segments
function parseTokens(text: string): Array<{ type: 'text'; value: string } | { type: 'field'; name: string }> {
  const parts: Array<{ type: 'text'; value: string } | { type: 'field'; name: string }> = []
  const regex = /\{\{([^}]+)\}\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'field', name: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

export function SignTermPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [term, setTerm] = useState<Term | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [step, setStep] = useState<'loading' | 'view' | 'sign' | 'done' | 'already'>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    fetch(`/api/terms/sign/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setTerm(data)
        setStep(data.status === 'signed' ? 'already' : 'view')
      })
      .catch(() => setError('Nao foi possivel carregar o termo.'))
  }, [token])

  useEffect(() => {
    if (step !== 'sign' || !canvasRef.current) return

    const canvas = canvasRef.current
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')!.scale(ratio, ratio)

    const pad = new SignaturePad(canvas, { minWidth: 1, maxWidth: 3, penColor: '#1e3a5f' })
    pad.addEventListener('endStroke', () => setIsEmpty(pad.isEmpty()))
    padRef.current = pad
    setIsEmpty(true)

    return () => { pad.off() }
  }, [step])

  function clearPad() {
    padRef.current?.clear()
    setIsEmpty(true)
  }

  async function handleSubmit() {
    if (!name.trim()) { alert('Por favor, escreva seu nome completo.'); return }
    if (!padRef.current || padRef.current.isEmpty()) { alert('Por favor, desenhe sua assinatura.'); return }

    const signatureData = padRef.current.toDataURL('image/png')
    setSubmitting(true)

    const allFields: Record<string, string> = {}
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v.trim()) allFields[k] = v.trim()
    }

    try {
      const fd = new FormData()
      fd.append('signerName', name)
      fd.append('signatureData', signatureData)
      fd.append('filledFields', JSON.stringify(allFields))
      const res = await fetch(`/api/terms/sign/${token}`, { method: 'POST', body: fd })
      if (res.ok) { setStep('done') }
      else { const e = await res.json(); alert(e.error || 'Erro ao assinar.') }
    } finally {
      setSubmitting(false)
    }
  }

  const isTextBased = !!term?.content && !term?.file_name
  const isPdf = term?.file_mime === 'application/pdf'
  const fileUrl = `/api/terms/sign/${token}/file`
  const signedFileUrl = `/api/terms/sign/${token}/file?signed=1`

  // Extract unique field names from text-based content
  const textFields = isTextBased && term?.content
    ? [...new Set([...term.content.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1].trim()))]
    : []

  function setField(name: string, value: string) {
    const masked =
      name.toLowerCase().includes('cpf') ? maskCPF(value) :
      name.toLowerCase().includes('nascimento') || name.toLowerCase().includes('data') ? maskDate(value) :
      value
    setFieldValues(prev => ({ ...prev, [name]: masked }))
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center">
        <p className="text-3xl mb-3">erro</p>
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  )

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
    </div>
  )

  if (step === 'already') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3">
        <p className="text-xl font-bold text-gray-800">Termo ja assinado</p>
        <p className="text-sm text-gray-500">Assinado por <strong>{term?.signer_name}</strong>.</p>
        <a href={signedFileUrl} className="inline-block mt-4 px-5 py-2.5 bg-gray-800 text-white text-sm rounded-xl hover:bg-gray-700">
          Baixar comprovante
        </a>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3">
        <p className="text-xl font-bold text-gray-800">Assinado com sucesso!</p>
        <p className="text-sm text-gray-500">Obrigado, <strong>{name}</strong>. Sua assinatura foi registrada.</p>
        <a href={signedFileUrl} className="inline-block mt-2 px-5 py-2.5 bg-gray-800 text-white text-sm rounded-xl hover:bg-gray-700">
          Baixar documento assinado
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">

        <div className="text-center space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Termo para assinatura</p>
          <h1 className="text-xl font-bold text-gray-900">{term?.title}</h1>
        </div>

        {/* STEP: VIEW */}
        {step === 'view' && (
          <>
            {isTextBased && term?.content ? (
              // Text-based term: show inline fill-in-the-blank
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <p className="text-xs text-gray-400 mb-4 font-medium uppercase tracking-wide">Leia o documento abaixo</p>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {parseTokens(term.content).map((seg, i) =>
                    seg.type === 'text' ? (
                      <span key={i}>{seg.value}</span>
                    ) : (
                      <input
                        key={i}
                        type="text"
                        value={fieldValues[seg.name] ?? ''}
                        onChange={e => setField(seg.name, e.target.value)}
                        placeholder={seg.name}
                        className="inline-block border-b-2 border-blue-400 bg-blue-50 rounded px-2 py-0.5 text-sm text-blue-900 font-medium placeholder:text-blue-300 focus:outline-none focus:border-blue-600 min-w-[120px]"
                        style={{ width: Math.max(120, seg.name.length * 10) + 'px' }}
                      />
                    )
                  )}
                </div>
                {textFields.length > 0 && (
                  <p className="text-xs text-gray-400 mt-4">Preencha os campos destacados antes de assinar.</p>
                )}
              </div>
            ) : isPdf ? (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <iframe src={fileUrl} className="w-full" style={{ height: '65vh', minHeight: 320 }} title="Documento" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-8 text-center space-y-4">
                  <p className="text-sm font-medium text-gray-700">{term?.file_name}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Leia o documento antes de assinar. Voce pode baixa-lo para visualizar no celular.
                  </p>
                  <a href={fileUrl} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
                    Baixar documento
                  </a>
                </div>
              </div>
            )}

            {isPdf && (
              <a href={fileUrl} className="block text-center text-sm text-blue-600 hover:underline">Baixar PDF</a>
            )}

            <button
              onClick={() => setStep('sign')}
              className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isTextBased ? 'Assinar documento' : 'Preencher e assinar'} →
            </button>
          </>
        )}

        {/* STEP: SIGN */}
        {step === 'sign' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-5">

              {/* For file-based terms: fixed fields */}
              {!isTextBased && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Preencha os espacos do documento</p>
                    <p className="text-xs text-gray-400 mt-0.5">Campos opcionais — preencha apenas os que existem no seu documento.</p>
                  </div>
                  {['CPF', 'Data de nascimento', 'E-mail', 'Telefone'].map(field => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{field}</label>
                      <input
                        type={field === 'E-mail' ? 'email' : 'text'}
                        inputMode={field === 'CPF' || field === 'Telefone' ? 'numeric' : undefined}
                        value={fieldValues[field] ?? ''}
                        onChange={e => setField(field, e.target.value)}
                        placeholder={
                          field === 'CPF' ? '000.000.000-00' :
                          field === 'Data de nascimento' ? 'DD/MM/AAAA' :
                          `Digite ${field.toLowerCase()}`
                        }
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* For text-based terms: show field summary */}
              {isTextBased && textFields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Campos preenchidos</p>
                  {textFields.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 min-w-0 truncate">{f}:</span>
                      <span className={`font-medium ${fieldValues[f] ? 'text-gray-800' : 'text-red-400 text-xs'}`}>
                        {fieldValues[f] || 'nao preenchido — volte ao documento'}
                      </span>
                    </div>
                  ))}
                  <button
                    onClick={() => setStep('view')}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Voltar para preencher os campos
                  </button>
                </div>
              )}

              {(isTextBased && textFields.length > 0) || !isTextBased ? <hr className="border-gray-100" /> : null}

              {/* Full name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nome completo <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* Signature pad */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Assinatura <span className="text-red-400">*</span>
                  </label>
                  <button onClick={clearPad} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Limpar
                  </button>
                </div>
                <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden" style={{ height: 160 }}>
                  <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" style={{ touchAction: 'none' }} />
                </div>
                <p className="text-xs text-gray-400 mt-1.5 text-center">
                  {isEmpty ? 'Assine dentro da area acima com o dedo ou mouse' : 'Assinatura capturada'}
                </p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || isEmpty || !name.trim()}
              className="w-full py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Enviando...' : 'Confirmar assinatura'}
            </button>

            <button onClick={() => setStep('view')} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">
              Ver documento novamente
            </button>
          </>
        )}
      </div>
    </div>
  )
}