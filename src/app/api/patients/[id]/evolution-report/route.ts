import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const patientId = Number(id)
  const date = req.nextUrl.searchParams.get('date') // YYYY-MM-DD

  if (!date) return NextResponse.json({ error: 'date é obrigatório' }, { status: 400 })

  try {
    // Busca saídas do paciente na data informada
    const movements = await sql<{ item_name: string; quantity: number; lot: string | null }[]>`
      SELECT i.name AS item_name, m.quantity, m.lot
      FROM stock_movements m
      JOIN stock_items i ON i.id = m.item_id
      WHERE m.patient_id = ${patientId}
        AND m.type = 'saida'
        AND DATE(m.created_at AT TIME ZONE 'America/Sao_Paulo') = ${date}
      ORDER BY m.created_at ASC
    `

    if (movements.length === 0) {
      return NextResponse.json({ error: 'Nenhuma saída encontrada para este paciente nesta data.' }, { status: 404 })
    }

    // Busca dados do paciente para calcular semana
    const [patient] = await sql<{ start_date: string; duration: string }[]>`
      SELECT start_date, duration FROM patients WHERE id = ${patientId}
    `

    // Calcula semana atual
    let weekLine = 'Xª SEMANA DE Y'
    if (patient?.start_date && patient?.duration) {
      const start = new Date(patient.start_date)
      const ref = new Date(date)
      const totalWeeks = parseInt(patient.duration, 10)
      if (!isNaN(start.getTime()) && !isNaN(totalWeeks)) {
        const diffDays = Math.floor((ref.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1)
        const clampedWeek = Math.min(weekNum, totalWeeks)
        const ordinal = clampedWeek + 'ª'
        weekLine = `${ordinal} SEMANA DE ${totalWeeks}`
      }
    }

    // Formata data DD/MM
    const [yyyy, mm, dd] = date.split('-')
    const dateFmt = `${dd}/${mm}`

    // Monta o relatório — usa todos os itens do dia
    const itemLines = movements
      .map(m => `${m.item_name}${m.lot ? ` (Lote: ${m.lot})` : ''}`)
      .join('\n')

    // Se só tem 1 item, usa o formato clássico tirzepatide
    let report: string
    if (movements.length === 1) {
      const m = movements[0]
      report = `${m.item_name} (${dateFmt})\n${weekLine}\nINJETÁVEIS REALIZADOS CONFORME PM, SEM INTERCORRÊNCIAS E SEGUE AOS CUIDADOS DA EQUIPE MULTI.`
    } else {
      report = `${itemLines}\n(${dateFmt})\n${weekLine}\nINJETÁVEIS REALIZADOS CONFORME PM, SEM INTERCORRÊNCIAS E SEGUE AOS CUIDADOS DA EQUIPE MULTI.`
    }

    return NextResponse.json({ report, movements })
  } catch (err) {
    console.error('evolution-report error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
