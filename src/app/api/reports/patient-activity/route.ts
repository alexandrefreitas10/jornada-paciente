import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')

  if (!start || !end) return NextResponse.json({ error: 'start e end são obrigatórios' }, { status: 400 })

  const startTs = start + 'T00:00:00'
  const endTs = end + 'T23:59:59'

  try {
    const [saidas, arquivos, medicoes, tarefas, resumos] = await Promise.all([
      // Saídas de estoque com paciente
      sql<{ patient_id: number; patient_name: string; item_name: string; quantity: number; lot: string | null; created_at: string; created_by: string | null }[]>`
        SELECT m.patient_id, m.patient_name, i.name AS item_name, m.quantity, m.lot, m.created_at, m.created_by
        FROM stock_movements m
        JOIN stock_items i ON i.id = m.item_id
        WHERE m.type = 'saida'
          AND m.patient_id IS NOT NULL
          AND m.created_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
        ORDER BY m.created_at
      `,
      // Arquivos de pacientes (fotos, exames, dietas, prescrições)
      sql<{ patient_id: number; file_type: string; original_name: string; created_at: string; created_by: string | null }[]>`
        SELECT patient_id, file_type, original_name, created_at, created_by
        FROM patient_files
        WHERE deleted_at IS NULL
          AND created_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
        ORDER BY created_at
      `,
      // Medições adicionadas
      sql<{ patient_id: number; week: number | null; created_at: string }[]>`
        SELECT patient_id, week, created_at
        FROM weekly_measurements
        WHERE created_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
        ORDER BY created_at
      `,
      // Tarefas concluídas
      sql<{ patient_id: number; task_key: string; completed_at: string }[]>`
        SELECT patient_id, task_key, completed_at
        FROM task_completions
        WHERE completed_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
        ORDER BY completed_at
      `,
      // Resumos de evolução (sem created_by — coluna não existe nessa tabela)
      sql<{ patient_id: number; created_at: string }[]>`
        SELECT patient_id, created_at
        FROM evolution_summaries
        WHERE created_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
        ORDER BY created_at
      `,
    ])

    // Coleta todos os patient_ids únicos que tiveram atividade
    const patientIds = new Set<number>([
      ...saidas.map(r => r.patient_id),
      ...arquivos.map(r => r.patient_id),
      ...medicoes.map(r => r.patient_id),
      ...tarefas.map(r => r.patient_id),
      ...resumos.map(r => r.patient_id),
    ])

    if (patientIds.size === 0) return NextResponse.json([])

    const patients = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM patients WHERE id = ANY(${[...patientIds]}::int[]) ORDER BY name
    `

    const FILE_TYPE_LABEL: Record<string, string> = {
      evolution: 'Foto de evolução',
      exam: 'Exame',
      diet: 'Dieta',
      prescription: 'Prescrição',
      bioimpedance: 'Bioimpedância',
    }

    const TASK_LABEL: Record<string, string> = {
      formulario_preenchido: 'Formulário preenchido',
      consulta_agendada: 'Consulta agendada',
      consulta_confirmada: 'Consulta confirmada',
      consulta_realizada: 'Consulta realizada',
      exames_solicitados: 'Exames solicitados',
      exames_realizados: 'Exames realizados',
      dieta_enviada: 'Dieta enviada',
      retorno_agendado: 'Retorno agendado',
    }

    const result = patients.map(p => {
      const activities: { type: string; description: string; detail: string | null; created_at: string; created_by: string | null }[] = []

      saidas.filter(r => r.patient_id === p.id).forEach(r => {
        activities.push({
          type: 'saida',
          description: `Saída de ativo: ${r.item_name}${r.lot ? ` (Lote: ${r.lot})` : ''}`,
          detail: `Quantidade: ${r.quantity}`,
          created_at: r.created_at,
          created_by: r.created_by,
        })
      })

      arquivos.filter(r => r.patient_id === p.id).forEach(r => {
        activities.push({
          type: r.file_type,
          description: `${FILE_TYPE_LABEL[r.file_type] ?? r.file_type} enviado(a)`,
          detail: r.original_name,
          created_at: r.created_at,
          created_by: r.created_by,
        })
      })

      medicoes.filter(r => r.patient_id === p.id).forEach(r => {
        activities.push({
          type: 'medicao',
          description: r.week ? `Medição adicionada — Semana ${r.week}` : 'Medição adicionada',
          detail: null,
          created_at: r.created_at,
          created_by: null,
        })
      })

      tarefas.filter(r => r.patient_id === p.id).forEach(r => {
        activities.push({
          type: 'tarefa',
          description: `Tarefa concluída: ${TASK_LABEL[r.task_key] ?? r.task_key}`,
          detail: null,
          created_at: r.completed_at,
          created_by: null,
        })
      })

      resumos.filter(r => r.patient_id === p.id).forEach(r => {
        activities.push({
          type: 'resumo',
          description: 'Resumo de evolução gerado',
          detail: null,
          created_at: r.created_at,
          created_by: null,
        })
      })

      activities.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      return { patient_id: p.id, patient_name: p.name, activities }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('patient-activity error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
