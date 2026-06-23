import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPatient, updatePatient, deletePatient } from '@/lib/patients'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const patient = await getPatient(Number(id))
  if (!patient) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(patient)
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  try {
    const body = await request.json()
    const { name, start_date, duration, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    await updatePatient(Number(id), { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '' })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const patient = await getPatient(Number(id))
  await deletePatient(Number(id))
  await logAudit({ userName, action: 'DELETE', entityType: 'patient', entityId: id, details: patient?.name })
  return NextResponse.json({ ok: true })
}
