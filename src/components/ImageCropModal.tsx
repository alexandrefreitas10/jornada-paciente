'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface Rect { x: number; y: number; w: number; h: number }

interface Props {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

export function ImageCropModal({ file, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [drag, setDrag] = useState<{ start: { x: number; y: number } } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  // scale from canvas display size to natural image size
  const scaleRef = useRef({ x: 1, y: 1 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current
    const img = imgRef.current
    const maxW = Math.min(window.innerWidth - 48, 700)
    const maxH = Math.min(window.innerHeight - 240, 500)
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
    canvas.width = Math.round(img.naturalWidth * ratio)
    canvas.height = Math.round(img.naturalHeight * ratio)
    scaleRef.current = { x: img.naturalWidth / canvas.width, y: img.naturalHeight / canvas.height }
    draw(canvas, img, selection)
  }, [imgLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, sel: Rect | null) {
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    if (sel && sel.w > 0 && sel.h > 0) {
      // darken outside
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // clear selection
      ctx.clearRect(sel.x, sel.y, sel.w, sel.h)
      ctx.drawImage(img, sel.x * scaleRef.current.x, sel.y * scaleRef.current.y,
        sel.w * scaleRef.current.x, sel.h * scaleRef.current.y,
        sel.x, sel.y, sel.w, sel.h)
      // border
      ctx.strokeStyle = '#7c3aed'
      ctx.lineWidth = 2
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)
    }
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: Math.max(0, Math.min(canvas.width, Math.round((clientX - rect.left) * (canvas.width / rect.width)))),
      y: Math.max(0, Math.min(canvas.height, Math.round((clientY - rect.top) * (canvas.height / rect.height)))),
    }
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const pos = getPos(e)
    setDrag({ start: pos })
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drag || !canvasRef.current || !imgRef.current) return
    const pos = getPos(e)
    const newSel = {
      x: Math.min(drag.start.x, pos.x),
      y: Math.min(drag.start.y, pos.y),
      w: Math.abs(pos.x - drag.start.x),
      h: Math.abs(pos.y - drag.start.y),
    }
    setSelection(newSel)
    draw(canvasRef.current, imgRef.current, newSel)
  }

  function onPointerUp() {
    setDrag(null)
  }

  const handleConfirm = useCallback(() => {
    if (!imgRef.current) return
    const img = imgRef.current
    const sel = selection
    const offscreen = document.createElement('canvas')
    if (sel && sel.w > 4 && sel.h > 4) {
      // crop
      offscreen.width = Math.round(sel.w * scaleRef.current.x)
      offscreen.height = Math.round(sel.h * scaleRef.current.y)
      offscreen.getContext('2d')!.drawImage(
        img,
        sel.x * scaleRef.current.x, sel.y * scaleRef.current.y,
        sel.w * scaleRef.current.x, sel.h * scaleRef.current.y,
        0, 0, offscreen.width, offscreen.height
      )
    } else {
      // no crop, use full image
      offscreen.width = img.naturalWidth
      offscreen.height = img.naturalHeight
      offscreen.getContext('2d')!.drawImage(img, 0, 0)
    }
    offscreen.toBlob(blob => {
      if (blob) onConfirm(blob)
    }, 'image/jpeg', 0.92)
  }, [selection, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col gap-4 p-4 max-w-full">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-800">Recortar tabela</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-500">Arraste para selecionar apenas a área da tabela. Se não recortar, a foto inteira será enviada.</p>
        <div className="overflow-auto">
          {imgLoaded ? (
            <canvas
              ref={canvasRef}
              className="cursor-crosshair touch-none select-none"
              style={{ maxWidth: '100%' }}
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            />
          ) : (
            <div className="flex items-center justify-center w-64 h-40 text-gray-400 text-sm">Carregando imagem…</div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!imgLoaded}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {selection && selection.w > 4 && selection.h > 4 ? 'Recortar e enviar' : 'Enviar sem recortar'}
          </button>
        </div>
      </div>
    </div>
  )
}
