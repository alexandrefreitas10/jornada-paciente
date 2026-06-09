// src/app/api/patients/[id]/tasks/[key]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { markTaskComplete, unmarkTaskComplete } from '@/lib/task-completions'
import { ALL_TASK_KEYS } from '@/lib/task-definitions'

type Params = { params: Promise<{ id: string; key: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  markTaskComplete(db, Number(id), key)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  unmarkTaskComplete(db, Number(id), key)
  return NextResponse.json({ ok: true })
}
