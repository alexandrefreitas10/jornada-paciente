// src/app/api/patients/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listPatients, createPatient } from '@/lib/patients'

export async function GET() {
  try {
    const patients = listPatients(db)
    return NextResponse.json(patients)
  } catch {
    return NextResponse.json({ error: 'Erro ao listar pacientes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, start_date, duration, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    const id = createPatient(db, { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '' })
    return NextResponse.json({ id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao criar paciente' }, { status: 500 })
  }
}
