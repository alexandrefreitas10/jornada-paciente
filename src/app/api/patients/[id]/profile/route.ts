import { NextRequest, NextResponse } from 'next/server'
import { updatePatientProfile } from '@/lib/patients'

export const dynamic = 'force-dynamic'

// POST — o paciente atualiza os próprios dados básicos (nome NÃO é editável).
// Acessível pelo portal (o proxy garante que o id do path é o do próprio paciente).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const email = typeof body.email === 'string' ? body.email.trim() : null
  if (email && !email.includes('@')) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  }
  const birth_date = typeof body.birth_date === 'string' && body.birth_date ? body.birth_date : null
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null

  await updatePatientProfile(Number(id), { birth_date, phone, email: email || null })
  return NextResponse.json({ ok: true })
}
