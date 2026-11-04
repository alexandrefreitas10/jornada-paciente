import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'
import { dataBrasilia, somarDiasAoDia } from '@/lib/datas'

export async function GET() {
  await initSchema()

  const rows = await sql<{
    id: number
    name: string
    start_date: string
    duration: string
    completed_count: number
  }[]>`
    SELECT
      p.id,
      p.name,
      p.start_date,
      p.duration,
      COUNT(tc.id)::int AS completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    GROUP BY p.id, p.name, p.start_date, p.duration
    ORDER BY p.name ASC
  `

  // O dia de HOJE em Brasília, não o instante. O prazo de um tratamento é uma
  // data de calendário: comparar instantes fazia o "Prazo encerrado" acender às
  // 21h do dia ANTERIOR, porque a meia-noite UTC do dia do fim já é 21h do dia
  // de antes aqui. O paciente entrava na lista de Concluídos na noite errada.
  const hoje = dataBrasilia(new Date())

  const result = rows
    .map(p => {
      const totalWeeks = parseInt(p.duration, 10)
      let treatmentDone = false
      if (p.start_date && !isNaN(totalWeeks) && totalWeeks > 0) {
        // Dia puro mais N dias, sem fuso envolvido. Comparação de texto porque
        // `AAAA-MM-DD` ordena igual à data que representa.
        const fim = somarDiasAoDia(p.start_date, totalWeeks * 7)
        treatmentDone = fim !== null && fim <= hoje
      }
      return { ...p, treatment_done: treatmentDone }
    })
    .filter(p => p.completed_count >= 20 || p.treatment_done)

  return NextResponse.json({ total: result.length, patients: result })
}
