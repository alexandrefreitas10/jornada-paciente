import { NextRequest, NextResponse } from 'next/server'
import { hasAnsweredNps, saveNps } from '@/lib/feedback'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — o paciente já respondeu o NPS?
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const answered = await hasAnsweredNps(Number(id))
  return NextResponse.json({ answered })
}

// POST — registra a resposta (uma única vez)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { score, comment } = await req.json()

  const n = Number(score)
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    return NextResponse.json({ error: 'Nota inválida' }, { status: 400 })
  }

  const saved = await saveNps(Number(id), n, typeof comment === 'string' && comment.trim() ? comment.trim() : null)
  if (!saved) {
    return NextResponse.json({ error: 'NPS já respondido' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
