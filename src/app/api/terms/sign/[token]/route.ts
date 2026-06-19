import { NextRequest } from 'next/server'
import { getTermByToken, signTerm } from '@/lib/patient-terms'

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
  const { signerName, signatureData } = await req.json()
  if (!signerName?.trim() || !signatureData) {
    return Response.json({ error: 'Nome e assinatura obrigatórios' }, { status: 400 })
  }
  const updated = await signTerm(token, signerName.trim(), signatureData)
  return Response.json(updated)
}
