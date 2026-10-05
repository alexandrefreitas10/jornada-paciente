import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPatient, updatePatient, deletePatient } from '@/lib/patients'
import { logAudit } from '@/lib/audit'
import { validarTelefone } from '@/lib/telefone'

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
    const { name, start_date, duration, notes, phone } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    // Na edição o telefone pode continuar vazio: 165 pacientes ainda não têm, e
    // travar impediria de corrigir o nome deles. Mas inválido não passa.
    const bruto = typeof phone === 'string' ? phone.trim() : ''
    let digitos = ''
    if (bruto) {
      const tel = validarTelefone(bruto)
      if (!tel.ok) return NextResponse.json({ error: tel.motivo }, { status: 400 })
      digitos = tel.digitos
    }
    await updatePatient(Number(id), { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '', phone: digitos })
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
  await deletePatient(Number(id), userName)
  await logAudit({ userName, action: 'DELETE', entityType: 'patient', entityId: id, details: patient?.name })
  return NextResponse.json({ ok: true })
}
