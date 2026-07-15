import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { updatePatientAvatar } from '@/lib/patients'
import { uploadFile, getSignedDownloadUrl } from '@/lib/s3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST (multipart) — o paciente envia sua foto de perfil. Vai para o quadrado do avatar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return NextResponse.json({ error: 'Foto não enviada' }, { status: 400 })

  const mime = file.type || ''
  if (!mime.startsWith('image/')) {
    return NextResponse.json({ error: 'Envie uma imagem' }, { status: 400 })
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Imagem muito grande (máx. 8MB)' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const s3Key = `patients/${id}/avatar/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    await uploadFile(s3Key, buffer, mime)
  } catch (err) {
    return NextResponse.json({ error: `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
  await updatePatientAvatar(Number(id), s3Key)
  const url = await getSignedDownloadUrl(s3Key)
  return NextResponse.json({ ok: true, url })
}
