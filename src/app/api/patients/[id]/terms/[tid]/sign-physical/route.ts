import { NextRequest, NextResponse } from 'next/server'
import { uploadFile } from '@/lib/s3'
import sql from '@/lib/db'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const { id, tid } = await params
  const session = await auth()
  const signedBy = session?.user?.name ?? null

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const signerName = (formData.get('signer_name') as string | null) ?? null

  if (!file) {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const s3Key = `patients/${id}/terms/${tid}/physical-${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'application/octet-stream'

  try {
    await uploadFile(s3Key, buffer, mimeType)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erro S3: ${msg}` }, { status: 500 })
  }

  const [updated] = await sql<{ id: number; status: string; signed_at: string; signed_file_s3_key: string }[]>`
    UPDATE patient_terms
    SET
      status = 'signed',
      signed_at = NOW(),
      signer_name = ${signerName},
      signed_file_s3_key = ${s3Key},
      sign_token = NULL
    WHERE id = ${Number(tid)} AND patient_id = ${Number(id)}
    RETURNING id, status, signed_at, signed_file_s3_key
  `

  if (!updated) {
    return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ...updated, signed_by: signedBy })
}
