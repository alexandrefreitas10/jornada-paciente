import { NextResponse } from 'next/server'
import { markTaskComplete, unmarkTaskComplete } from '@/lib/task-completions'
import { ALL_TASK_KEYS } from '@/lib/task-definitions'

type Params = { params: Promise<{ id: string; key: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  await markTaskComplete(Number(id), key)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  await unmarkTaskComplete(Number(id), key)
  return NextResponse.json({ ok: true })
}
