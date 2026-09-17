import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { ETIQUETAS, type Etiqueta } from '@/lib/em-tratamento'
import { marcarEnviada, desmarcarEnviada } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

function idValido(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : null
}

function ehEtiqueta(valor: unknown): valor is Etiqueta {
  return typeof valor === 'string' && (ETIQUETAS as readonly string[]).includes(valor)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const patientId = idValido(body?.patient_id)
  const template = body?.template
  if (!patientId || !ehEtiqueta(template)) {
    return NextResponse.json({ error: 'patient_id e template são obrigatórios' }, { status: 400 })
  }

  const userName = session.user.name ?? 'desconhecido'
  const marcacao = await marcarEnviada(patientId, template, userName)
  if (!marcacao) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  await logAudit({
    userName,
    action: 'mensagem_tratamento_enviada',
    entityType: 'treatment_message',
    entityId: patientId,
    patientId,
    details: `modelo ${template}`,
  })
  return NextResponse.json(marcacao, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const patientId = idValido(req.nextUrl.searchParams.get('patient_id'))
  if (!patientId) return NextResponse.json({ error: 'patient_id é obrigatório' }, { status: 400 })

  const userName = session.user.name ?? 'desconhecido'
  await desmarcarEnviada(patientId)
  await logAudit({
    userName,
    action: 'mensagem_tratamento_desfeita',
    entityType: 'treatment_message',
    entityId: patientId,
    patientId,
  })
  return new NextResponse(null, { status: 204 })
}
