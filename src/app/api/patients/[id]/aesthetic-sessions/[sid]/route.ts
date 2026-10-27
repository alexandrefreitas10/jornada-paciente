import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { auth } from '@/auth'
import { validarEdicao } from '@/lib/estetica-edicao'
import { ehUnidade } from '@/lib/estetica-intervalo'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params
  // Anti-IDOR: só apaga se a sessão pertence ao paciente do path
  await sql`DELETE FROM aesthetic_sessions WHERE id = ${Number(sid)} AND patient_id = ${Number(id)}`
  return NextResponse.json({ ok: true })
}

/**
 * Edita um procedimento já criado: nome, quantidade, frequência, datas e
 * região. Existe porque o procedimento é lançado antes de a paciente começar,
 * quando a região e as datas ainda não se sabe.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id, sid } = await params
  const patientId = Number(id)
  const sessaoId = Number(sid)
  if (!Number.isInteger(patientId) || !Number.isInteger(sessaoId)) {
    return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 })
  }

  const corpo = await req.json().catch(() => null)
  if (!corpo) return NextResponse.json({ error: 'Não foi possível ler os dados enviados' }, { status: 400 })

  // Anti-IDOR, e de quebra a contagem de sessões já realizadas: as duas coisas
  // vêm da mesma consulta, antes de qualquer escrita.
  const [atual] = await sql<{ id: number; feitas: number }[]>`
    SELECT s.id, COUNT(c.id)::int AS feitas
    FROM aesthetic_sessions s
    LEFT JOIN aesthetic_session_completions c ON c.aesthetic_session_id = s.id
    WHERE s.id = ${sessaoId} AND s.patient_id = ${patientId}
    GROUP BY s.id
  `
  if (!atual) return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 })

  const erro = validarEdicao(
    {
      nome: String(corpo.procedure_name ?? ''),
      totalSessoes: Number(corpo.total_sessions),
      inicio: String(corpo.start_date ?? ''),
      fim: String(corpo.end_date ?? ''),
    },
    atual.feitas,
  )
  if (erro) return NextResponse.json({ error: erro }, { status: 400 })

  // Mesma regra do POST: o intervalo só é gravado quando os DOIS vieram e a
  // unidade é conhecida. Nulo quer dizer "é por semana" (ver `descreverCadencia`).
  const temIntervalo =
    Number.isFinite(Number(corpo.intervalo_valor)) &&
    Number(corpo.intervalo_valor) > 0 &&
    ehUnidade(corpo.intervalo_unidade)

  await sql`
    UPDATE aesthetic_sessions SET
      procedure_name    = ${String(corpo.procedure_name).trim()},
      total_sessions    = ${Math.floor(Number(corpo.total_sessions))},
      sessions_per_week = ${temIntervalo ? 1 : (Number(corpo.sessions_per_week) || 1)},
      intervalo_valor   = ${temIntervalo ? Math.floor(Number(corpo.intervalo_valor)) : null},
      intervalo_unidade = ${temIntervalo ? String(corpo.intervalo_unidade) : null},
      start_date        = ${corpo.start_date},
      end_date          = ${corpo.end_date || corpo.start_date},
      region            = ${corpo.region ?? null}
    WHERE id = ${sessaoId} AND patient_id = ${patientId}
  `

  return NextResponse.json({ ok: true })
}
