import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const patientId = Number(id)

  try {
    // Última medição com dose registrada
    const [measurement] = await sql<{
      week: number | null
      date: string | null
      tirzepatide_dose: number | null
    }[]>`
      SELECT week, date, tirzepatide_dose
      FROM weekly_measurements
      WHERE patient_id = ${patientId}
        AND tirzepatide_dose IS NOT NULL
      ORDER BY week DESC NULLS LAST, id DESC
      LIMIT 1
    `

    if (!measurement) {
      return NextResponse.json({ error: 'Nenhuma medição com dose encontrada para este paciente.' }, { status: 404 })
    }

    // Dados do paciente para total de semanas
    const [patient] = await sql<{ duration: string }[]>`
      SELECT duration FROM patients WHERE id = ${patientId}
    `

    const totalWeeks = patient?.duration ? parseInt(patient.duration, 10) : null
    const weekNum = measurement.week ?? 1
    const ordinal = weekNum + 'ª'
    const weekLine = totalWeeks
      ? `${ordinal} SEMANA DE ${totalWeeks}`
      : `${ordinal} SEMANA`

    // Formata data: espera texto no formato DD/MM/YY ou DD/MM/YYYY → DD/MM
    let dateFmt = ''
    if (measurement.date) {
      const parts = measurement.date.split('/')
      if (parts.length >= 2) {
        dateFmt = `${parts[0]}/${parts[1]}`
      } else {
        // Formato YYYY-MM-DD
        const p = measurement.date.split('-')
        if (p.length === 3) dateFmt = `${p[2]}/${p[1]}`
        else dateFmt = measurement.date
      }
    }

    const dose = measurement.tirzepatide_dose
    const line1 = `Tirzepartida Manipulada - ${dose}mg${dateFmt ? ` (${dateFmt})` : ''}`
    const report = `${line1}\n${weekLine}\nINJETÁVEIS REALIZADOS CONFORME PM, SEM INTERCORRÊNCIAS E SEGUE AOS CUIDADOS DA EQUIPE MULTI.`

    return NextResponse.json({ report, week: weekNum, date: measurement.date, dose })
  } catch (err) {
    console.error('evolution-report error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
