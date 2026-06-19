import { NextRequest } from 'next/server'
import { getTermByToken, signTerm, signTermWithFile } from '@/lib/patient-terms'
import { uploadFile } from '@/lib/s3'
import { randomUUID } from 'crypto'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 })
  return Response.json(term)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term) return Response.json({ error: 'Link inválido' }, { status: 404 })
  if (term.status === 'signed') return Response.json({ error: 'Termo já assinado' }, { status: 409 })

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    const signerName = (fd.get('signerName') as string | null)?.trim()
    const signatureData = fd.get('signatureData') as string | null
    const filledFile = fd.get('filledFile') as File | null

    if (!signerName || !signatureData) {
      return Response.json({ error: 'Nome e assinatura obrigatórios' }, { status: 400 })
    }

    if (filledFile && filledFile.size > 0) {
      const ext = filledFile.name.split('.').pop() ?? 'pdf'
      const s3Key = `terms/filled/${randomUUID()}.${ext}`
      const buffer = Buffer.from(await filledFile.arrayBuffer())
      await uploadFile(s3Key, buffer, filledFile.type as never)
      const updated = await signTermWithFile(token, signerName, signatureData, s3Key, filledFile.name)
      return Response.json(updated)
    }

    const updated = await signTerm(token, signerName, signatureData)
    return Response.json(updated)
  }

  // fallback JSON
  const { signerName, signatureData } = await req.json()
  if (!signerName?.trim() || !signatureData) {
    return Response.json({ error: 'Nome e assinatura obrigatórios' }, { status: 400 })
  }
  const updated = await signTerm(token, signerName.trim(), signatureData)
  return Response.json(updated)
}
