import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { bloquearEDesmarcar } from '@/lib/agenda-db'

export const dynamic = 'force-dynamic'

function diaValido(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const horaValida = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { dia, de, ate } = body ?? {}
  const motivo = typeof body?.motivo === 'string' && body.motivo.trim() ? body.motivo.trim() : null

  if (!diaValido(dia)) return NextResponse.json({ error: 'Dia inválido. Use AAAA-MM-DD.' }, { status: 400 })
  if (!horaValida(de) || !horaValida(ate))
    return NextResponse.json({ error: 'Informe "de" e "ate" no formato HH:MM.' }, { status: 400 })
  // `ate` é exclusivo; faixa vazia ou invertida não bloquearia nada e esconderia o erro.
  if (de >= ate) return NextResponse.json({ error: 'A hora final precisa ser depois da inicial.' }, { status: 400 })

  const resultado = await bloquearEDesmarcar({ dia, de, ate, motivo, criadoPor: session.user.name ?? null })

  // Bloquear é a ação mais destrutiva daqui: cancela o tratamento de várias
  // pessoas de uma vez. Uma linha de auditoria POR PACIENTE, porque é por
  // paciente que alguém vai perguntar — "por que a minha aplicação sumiu?" —
  // e a ficha dele é onde a resposta é procurada.
  for (const d of resultado.desmarcados) {
    await logAudit({
      userName: session.user.name ?? 'Desconhecido',
      action: 'UPDATE',
      entityType: 'agendamento',
      entityId: d.id,
      patientId: d.patientId,
      details: 'desmarcado pelo bloqueio de ' + dia + ' ' + de + '–' + ate,
    })
  }

  // A equipe avisa os pacientes por WhatsApp; `desmarcados` é como ela sabe quem.
  return NextResponse.json(resultado, { status: 201 })
}
