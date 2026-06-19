'use client'

import { useEffect, useRef, useState, use } from 'react'

interface Term {
  id: number
  title: string
  file_name: string | null
  file_mime: string | null
  status: string
  signer_name: string | null
  signed_at: string | null
}

export function SignTermPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [term, setTerm] = useState<Term | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [step, setStep] = useState<'loading' | 'view' | 'sign' | 'done' | 'already'>('loading')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    fetch(`/api/terms/sign/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setTerm(data)
        setStep(data.status === 'signed' ? 'already' : 'view')
      })
      .catch(() => setError('Não foi possível carregar o termo.'))
  }, [token])

  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, c: HTMLCanvasElement) {
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width, sy = c.height / rect.height
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy }
  }

  function onStart(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    drawing.current = true
    const p = getPos(e, c)
    c.getContext('2d')!.beginPath()
    c.getContext('2d')!.moveTo(p.x, p.y)
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const p = getPos(e, c)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  function onEnd() { drawing.current = false }

  async function handleSubmit() {
    if (!name.trim()) { alert('Por favor, escreva seu nome completo.'); return }
    const c = canvasRef.current!
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    if (!pixels.some(p => p !== 0)) { alert('Por favor, desenhe sua assinatura.'); return }
    const signatureData = c.toDataURL('image/png')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/terms/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name, signatureData }),
      })
      if (res.ok) { setStep('done') }
      else { const e = await res.json(); alert(e.error || 'Erro ao assinar.') }
    } finally {
      setSubmitting(false)
    }
  }

  const isPdf = term?.file_mime === 'application/pdf'
  const fileUrl = `/api/terms/sign/${token}/file`

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center"><p className="text-2xl mb-2">⚠️</p><p className="text-gray-600">{error}</p></div>
    </div>
  )

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Carregando…</p>
    </div>
  )

  if (step === 'already') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-2">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-semibold text-gray-800">Termo já assinado</p>
        <p className="text-sm text-gray-500">Assinado por <strong>{term?.signer_name}</strong>.</p>
        <a href={fileUrl} className="inline-block mt-4 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
          ⬇️ Baixar documento
        </a>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3">
        <p className="text-5xl">✅</p>
        <p className="text-xl font-bold text-gray-800">Assinado com sucesso!</p>
        <p className="text-sm text-gray-500">Obrigado, <strong>{name}</strong>. Sua assinatura foi registrada.</p>
        <a href={fileUrl} className="inline-block mt-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
          ⬇️ Baixar documento
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Termo para assinatura</p>
          <h1 className="text-xl font-bold text-gray-900">{term?.title}</h1>
        </div>

        {step === 'view' && (
          <>
            {/* Visualizador / download */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {isPdf ? (
                <iframe
                  src={fileUrl}
                  className="w-full"
                  style={{ height: '60vh', minHeight: 300 }}
                  title="Documento"
                />
              ) : (
                <div className="p-6 text-center space-y-3">
                  <p className="text-4xl">📄</p>
                  <p className="text-sm text-gray-600 font-medium">{term?.file_name}</p>
                  <p className="text-xs text-gray-400">Baixe o documento, leia com atenção e volte aqui para assinar.</p>
                  <a
                    href={fileUrl}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    ⬇️ Baixar documento
                  </a>
                </div>
              )}
            </div>

            {isPdf && (
              <a href={fileUrl} className="block text-center text-sm text-blue-600 hover:underline">
                ⬇️ Baixar PDF
              </a>
            )}

            <button
              onClick={() => setStep('sign')}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Li o documento e desejo assinar →
            </button>
          </>
        )}

        {step === 'sign' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Assinatura</label>
                  <button onClick={clearCanvas} className="text-xs text-gray-400 hover:text-gray-600">Limpar</button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={160}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 cursor-crosshair"
                  style={{ touchAction: 'none' }}
                  onMouseDown={onStart}
                  onMouseMove={onMove}
                  onMouseUp={onEnd}
                  onMouseLeave={onEnd}
                  onTouchStart={onStart}
                  onTouchMove={onMove}
                  onTouchEnd={onEnd}
                />
                <p className="text-xs text-gray-400 mt-1 text-center">Desenhe sua assinatura com o dedo</p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Enviando…' : '✅ Confirmar assinatura'}
            </button>

            <button onClick={() => setStep('view')} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
              ← Ver documento novamente
            </button>
          </>
        )}
      </div>
    </div>
  )
}
