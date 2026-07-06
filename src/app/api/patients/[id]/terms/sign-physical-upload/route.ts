import { NextRequest, NextResponse } from 'next/server'
import { uploadFile } from '@/lib/s3'
import sql from '@/lib/db'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? 'admin'

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const title = (formData.get('title') as string | null) ?? 'Termo físico'
  const signerName = (formData.get('signer_name') as string | null) ?? null

  if (!file) {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const s3Key = `patients/${id}/terms/physical-${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'application/octet-stream'

  try {
    await uploadFile(s3Key, buffer, mimeType)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erro S3: ${msg}` }, { status: 500 })
  }

  const [term] = await sql<{ id: number; title: string; status: string; created_at: string; signed_at: string; signer_name: string | null; sign_token: string | null }[]>`
    INSERT INTO patient_terms
      (patient_id, title, status, created_by, signed_at, signer_name, signed_file_s3_key, content, fields, filled_fields)
    VALUES
      (${Number(id)}, ${title}, 'signed', ${createdBy}, NOW(), ${signerName}, ${s3Key}, '', '[]', '{}')
    RETURNING id, title, status, created_at, signed_at, signer_name, sign_token
  `

  return NextResponse.json(term, { status: 201 })
}
