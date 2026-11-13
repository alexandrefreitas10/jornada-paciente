import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql from '@/lib/db'
import { agendamentosDoPeriodo, criarBloqueio, mudarStatus } from '@/lib/agenda-db'
import { atingidosPeloBloqueio } from '@/lib/agenda-vagas'

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

  const bloqueio = await criarBloqueio({ dia, de, ate, motivo, criadoPor: session.user.name ?? null })

  // Só agendado/atendido segura horário; quem já desmarcou/remarcou/faltou não
  // tem o que perder e não deve entrar na lista de quem avisar.
  const vivos = (await agendamentosDoPeriodo(dia, dia)).filter(
    (a) => a.status === 'agendado' || a.status === 'atendido',
  )
  const ids = atingidosPeloBloqueio({ dia, de, ate }, vivos)
  const atingidos = vivos.filter((a) => ids.includes(a.id))

  // Cancelar é o que impede o paciente de ver, no portal, um horário em dia de
  // sala fechada, e libera ele para marcar outro.
  for (const a of atingidos) await mudarStatus(a.id, 'desmarcou', 'clínica')

  const nomes = new Map<number, string>()
  if (atingidos.length > 0) {
    const linhas = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM patients WHERE id = ANY(${atingidos.map((a) => a.patient_id)}::int[])`
    for (const l of linhas) nomes.set(l.id, l.name)
  }

  // A equipe avisa os pacientes por WhatsApp; a lista é como ela sabe quem.
  return NextResponse.json(
    {
      bloqueio,
      desmarcados: atingidos.map((a) => ({
        id: a.id,
        patientId: a.patient_id,
        nome: nomes.get(a.patient_id) ?? '(paciente removido)',
        hora: a.hora,
        duracao: a.duracao,
      })),
    },
    { status: 201 },
  )
}
