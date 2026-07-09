import { NextRequest, NextResponse } from 'next/server'
import { listPatientFeedback, addPatientFeedback } from '@/lib/feedback'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — lista os relatos do próprio paciente
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const feedbacks = await listPatientFeedback(Number(id))
  return NextResponse.json({ feedbacks })
}

// POST — paciente envia um relato para a ouvidoria
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { message } = await req.json()

  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'Escreva sua mensagem' }, { status: 400 })
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Mensagem muito longa (máx. 5000 caracteres)' }, { status: 400 })
  }

  await addPatientFeedback(Number(id), text)
  return NextResponse.json({ ok: true })
}
