import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getTerm } from '@/lib/terms'
import sql, { initSchema } from '@/lib/db'
import { randomUUID } from 'crypto'

interface PatientTerm {
  id: number
  title: string
  content: string
  file_s3_key: string | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  status: 'draft' | 'sent' | 'signed'
  created_at: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  sign_token: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const templateId = body.templateId as number | undefined

  if (!templateId) {
    return Response.json({ error: 'templateId obrigatório' }, { status: 400 })
  }

  const template = await getTerm(templateId)
  if (!template) {
    return Response.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  const session = await auth()
  const createdBy = session?.user?.name ?? 'Desconhecido'
  const signToken = randomUUID()

  await initSchema()
  const [row] = await sql<any>`
    INSERT INTO patient_terms (
      patient_id, title, content, file_s3_key, file_name, file_mime,
      fields, status, created_by, sign_token, sent_at
    )
    VALUES (
      ${Number(id)},
      ${template.title},
      ${template.content},
      ${template.file_s3_key},
      ${template.file_name},
      ${template.file_mime},
      ${sql.json(template.fields as never)},
      'sent',
      ${createdBy},
      ${signToken},
      NOW()
    )
    RETURNING id, title, content, file_s3_key, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb) AS fields,
      status, created_at, sent_at, signed_at, signer_name, sign_token
  `
  const result: PatientTerm = {
    ...row,
    fields: Array.isArray(row.fields) ? row.fields : (typeof row.fields === 'string' ? JSON.parse(row.fields) : []),
  }

  return Response.json(result, { status: 201 })
}
