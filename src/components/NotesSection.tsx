'use client'

import { useState, useEffect, useRef } from 'react'

interface Note {
  id: number
  content: string
  created_by: string
  created_at: string
}

interface Props {
  patientId: number
  tab: string
}

export function NotesSection({ patientId, tab }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    fetch(`/api/patients/${patientId}/tab-notes?tab=${tab}`)
      .then(r => r.json())
      .then(setNotes)
      .catch(() => {})
  }, [open, patientId, tab])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/tab-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, content: text }),
      })
      if (res.ok) {
        const note: Note = await res.json()
        setNotes(prev => [...prev, note])
        setText('')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/patients/${patientId}/tab-notes/${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="border-t border-gray-100 mt-6 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className="text-base">📝</span>
        Observações
        {notes.length > 0 && !open && (
          <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {notes.length === 0 && (
            <p className="text-xs text-gray-400 italic">Nenhuma observação ainda.</p>
          )}

          {notes.map(note => (
            <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {note.created_by} · {formatDate(note.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                title="Apagar observação"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave() }}
              placeholder="Escrever observação…"
              rows={2}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
              className="px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors shrink-0"
            >
              {saving ? '…' : 'Salvar'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Ctrl+Enter para salvar rapidamente</p>
        </div>
      )}
    </div>
  )
}
