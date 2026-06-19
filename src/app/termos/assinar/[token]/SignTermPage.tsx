'use client'

import { useEffect, useRef, useState, use } from 'react'

interface Term {
  id: number
  title: string
  content: string
  status: string
  signer_name: string | null
  signed_at: string | null
}

export function SignTermPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [term, setTerm] = useState<Term | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [step, setStep] = useState<'loading' | 'read' | 'sign' | 'done' | 'already'>('loading')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    fetch(`/api/terms/sign/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setTerm(data)
        setStep(data.status === 'signed' ? 'already' : 'read')
      })
      .catch(() => setError('Não foi possível carregar o termo.'))
  }, [token])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  function onDrawStart(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    drawing.current = true
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function onDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  function onDrawEnd() { drawing.current = false }

  async function handleSubmit() {
    const canvas = canvasRef.current!
    const signatureData = canvas.toDataURL('image/png')
    const isBlank = !document.createElement('canvas').toDataURL || signatureData === document.createElement('canvas').toDataURL()

    if (!name.trim()) { alert('Por favor, escreva seu nome completo.'); return }

    // Check canvas is not empty
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const hasSignature = pixels.some(p => p !== 0)
    if (!hasSignature) { alert('Por favor, desenhe sua assinatura.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/terms/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name, signatureData }),
      })
      if (res.ok) {
        setStep('done')
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao assinar. Tente novamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  )

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Carregando termo…</p>
    </div>
  )

  if (step === 'already') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-2">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-semibold text-gray-800">Termo já assinado</p>
        <p className="text-sm text-gray-500">Este termo foi assinado por <strong>{term?.signer_name}</strong>.</p>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-3">
        <p className="text-5xl">✅</p>
        <p className="text-xl font-bold text-gray-800">Assinado com sucesso!</p>
        <p className="text-sm text-gray-500">Obrigado, <strong>{name}</strong>. Sua assinatura foi registrada.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Termo para assinatura</p>
          <h1 className="text-xl font-bold text-gray-900">{term?.title}</h1>
        </div>

        {step === 'read' && (
          <>
            {/* Conteúdo do termo */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {term?.content}
              </pre>
            </div>

            <button
              onClick={() => setStep('sign')}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Li e desejo assinar →
            </button>
            <p className="text-center text-xs text-gray-400">Role para cima para ler o termo completo antes de assinar.</p>
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
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 touch-none cursor-crosshair"
                  style={{ touchAction: 'none' }}
                  onMouseDown={onDrawStart}
                  onMouseMove={onDraw}
                  onMouseUp={onDrawEnd}
                  onMouseLeave={onDrawEnd}
                  onTouchStart={onDrawStart}
                  onTouchMove={onDraw}
                  onTouchEnd={onDrawEnd}
                />
                <p className="text-xs text-gray-400 mt-1 text-center">Desenhe sua assinatura acima</p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Enviando…' : '✅ Confirmar assinatura'}
            </button>

            <button
              onClick={() => setStep('read')}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              ← Voltar ao termo
            </button>
          </>
        )}
      </div>
    </div>
  )
}
