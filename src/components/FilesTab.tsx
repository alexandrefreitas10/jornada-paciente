'use client'

import { useState, useRef } from 'react'
import { NotesSection } from './NotesSection'
import { DeletedItemsButton } from './DeletedItemsButton'
import { CropEditor, FULL_CROP, type CropRect } from './CropEditor'
import { baixarBlob, gerarMontagem, salvarMontagem } from '@/lib/montagem-canvas'

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
  created_by?: string | null
}

// URL estável (mesma origem) que gera uma URL assinada FRESCA a cada request.
// Ao contrário de f.url (assinada no carregamento da página, expira em 15 min),
// esta nunca expira — usada para abrir e como fallback quando a miniatura vence.
const proxyDownload = (patientId: number, fileId: number) =>
  `/api/patients/${patientId}/files/${fileId}/download?proxy=1`

// ── Imagem cortada (preview) ─────────────────────────────────────────────────

function CroppedPreview({ url, crop, alt, fallback }: { url: string; crop: CropRect; alt: string; fallback?: string }) {
  return (
    <div style={{ position: 'relative', paddingBottom: `${(crop.h / crop.w) * 100}%`, overflow: 'hidden' }}
      className="rounded-xl border border-gray-200">
      <img src={url} alt={alt} draggable={false} onError={fallback ? e => { if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback } : undefined} style={{
        position: 'absolute',
        left: `${-crop.x / crop.w * 100}%`,
        top: `${-crop.y / crop.h * 100}%`,
        width: `${100 / crop.w}%`,
      }} />
    </div>
  )
}

// ── FilesTab ─────────────────────────────────────────────────────────────────

interface Props {
  patientId: number
  fileType: 'photo' | 'bioimpedance' | 'diet' | 'prescricao'
  initialFiles: FileRecord[]
  readOnly?: boolean
}

