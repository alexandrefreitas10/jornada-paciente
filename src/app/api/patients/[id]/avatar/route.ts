import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { updatePatientAvatar } from '@/lib/patients'
import { uploadFile, getSignedDownloadUrl } from '@/lib/s3'
import { tipoDeImagemDosBytes, FORMATOS_ACEITOS } from '@/lib/tipos-de-imagem'

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

  // O `startsWith('image/')` acima é a conferência amigável, feita no que o
  // cliente DIZ — e `image/svg+xml` também começa com `image/`. Aqui quem
  // decide são os bytes.
  //
  // O risco deste arquivo é menor que o da rota de download: o avatar só sai
  // por URL assinada do S3, que é OUTRA origem, então um SVG com script
  // executaria no domínio do S3 e não no nosso, sem alcançar a sessão de
  // ninguém. Mesmo assim a foto de perfil é imagem — recusar o que não é
  // imagem é a resposta certa, e custa uma linha.
  const tipoReal = tipoDeImagemDosBytes(buffer)
  if (!tipoReal) {
    return NextResponse.json({ error: `Envie uma imagem ${FORMATOS_ACEITOS}` }, { status: 400 })
  }

  try {
    await uploadFile(s3Key, buffer, tipoReal)
  } catch (err) {
    return NextResponse.json({ error: `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
  await updatePatientAvatar(Number(id), s3Key)
  const url = await getSignedDownloadUrl(s3Key)
  return NextResponse.json({ ok: true, url })
}
