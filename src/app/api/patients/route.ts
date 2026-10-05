import { NextResponse } from 'next/server'
import { listPatients, createPatient } from '@/lib/patients'
import { auth } from '@/auth'
import { validarTelefone } from '@/lib/telefone'

export async function GET() {
  try {
    const patients = await listPatients()
    return NextResponse.json(patients)
  } catch {
    return NextResponse.json({ error: 'Erro ao listar pacientes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    const createdBy = session?.user?.name ?? null
    const body = await request.json()
    const { name, start_date, duration, notes, phone } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    // Decisão do dono: paciente novo não entra sem telefone. A trava vale aqui
    // também, não só na tela.
    const tel = validarTelefone(phone)
    if (!tel.ok) {
      return NextResponse.json({ error: tel.motivo }, { status: 400 })
    }
    const id = await createPatient({ name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '', phone: tel.digitos, created_by: createdBy })
    return NextResponse.json({ id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao criar paciente' }, { status: 500 })
  }
}