export function FilesTab({ patientId, fileType, initialFiles, readOnly = false }: Props) {
  const [files, setFiles] = useState<FileRecord[]>(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Seleção
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<number[]>([])

  // Enquadramento
  const [cropPhase, setCropPhase] = useState(false)
  const [cropPics, setCropPics] = useState<FileRecord[]>([])
  const [cropRects, setCropRects] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])

  // Comparação final
  const [comparing, setComparing] = useState<FileRecord[]>([])
  const [finalCrops, setFinalCrops] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])

  // Montagem guardada na aba Fotos. Enquanto `montagemId` for null o próximo
  // clique grava; depois disso o clique só baixa de novo, porque é a MESMA
  // montagem e não uma nova. Mudar o enquadramento zera o id (ver zerarMontagem).
  const [montagemId, setMontagemId] = useState<number | null>(null)
  const [salvandoMontagem, setSalvandoMontagem] = useState(false)
  const [erroMontagem, setErroMontagem] = useState<string | null>(null)
  // O PNG já gerado fica aqui para o "tentar de novo" só repetir o POST: ele não
  // deve desenhar nem baixar outra vez, o dono já está com o arquivo na mão.
  const montagemPendente = useRef<{ png: Blob; thumb: Blob; dataAntes: string; dataDepois: string } | null>(null)

  const isPhoto = fileType === 'photo'
  const accept = isPhoto ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.xls,.xlsx'
  const label = isPhoto ? '📷 Enviar foto' : fileType === 'diet' ? '🥗 Enviar dieta' : fileType === 'prescricao' ? '📋 Enviar prescrição' : '📎 Enviar arquivo'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', fileType)
      const res = await fetch(`/api/patients/${patientId}/files`, { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erro ao enviar arquivo')
      }
      const created: FileRecord = await res.json()
      setFiles((prev) => [created, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este arquivo?')) return
    await fetch(`/api/patients/${patientId}/files/${id}`, { method: 'DELETE' })
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function handleDownload(id: number) {
    window.location.href = `/api/patients/${patientId}/files/${id}/download`
  }

  function handleDownloadAll() {
    window.location.href = `/api/patients/${patientId}/files/download-all?type=${fileType}`
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function toggleSelect(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }

  function startCrop() {
    const pics = selected.map(id => files.find(f => f.id === id)!).filter(Boolean)
    setCropPics(pics)
    setCropRects([{ ...FULL_CROP }, { ...FULL_CROP }])
    setCropPhase(true)
  }

  function confirmCrops() {
    setComparing(cropPics)
    setFinalCrops(cropRects)
    setCropPhase(false)
  }

  // Esquece a montagem já guardada: o próximo clique volta a gravar. Usado ao
  // fechar e ao voltar para o enquadramento, porque recorte diferente é outra
  // montagem — e não uma segunda cópia da mesma.
  function zerarMontagem() {
    setMontagemId(null)
    setErroMontagem(null)
    montagemPendente.current = null
  }

  function exitAll() {
    setComparing([]); setSelected([]); setCompareMode(false)
    setCropPhase(false); setCropPics([])
    setCropRects([{ ...FULL_CROP }, { ...FULL_CROP }])
    setFinalCrops([{ ...FULL_CROP }, { ...FULL_CROP }])
    zerarMontagem()
  }

  // Só o POST. Separado do clique porque o "tentar de novo" repete apenas esta
  // parte: a imagem já foi desenhada e já foi baixada.
  async function guardarEmFotos(dados: NonNullable<typeof montagemPendente.current>) {
    setSalvandoMontagem(true)
    setErroMontagem(null)
    try {
      const id = await salvarMontagem({
        png: dados.png,
        thumb: dados.thumb,
        identidade: 'fotos',
        patientId,
        dataAntes: dados.dataAntes,
        dataDepois: dados.dataDepois,
      })
      setMontagemId(id)
      montagemPendente.current = null
    } catch (err) {
      montagemPendente.current = dados
      setErroMontagem(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSalvandoMontagem(false)
    }
  }

  async function handleDownloadComparison() {
    const [a, b] = comparing
    const [cA, cB] = finalCrops

    // O carregamento fica aqui, e não no módulo de montagem, porque a rota é a
    // do paciente: `?proxy=1` faz stream do S3 pela PRÓPRIA origem, senão a
    // imagem suja o canvas e o `toBlob` passa a lançar erro de segurança.
    const loadImageFromApi = async (id: number): Promise<HTMLImageElement> => {
      const res = await fetch(`/api/patients/${patientId}/files/${id}/download?proxy=1`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => { resolve(img); URL.revokeObjectURL(blobUrl) }
        img.onerror = reject
        img.src = blobUrl
      })
    }

    try {
      const [imgA, imgB] = await Promise.all([
        loadImageFromApi(a.id),
        loadImageFromApi(b.id),
      ])

      // `gerarMontagem` não confere se a imagem carregou: altura zero divide por
      // zero e sai como Infinity, falhando lá dentro, longe daqui. A garantia é
      // de quem chama — e cair no catch abaixo dá a mensagem que o dono entende.
      if (!imgA.naturalWidth || !imgA.naturalHeight || !imgB.naturalWidth || !imgB.naturalHeight) {
        throw new Error('Imagem não carregou')
      }

      const { png, thumb } = await gerarMontagem({
        identidade: 'fotos',
        antes: { img: imgA, recorte: cA, data: a.created_at },
        depois: { img: imgB, recorte: cB, data: b.created_at },
      })

      // Baixa PRIMEIRO. Se o POST falhar depois, o dono já está com a imagem na
      // mão, que é o que ele precisa no momento.
      baixarBlob(png, 'comparacao-antes-depois.png')

      if (montagemId === null) {
        await guardarEmFotos({ png, thumb, dataAntes: a.created_at, dataDepois: b.created_at })
      }
    } catch {
      alert('Não foi possível gerar a imagem. Tente novamente.')
    }
  }

  // ── Tela de enquadramento ────────────────────────────────────────────────────
  if (cropPhase && cropPics.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Enquadrar fotos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Arraste e redimensione a caixa para definir o recorte de cada foto</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmCrops}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              ✓ Confirmar enquadramento
            </button>
            <button
              onClick={() => { setCropPhase(false); setCropPics([]) }}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {cropPics.map((f, i) => (
            <CropEditor
              key={f.id}
              url={f.url}
              fallback={proxyDownload(patientId, f.id)}
              label={i === 0 ? 'Antes' : 'Depois'}
              crop={cropRects[i]}
              onChange={(r) => setCropRects(prev => {
                const next: [CropRect, CropRect] = [...prev] as [CropRect, CropRect]
                next[i] = r
                return next
              })}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Tela de comparação final ─────────────────────────────────────────────────
  if (comparing.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Comparação — Antes e Depois</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCropPhase(true); setCropPics(comparing); setCropRects(finalCrops); setComparing([]); zerarMontagem() }}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ✂️ Ajustar recorte
            </button>
            <button
              onClick={handleDownloadComparison}
              disabled={salvandoMontagem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {salvandoMontagem ? '💾 Salvando...' : '💾 Baixar e salvar em Fotos'}
            </button>
            <button
              onClick={exitAll}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ✕ Fechar
            </button>
          </div>
        </div>

        {montagemId !== null && !erroMontagem && (
          <p className="text-xs text-green-700">✓ Guardado na aba Fotos.</p>
        )}

        {erroMontagem && (
          <div className="flex items-center gap-3 flex-wrap p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              Baixado, mas não foi guardado na aba Fotos: {erroMontagem}
            </p>
            <button
              onClick={() => { if (montagemPendente.current) guardarEmFotos(montagemPendente.current) }}
              disabled={salvandoMontagem}
              className="px-3 py-1.5 border border-amber-300 text-amber-900 text-sm font-medium rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              Tentar de novo
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {comparing.map((f, i) => (
            <div key={f.id} className="space-y-1">
              <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">
                {i === 0 ? 'Antes' : 'Depois'}
              </p>
              <CroppedPreview url={f.url} fallback={proxyDownload(patientId, f.id)} crop={finalCrops[i]} alt={f.original_name} />
              <p className="text-xs text-center text-gray-400">{formatDate(f.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Lista/grade normal ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        {!readOnly && <DeletedItemsButton patientId={patientId} entityTypes={['file']} fileType={fileType} />}
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
        {!readOnly && !compareMode && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Enviando...
              </>
            ) : label}
          </button>
        )}

        {isPhoto && files.length >= 2 && (
          <>
            {!compareMode ? (
              <button
                onClick={() => setCompareMode(true)}
                className="px-4 py-2 border border-violet-300 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-50 transition-colors"
              >
                🔍 Comparar fotos
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-600">
                  {selected.length === 0 && 'Selecione 2 fotos para comparar'}
                  {selected.length === 1 && 'Selecione mais 1 foto'}
                  {selected.length === 2 && '2 fotos selecionadas'}
                </p>
                <button
                  onClick={startCrop}
                  disabled={selected.length !== 2}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Enquadrar e comparar
                </button>
                <button
                  onClick={() => { setCompareMode(false); setSelected([]) }}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}

        {files.length > 0 && !compareMode && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            ⬇️ Baixar todos
          </button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum arquivo ainda. {isPhoto ? 'Envie uma foto.' : 'Envie um arquivo.'}
        </p>
      ) : isPhoto ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((f) => {
            const isSelected = selected.includes(f.id)
            const selIndex = selected.indexOf(f.id)
            return (
              <div
                key={f.id}
                className={`relative group rounded-xl overflow-hidden border-2 transition-colors ${
                  compareMode
                    ? isSelected ? 'border-violet-500 cursor-pointer' : 'border-gray-200 cursor-pointer hover:border-violet-300'
                    : 'border-gray-200'
                }`}
                onClick={compareMode ? () => toggleSelect(f.id) : undefined}
              >
                {compareMode && (
                  <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-400 border border-gray-300'
                  }`}>
                    {isSelected ? selIndex + 1 : ''}
                  </div>
                )}

                {!compareMode ? (
                  <a href={proxyDownload(patientId, f.id)} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.original_name}
                      onError={e => { const u = proxyDownload(patientId, f.id); if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u }}
                      className="w-full h-40 object-cover hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={f.url} alt={f.original_name}
                    onError={e => { const u = proxyDownload(patientId, f.id); if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u }}
                    className={`w-full h-40 object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-70'}`} />
                )}

                <div className="p-2 bg-white flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate">{formatDate(f.created_at)}</p>
                    {f.created_by && <p className="text-xs text-gray-400 truncate">por {f.created_by}</p>}
                  </div>
                  {!compareMode && (
                    <button onClick={() => handleDownload(f.id)} className="text-xs text-violet-600 hover:text-violet-800 shrink-0" title="Baixar">
                      ⬇️
                    </button>
                  )}
                </div>

                {!readOnly && !compareMode && (
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Apagar"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.original_name)
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-2xl">{isImage ? '🖼️' : '📄'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.original_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(f.created_at)}
                    {f.created_by && ` · por ${f.created_by}`}
                  </p>
                </div>
                <a href={proxyDownload(patientId, f.id)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-violet-600 hover:underline font-medium shrink-0">
                  Abrir
                </a>
                <button onClick={() => handleDownload(f.id)} className="text-xs text-violet-600 hover:text-violet-800 shrink-0" title="Baixar">
                  ⬇️
                </button>
                {!readOnly && (
                  <button onClick={() => handleDelete(f.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0" title="Apagar">
                    🗑️
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <NotesSection patientId={patientId} tab={fileType} readOnly={readOnly} />
    </div>
  )
}
