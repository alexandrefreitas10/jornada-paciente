'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'

interface StockItem { id: number; name: string; unit: string; quantity: number; notes: string | null; lot: string | null; expiry_date: string | null }
interface StockMovement {
  id: number; item_id: number; item_name: string; type: 'entrada' | 'saida'
  quantity: number; lot: string | null; expiry_date: string | null
  patient_name: string | null; observation: string | null; created_by: string | null; created_at: string
}
interface NfItem { name: string; quantity: number; unit: string; lot: string | null; expiry_date: string | null }

type Tab = 'estoque' | 'entradas' | 'saidas'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── QR Code modal ──────────────────────────────────────────────
function QrModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, `${baseUrl}/estoque/saida?item=${item.id}`, { width: 220, margin: 2 })
    }
  }, [item.id, baseUrl])

  function handlePrint() {
    const canvas = canvasRef.current
    if (!canvas) return
    const win = window.open('', '_blank')
    if (!win) return

    const body = win.document.body
    body.style.cssText = 'text-align:center;font-family:sans-serif;padding:20px'

    const h2 = win.document.createElement('h2')
    h2.style.marginBottom = '4px'
    h2.textContent = item.name

    const p = win.document.createElement('p')
    p.style.cssText = 'color:#666;margin-bottom:16px'
    p.textContent = 'Escaneie para registrar saída'

    const img = win.document.createElement('img')
    img.src = canvas.toDataURL()
    img.style.width = '220px'

    body.appendChild(h2)
    body.appendChild(p)
    body.appendChild(img)

    win.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl">
        <h3 className="font-bold text-gray-800 text-lg mb-1">{item.name}</h3>
        <p className="text-sm text-gray-500 mb-4">Escaneie para registrar saída</p>
        <canvas ref={canvasRef} className="mx-auto rounded-lg" />
        <div className="flex gap-2 mt-4">
          <button onClick={handlePrint} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">🖨️ Imprimir</button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit item modal ───────────────────────────────────────────
function EditItemModal({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: (item: StockItem) => void }) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [lot, setLot] = useState(item.lot ?? '')
  const [expiry, setExpiry] = useState(item.expiry_date ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    // Save name/unit/notes
    await fetch(`/api/estoque/items/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unit, notes: notes || null }),
    })
    // Adjust quantity if changed
    const targetQty = Number(quantity)
    if (targetQty !== item.quantity || lot !== (item.lot ?? '') || expiry !== (item.expiry_date ?? '')) {
      await fetch(`/api/estoque/items/${item.id}/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_quantity: targetQty, lot: lot || null, expiry_date: expiry || null }),
      })
    }
    const res = await fetch(`/api/estoque/items/${item.id}`)
    if (res.ok) { onSaved(await res.json()) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="font-bold text-gray-800 text-lg mb-4">Editar Medicação</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidade</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade</label>
              <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Lote</label>
              <input value={lot} onChange={e => setLot(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Validade</label>
              <input value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="MM/AAAA" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} disabled={saving || !name} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit movement modal ───────────────────────────────────────
function EditMovementModal({ mov, onClose, onSaved }: { mov: StockMovement; onClose: () => void; onSaved: (m: StockMovement) => void }) {
  const [quantity, setQuantity] = useState(String(mov.quantity))
  const [lot, setLot] = useState(mov.lot ?? '')
  const [expiry, setExpiry] = useState(mov.expiry_date ?? '')
  const [patient, setPatient] = useState(mov.patient_name ?? '')
  const [obs, setObs] = useState(mov.observation ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/estoque/movements/${mov.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Number(quantity), lot: lot || null, expiry_date: expiry || null, patient_name: patient || null, observation: obs || null }),
    })
    if (res.ok) { onSaved(await res.json()) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="font-bold text-gray-800 text-lg mb-1">Editar {mov.type === 'entrada' ? 'Entrada' : 'Saída'}</h3>
        <p className="text-sm text-gray-500 mb-4">{mov.item_name}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade *</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          {mov.type === 'entrada' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lote</label>
                <input value={lot} onChange={e => setLot(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Validade</label>
                <input value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="MM/AAAA" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </div>
            </>
          )}
          {mov.type === 'saida' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paciente</label>
              <input value={patient} onChange={e => setPatient(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <input value={obs} onChange={e => setObs(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function EstoqueClient({ initialItems, initialMovements }: { initialItems: StockItem[]; initialMovements: StockMovement[] }) {
  const [tab, setTab] = useState<Tab>('estoque')
  const [items, setItems] = useState(initialItems)
  const [movements, setMovements] = useState(initialMovements)
  const [qrItem, setQrItem] = useState<StockItem | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [editMov, setEditMov] = useState<StockMovement | null>(null)
  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState<{ id: number; name: string }[]>([])
  const [showReset, setShowReset] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    fetch('/api/patients').then(r => r.json()).then(data => {
      setPatients(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [])

  // ── Entrada por NF / Estoque ────────────────────────────────
  const [nfLoading, setNfLoading] = useState(false)
  const [nfItems, setNfItems] = useState<NfItem[]>([])
  const [nfError, setNfError] = useState('')
  const nfInputRef = useRef<HTMLInputElement>(null)
  const invInputRef = useRef<HTMLInputElement>(null)

  async function handleNfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNfLoading(true); setNfError(''); setNfItems([])
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/estoque/scan-nf', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.items?.length) { setNfItems(data.items) }
    else { setNfError('Não foi possível extrair itens. Tente uma imagem mais nítida.') }
    setNfLoading(false)
    if (nfInputRef.current) nfInputRef.current.value = ''
  }

  async function handleInventoryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNfLoading(true); setNfError(''); setNfItems([])
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/estoque/scan-nf?mode=inventory', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.items?.length) { setNfItems(data.items) }
    else { setNfError(`Não foi possível extrair itens.${data.parseError ? ' Erro: ' + String(data.parseError) : ''}${data.raw ? ' | Raw: ' + String(data.raw).slice(0, 200) : ''}`) }
    setNfLoading(false)
    if (invInputRef.current) invInputRef.current.value = ''
  }

  async function saveNfItems() {
    for (const nfItem of nfItems) {
      // Find or create stock item
      let stockItem = items.find(i => i.name.toLowerCase() === nfItem.name.toLowerCase())
      if (!stockItem) {
        const res = await fetch('/api/estoque/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nfItem.name, unit: nfItem.unit || 'un' }),
        })
        if (res.ok) { stockItem = await res.json(); setItems(prev => [...prev, stockItem!]) }
      }
      if (!stockItem) continue
      await fetch('/api/estoque/movements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: stockItem.id, type: 'entrada', quantity: nfItem.quantity, lot: nfItem.lot, expiry_date: nfItem.expiry_date }),
      })
    }
    // Refresh
    const [itemsRes, movsRes] = await Promise.all([fetch('/api/estoque/items'), fetch('/api/estoque/movements')])
    setItems(await itemsRes.json())
    setMovements(await movsRes.json())
    setNfItems([])
    setTab('entradas')
  }

  // ── Manual entrada ──────────────────────────────────────────
  const [manEntrada, setManEntrada] = useState(false)
  const [meItemId, setMeItemId] = useState('')
  const [meNewName, setMeNewName] = useState('')
  const [meUnit, setMeUnit] = useState('un')
  const [meQty, setMeQty] = useState('1')
  const [meLot, setMeLot] = useState('')
  const [meExpiry, setMeExpiry] = useState('')
  const [meObs, setMeObs] = useState('')
  const [meSaving, setMeSaving] = useState(false)
  const [meIsNew, setMeIsNew] = useState(false)

  async function saveManualEntrada() {
    setMeSaving(true)
    let itemId = Number(meItemId)
    if (meIsNew && meNewName) {
      const res = await fetch('/api/estoque/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: meNewName, unit: meUnit }) })
      if (res.ok) { const ni = await res.json(); itemId = ni.id; setItems(p => [...p, ni]) }
    }
    if (!itemId) { setMeSaving(false); return }
    await fetch('/api/estoque/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, type: 'entrada', quantity: Number(meQty), lot: meLot || null, expiry_date: meExpiry || null, observation: meObs || null }) })
    const [ir, mr] = await Promise.all([fetch('/api/estoque/items'), fetch('/api/estoque/movements')])
    setItems(await ir.json()); setMovements(await mr.json())
    setManEntrada(false); setMeItemId(''); setMeNewName(''); setMeQty('1'); setMeLot(''); setMeExpiry(''); setMeObs(''); setMeIsNew(false)
    setMeSaving(false)
  }

  // ── Manual saída ────────────────────────────────────────────
  const [manSaida, setManSaida] = useState(false)
  const [msItemId, setMsItemId] = useState('')
  const [msItemSearch, setMsItemSearch] = useState('')
  const [msQty, setMsQty] = useState('1')
  const [msPatientId, setMsPatientId] = useState('')
  const [msObs, setMsObs] = useState('')
  const [msSaving, setMsSaving] = useState(false)

  async function saveManualSaida() {
    setMsSaving(true)
    const selPatient = patients.find(p => String(p.id) === msPatientId)
    await fetch('/api/estoque/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: Number(msItemId), type: 'saida', quantity: Number(msQty), patient_id: msPatientId ? Number(msPatientId) : null, patient_name: selPatient?.name ?? null, observation: msObs || null }) })
    const [ir, mr] = await Promise.all([fetch('/api/estoque/items'), fetch('/api/estoque/movements')])
    setItems(await ir.json()); setMovements(await mr.json())
    setManSaida(false); setMsItemId(''); setMsItemSearch(''); setMsQty('1'); setMsPatientId(''); setMsObs('')
    setMsSaving(false)
  }

  async function deleteItem(id: number) {
    if (!confirm('Excluir este item e todas as suas movimentações?')) return
    await fetch(`/api/estoque/items/${id}`, { method: 'DELETE' })
    setItems(p => p.filter(i => i.id !== id))
    setMovements(p => p.filter(m => m.item_id !== id))
  }

  async function deleteMovement(id: number) {
    if (!confirm('Excluir esta movimentação?')) return
    await fetch(`/api/estoque/movements/${id}`, { method: 'DELETE' })
    setMovements(p => p.filter(m => m.id !== id))
    // Refresh items to update quantities
    fetch('/api/estoque/items').then(r => r.json()).then(setItems)
  }

  async function handleReset() {
    setResetLoading(true); setResetError('')
    const res = await fetch('/api/estoque/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setResetError(data.error || 'Erro ao zerar estoque'); setResetLoading(false); return }
    setItems([]); setMovements([])
    setShowReset(false); setResetPassword(''); setResetError('')
    setResetLoading(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'estoque', label: '📦 Estoque Atual' },
    { key: 'entradas', label: '⬆️ Entradas' },
    { key: 'saidas', label: '⬇️ Saídas' },
  ]

  const entries = movements.filter(m => m.type === 'entrada')
  const exits = movements.filter(m => m.type === 'saida')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Estoque</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MODAL ZERAR ESTOQUE ── */}
      {showReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-800 text-lg mb-1">⚠️ Zerar Estoque</h3>
            <p className="text-sm text-gray-500 mb-4">Esta ação apaga <strong>todos</strong> os itens e movimentações. Digite a senha de admin para confirmar.</p>
            <input
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              placeholder="Senha de admin"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              autoFocus
            />
            {resetError && <p className="text-red-500 text-xs mb-2">{resetError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setShowReset(false); setResetPassword(''); setResetError('') }} className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={handleReset} disabled={resetLoading || !resetPassword} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {resetLoading ? 'Zerando...' : 'Zerar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA ESTOQUE ATUAL ── */}
      {tab === 'estoque' && (
        <div>
          {/* Busca + botão zerar */}
          <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar medicação..."
              className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowReset(true)}
            title="Zerar estoque"
            className="flex-shrink-0 px-3 py-2.5 bg-red-50 border border-red-200 text-red-500 rounded-xl hover:bg-red-100 transition-colors text-base"
          >
            🗑️
          </button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">📦</p>
              <p>Nenhuma medicação cadastrada ainda.</p>
              <p className="text-sm mt-1">Use a aba Entradas para adicionar itens.</p>
            </div>
          ) : (() => {
            const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
            return filtered.length === 0 ? (
              <p className="text-center py-10 text-sm text-gray-400">Nenhuma medicação encontrada para "{search}".</p>
            ) : (
              <div className="space-y-3">
                {filtered.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-start gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{item.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {item.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium">{item.lot}</span></p>}
                        {item.expiry_date && <p className="text-xs text-gray-500">Val: <span className="font-medium">{item.expiry_date}</span></p>}
                        {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                      </div>
                    </div>
                    <div className="text-right mr-2 shrink-0">
                      <p className={`text-xl font-bold ${item.quantity <= 0 ? 'text-red-500' : 'text-green-600'}`}>{item.quantity}</p>
                      <p className="text-xs text-gray-400">{item.unit}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setQrItem(item)} title="Gerar QR Code"
                        className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors text-lg">▦</button>
                      <button onClick={() => setEditItem(item)} title="Editar"
                        className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors text-sm">✏️</button>
                      <button onClick={() => deleteItem(item.id)} title="Excluir item"
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors text-sm">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── ABA ENTRADAS ── */}
      {tab === 'entradas' && (
        <div className="space-y-4">
          {/* Buttons */}
          <div className="flex gap-2 flex-wrap">
            <label className={`flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-violet-700 transition-colors ${nfLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              {nfLoading ? '⏳ Analisando...' : '📷 Enviar Nota Fiscal'}
              <input ref={nfInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleNfUpload} />
            </label>
            <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700 transition-colors ${nfLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              {nfLoading ? '⏳ Analisando...' : '📄 Importar Estoque'}
              <input ref={invInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleInventoryUpload} />
            </label>
            <button onClick={() => setManEntrada(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              ✏️ Entrada Manual
            </button>
          </div>
          {nfError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{nfError}</p>}

          {/* NF Preview */}
          {nfItems.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="font-semibold text-amber-800 mb-3">📋 Itens identificados na nota — revise antes de salvar:</p>
              <div className="space-y-2">
                {nfItems.map((ni, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 flex gap-2 flex-wrap items-center border border-amber-100">
                    <input value={ni.name} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      className="flex-1 min-w-[120px] border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Nome" />
                    <input type="number" value={ni.quantity} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))}
                      className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Qtd" />
                    <input value={ni.unit} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                      className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Un" />
                    <input value={ni.lot ?? ''} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, lot: e.target.value || null } : x))}
                      className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Lote" />
                    <input value={ni.expiry_date ?? ''} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, expiry_date: e.target.value || null } : x))}
                      className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="MM/AAAA" />
                    <button onClick={() => setNfItems(p => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={saveNfItems} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">✅ Confirmar Entrada</button>
                <button onClick={() => setNfItems([])} className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}

          {/* Manual entrada form */}
          {manEntrada && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="font-semibold text-gray-800 mb-3">Entrada Manual</p>
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-1.5 text-sm text-gray-600">
                    <input type="checkbox" checked={meIsNew} onChange={e => setMeIsNew(e.target.checked)} />
                    Nova medicação
                  </label>
                </div>
                {meIsNew ? (
                  <div className="flex gap-2">
                    <input value={meNewName} onChange={e => setMeNewName(e.target.value)} placeholder="Nome da medicação *" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    <input value={meUnit} onChange={e => setMeUnit(e.target.value)} placeholder="Unidade" className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  </div>
                ) : (
                  <select value={meItemId} onChange={e => setMeItemId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="">Selecione a medicação *</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.lot ? ` — Lote: ${i.lot}` : ''}</option>)}
                  </select>
                )}
                <div className="flex gap-2 flex-wrap">
                  <input type="number" min="1" value={meQty} onChange={e => setMeQty(e.target.value)} placeholder="Quantidade *" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <input value={meLot} onChange={e => setMeLot(e.target.value)} placeholder="Lote" className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <input value={meExpiry} onChange={e => setMeExpiry(e.target.value)} placeholder="Validade (MM/AAAA)" className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <input value={meObs} onChange={e => setMeObs(e.target.value)} placeholder="Observação" className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={saveManualEntrada} disabled={meSaving || (!meItemId && (!meIsNew || !meNewName))} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">{meSaving ? 'Salvando...' : 'Salvar Entrada'}</button>
                <button onClick={() => setManEntrada(false)} className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}

          {/* Entries list */}
          {entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📥</p><p>Nenhuma entrada registrada.</p></div>
          ) : (
            <div className="space-y-2">
              {entries.map(m => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex items-start gap-3">
                  <span className="text-2xl mt-0.5">📥</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{m.item_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <p className="text-xs text-gray-500">Qtd: <span className="font-semibold text-green-700">+{m.quantity}</span></p>
                      {m.lot && <p className="text-xs text-gray-500">Lote: {m.lot}</p>}
                      {m.expiry_date && <p className="text-xs text-gray-500">Val: {m.expiry_date}</p>}
                      {m.observation && <p className="text-xs text-gray-500">{m.observation}</p>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(m.created_at)}{m.created_by ? ` · ${m.created_by}` : ''}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditMov(m)} className="text-gray-400 hover:text-gray-600 text-sm p-1">✏️</button>
                    <button onClick={() => deleteMovement(m.id)} className="text-red-400 hover:text-red-600 text-sm p-1" title="Excluir">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA SAÍDAS ── */}
      {tab === 'saidas' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setManSaida(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">
              ✏️ Saída Manual
            </button>
            <p className="text-sm text-gray-500 self-center">ou escaneie o QR Code da medicação com o celular</p>
          </div>

          {/* Manual saída form */}
          {manSaida && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="font-semibold text-gray-800 mb-3">Saída Manual</p>
              <div className="space-y-3">
                {msItemId ? (
                  <div className="flex items-center gap-2 p-2.5 bg-violet-50 border border-violet-200 rounded-lg">
                    <span className="text-sm font-medium text-violet-800 flex-1">
                      {(() => { const i = items.find(x => String(x.id) === msItemId); return i ? `${i.name}${i.lot ? ` — Lote: ${i.lot}` : ''} (estoque: ${i.quantity} ${i.unit})` : '' })()}
                    </span>
                    <button onClick={() => { setMsItemId(''); setMsItemSearch('') }} className="text-violet-400 hover:text-violet-600 text-xs">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      value={msItemSearch} onChange={e => setMsItemSearch(e.target.value)}
                      placeholder="Buscar medicação *"
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    {msItemSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {items.filter(i => i.name.toLowerCase().includes(msItemSearch.toLowerCase())).length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400">Nenhuma medicação encontrada</p>
                        ) : items.filter(i => i.name.toLowerCase().includes(msItemSearch.toLowerCase())).map(i => (
                          <button key={i.id} onClick={() => { setMsItemId(String(i.id)); setMsItemSearch('') }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 border-b border-gray-50 last:border-0">
                            <span className="font-medium text-gray-800">{i.name}</span>
                            {i.lot && <span className="text-gray-500"> — Lote: {i.lot}</span>}
                            <span className="text-gray-400 text-xs ml-1">(estoque: {i.quantity} {i.unit})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <input type="number" min="1" value={msQty} onChange={e => setMsQty(e.target.value)} placeholder="Quantidade *" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <select value={msPatientId} onChange={e => setMsPatientId(e.target.value)} className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="">Paciente (opcional)</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input value={msObs} onChange={e => setMsObs(e.target.value)} placeholder="Observação" className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={saveManualSaida} disabled={msSaving || !msItemId} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">{msSaving ? 'Salvando...' : 'Salvar Saída'}</button>
                <button onClick={() => setManSaida(false)} className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}

          {exits.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📤</p><p>Nenhuma saída registrada.</p></div>
          ) : (
            <div className="space-y-2">
              {exits.map(m => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex items-start gap-3">
                  <span className="text-2xl mt-0.5">📤</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{m.item_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <p className="text-xs text-gray-500">Qtd: <span className="font-semibold text-red-600">-{m.quantity}</span></p>
                      {m.patient_name && <p className="text-xs text-gray-500">Paciente: {m.patient_name}</p>}
                      {m.observation && <p className="text-xs text-gray-500">{m.observation}</p>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(m.created_at)}{m.created_by ? ` · ${m.created_by}` : ''}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditMov(m)} className="text-gray-400 hover:text-gray-600 text-sm p-1">✏️</button>
                    <button onClick={() => deleteMovement(m.id)} className="text-red-400 hover:text-red-600 text-sm p-1" title="Excluir">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {qrItem && <QrModal item={qrItem} onClose={() => setQrItem(null)} />}
      {editItem && (
        <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={updated => {
          setItems(p => p.map(i => i.id === updated.id ? updated : i))
          setEditItem(null)
        }} />
      )}
      {editMov && (
        <EditMovementModal mov={editMov} onClose={() => setEditMov(null)} onSaved={updated => {
          setMovements(p => p.map(m => m.id === updated.id ? { ...m, ...updated } : m))
          setEditMov(null)
        }} />
      )}
    </div>
  )
}
