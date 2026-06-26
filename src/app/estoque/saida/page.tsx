'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense, useCallback } from 'react'
import jsQR from 'jsqr'

interface StockItem { id: number; name: string; unit: string; quantity: number; lot: string | null; expiry_date: string | null }
interface Patient { id: number; name: string }
interface CartEntry { item: StockItem; quantity: number }
type Step = 'confirm' | 'ask-cart' | 'cart' | 'form' | 'done'

const CART_KEY = 'saida_cart'

function saveCart(cart: CartEntry[]) { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }
function loadCart(): CartEntry[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] } }
function clearCart() { localStorage.removeItem(CART_KEY) }

function SaidaForm() {
  const searchParams = useSearchParams()
  const itemId = searchParams.get('item')

  const [item, setItem] = useState<StockItem | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('confirm')

  // Cart state
  const [cart, setCart] = useState<CartEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  // Single-item form quantity
  const [singleQty, setSingleQty] = useState(1)
  // Form state
  const [patientId, setPatientId] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [observation, setObservation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!itemId) { setLoading(false); return }

    const existingCart = loadCart()

    Promise.all([
      fetch(`/api/estoque/items/${itemId}`).then(r => r.json()),
      fetch('/api/patients').then(r => r.json()),
    ]).then(([itemData, patientsData]) => {
      const loadedItem: StockItem = itemData
      setItem(loadedItem)
      setPatients(Array.isArray(patientsData) ? patientsData : [])

      // If cart is active and this item came via QR scan, auto-add to cart
      if (existingCart.length > 0) {
        const already = existingCart.find(e => e.item.id === loadedItem.id)
        if (!already) {
          const newCart = [...existingCart, { item: loadedItem, quantity: 1 }]
          saveCart(newCart)
          setCart(newCart)
        } else {
          setCart(existingCart)
        }
        setStep('cart')
      } else {
        setStep('confirm')
      }

      setLoading(false)
    }).catch(() => setLoading(false))
  }, [itemId])

  // QR Scanner
  const stopScanner = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  const startScanner = useCallback(async () => {
    setScanError('')
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      const tick = () => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          // Extract item id from QR URL like /estoque/saida?item=123
          const match = code.data.match(/[?&]item=(\d+)/)
          if (match) {
            const scannedId = Number(match[1])
            stopScanner()
            fetch(`/api/estoque/items/${scannedId}`).then(r => r.json()).then((scannedItem: StockItem) => {
              setCart(prev => {
                const already = prev.find(e => e.item.id === scannedItem.id)
                const next = already
                  ? prev.map(e => e.item.id === scannedItem.id ? { ...e, quantity: e.quantity + 1 } : e)
                  : [...prev, { item: scannedItem, quantity: 1 }]
                saveCart(next)
                return next
              })
            }).catch(() => setScanError('Item não encontrado no estoque.'))
          } else {
            setScanError('QR Code não reconhecido. Escaneie um QR do estoque.')
            stopScanner()
          }
          return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setScanError('Não foi possível acessar a câmera.')
      setScanning(false)
    }
  }, [stopScanner])

  useEffect(() => () => stopScanner(), [stopScanner])

  function enterCartMode() {
    if (!item) return
    const newCart = [{ item, quantity: 1 }]
    saveCart(newCart)
    setCart(newCart)
    setStep('cart')
  }

  function updateCartQty(id: number, qty: number) {
    setCart(prev => {
      const next = qty < 1
        ? prev.filter(e => e.item.id !== id)
        : prev.map(e => e.item.id === id ? { ...e, quantity: qty } : e)
      saveCart(next)
      return next
    })
  }

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(patientSearch.toLowerCase())
  )
  const selectedPatient = patients.find(p => String(p.id) === patientId)

  async function handleSubmit() {
    setSaving(true); setError('')
    const itemsToSubmit = cart.length > 0 ? cart : (item ? [{ item, quantity: singleQty }] : [])
    if (itemsToSubmit.length === 0) return

    try {
      await Promise.all(itemsToSubmit.map(entry =>
        fetch('/api/estoque/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: entry.item.id,
            type: 'saida',
            quantity: entry.quantity,
            patient_id: patientId ? Number(patientId) : null,
            patient_name: selectedPatient?.name ?? null,
            observation: observation || null,
          }),
        })
      ))
      clearCart()
      setStep('done')
    } catch {
      setError('Erro ao registrar saída.')
    }
    setSaving(false)
  }

  function reset() {
    clearCart()
    setCart([])
    setSingleQty(1)
    setStep('confirm')
    setPatientId(''); setPatientSearch(''); setObservation(''); setError('')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    </div>
  )

  if (!itemId || (!item && step !== 'cart')) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <div>
        <p className="text-5xl mb-3">❌</p>
        <p className="text-gray-600 font-medium">Medicação não encontrada.</p>
        <p className="text-sm text-gray-400 mt-1">QR Code inválido ou medicação removida.</p>
      </div>
    </div>
  )

  /* ── STEP: Confirmação inicial ── */
  if (step === 'confirm' && item) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-violet-600 px-6 py-5 text-white text-center">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">Saída de Estoque</p>
          <h1 className="text-xl font-bold leading-tight">{item.name}</h1>
          {item.lot && <p className="text-sm opacity-75 mt-0.5">Lote: {item.lot}{item.expiry_date ? ` · Val: ${item.expiry_date}` : ''}</p>}
        </div>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-800">{item.quantity}</p>
            <p className="text-xs text-gray-400">{item.unit} em estoque</p>
          </div>
        </div>
        <div className="px-6 py-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700 text-center mb-4">Deseja registrar a saída desta medicação?</p>
          <button onClick={() => setStep('form')}
            className="w-full py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 active:bg-violet-800 transition-colors text-sm">
            ✅ Só este item
          </button>
          <button onClick={enterCartMode}
            className="w-full py-3.5 bg-white border-2 border-violet-300 text-violet-700 font-semibold rounded-xl hover:bg-violet-50 transition-colors text-sm">
            🛒 Adicionar mais itens
          </button>
          <button onClick={() => window.close()}
            className="w-full py-3 text-gray-400 text-sm hover:text-gray-600 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )

  /* ── STEP: Carrinho ── */
  if (step === 'cart') return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-6">
      <div className="w-full max-w-sm space-y-4">

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-violet-600 px-6 py-4 text-white text-center">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-0.5">Carrinho de Saída</p>
            <p className="text-sm opacity-75">{cart.length} {cart.length === 1 ? 'item' : 'itens'} adicionados</p>
          </div>

          <div className="divide-y divide-gray-100">
            {cart.map(entry => (
              <div key={entry.item.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{entry.item.name}</p>
                  {entry.item.lot && <p className="text-xs text-gray-400">Lote: {entry.item.lot}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => updateCartQty(entry.item.id, entry.quantity - 1)}
                    className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:border-violet-400 hover:text-violet-600 text-lg leading-none flex items-center justify-center">−</button>
                  <span className="w-8 text-center text-sm font-bold text-gray-800">{entry.quantity}</span>
                  <button onClick={() => updateCartQty(entry.item.id, entry.quantity + 1)}
                    className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:border-violet-400 hover:text-violet-600 text-lg leading-none flex items-center justify-center">+</button>
                  <button onClick={() => updateCartQty(entry.item.id, 0)}
                    className="w-7 h-7 rounded-full border border-red-100 text-red-400 hover:bg-red-50 text-xs flex items-center justify-center ml-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scanner */}
        {scanning ? (
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} className="w-full rounded-2xl" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 border-4 border-white rounded-2xl opacity-60" />
            </div>
            <button onClick={stopScanner}
              className="absolute top-3 right-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
              Cancelar
            </button>
            <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs opacity-80">Aponte para o QR code do item</p>
          </div>
        ) : (
          <button onClick={startScanner}
            className="w-full py-3.5 bg-white border-2 border-violet-300 text-violet-700 font-semibold rounded-xl hover:bg-violet-50 transition-colors text-sm">
            📷 Escanear próximo item
          </button>
        )}

        {scanError && <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-4 py-2">{scanError}</p>}

        {cart.length > 0 && (
          <button onClick={() => setStep('form')}
            className="w-full py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors text-sm">
            ✅ Finalizar saída ({cart.length} {cart.length === 1 ? 'item' : 'itens'})
          </button>
        )}

        <button onClick={reset} className="w-full py-2 text-gray-400 text-sm hover:text-gray-600 transition-colors">
          Cancelar e limpar carrinho
        </button>
      </div>
    </div>
  )

  /* ── STEP: Formulário (único ou carrinho) ── */
  if (step === 'form') {
    const formItems = cart.length > 0 ? cart : (item ? [{ item, quantity: 1 }] : [])
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-violet-600 px-6 py-4 text-white">
            <button onClick={() => setStep(cart.length > 0 ? 'cart' : 'confirm')}
              className="text-xs opacity-75 hover:opacity-100 mb-2 flex items-center gap-1">← Voltar</button>
            <h1 className="text-lg font-bold">
              {cart.length > 0 ? `Saída de ${cart.length} itens` : item?.name}
            </h1>
            {cart.length === 0 && item?.lot && <p className="text-xs opacity-75">Lote: {item.lot}</p>}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Resumo do carrinho */}
            {cart.length > 0 && (
              <div className="bg-violet-50 rounded-xl px-4 py-3 space-y-1.5">
                {formItems.map(e => (
                  <div key={e.item.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 truncate flex-1">{e.item.name}</span>
                    <span className="text-violet-700 font-semibold ml-2 shrink-0">{e.quantity} {e.item.unit}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quantidade (só no modo item único) */}
            {cart.length === 0 && item && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3 text-center">Quantidade</label>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setSingleQty(q => Math.max(1, q - 1))}
                    className="w-12 h-12 rounded-full border-2 border-gray-200 text-2xl font-bold text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center">−</button>
                  <input type="number" min="1" value={singleQty}
                    onChange={e => setSingleQty(Math.max(1, Number(e.target.value)))}
                    className="w-24 text-center text-3xl font-bold text-gray-800 border-2 border-gray-200 rounded-xl py-2 focus:outline-none focus:border-violet-400" />
                  <button onClick={() => setSingleQty(q => q + 1)}
                    className="w-12 h-12 rounded-full border-2 border-gray-200 text-2xl font-bold text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center">+</button>
                </div>
                <p className="text-center text-xs text-gray-400 mt-2">{item.unit} · estoque atual: {item.quantity}</p>
              </div>
            )}

            {/* Paciente */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Paciente <span className="text-gray-400">(opcional)</span></label>
              {patientId ? (
                <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                  <span className="text-sm font-medium text-violet-800 flex-1">{selectedPatient?.name}</span>
                  <button onClick={() => { setPatientId(''); setPatientSearch('') }} className="text-violet-400 hover:text-violet-600 text-sm">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <input type="text" value={patientSearch} onChange={e => setPatientSearch(e.target.value)}
                    placeholder="Buscar paciente..."
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  {patientSearch && filteredPatients.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {filteredPatients.slice(0, 8).map(p => (
                        <button key={p.id} onClick={() => { setPatientId(String(p.id)); setPatientSearch('') }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 hover:text-violet-700 transition-colors border-b border-gray-50 last:border-0">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {patientSearch && filteredPatients.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1 px-1">Nenhum paciente encontrado</p>
                  )}
                </div>
              )}
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
              <textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2} placeholder="Ex: uso na consulta"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
            </div>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            <button onClick={handleSubmit} disabled={saving}
              className="w-full py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {saving ? 'Registrando...' : cart.length > 0
                ? `Confirmar saída de ${cart.length} ${cart.length === 1 ? 'item' : 'itens'}`
                : `Confirmar saída`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── STEP: Sucesso ── */
  const doneItems = cart.length > 0 ? cart : (item ? [{ item, quantity: 1 }] : [])
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-3">
          {doneItems.length > 1 ? 'Saídas registradas!' : 'Saída registrada!'}
        </h2>
        <div className="space-y-1 mb-2">
          {doneItems.map(e => (
            <p key={e.item.id} className="text-gray-500 text-sm">{e.item.name} · {e.quantity} {e.item.unit}</p>
          ))}
        </div>
        {selectedPatient && <p className="text-gray-400 text-sm mt-1">Paciente: {selectedPatient.name}</p>}
        <button onClick={reset} className="mt-6 w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors">
          Registrar outra saída
        </button>
      </div>
    </div>
  )
}

export default function SaidaPage() {
  return <Suspense><SaidaForm /></Suspense>
}
