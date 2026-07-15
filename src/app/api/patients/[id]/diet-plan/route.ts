import { NextRequest, NextResponse } from 'next/server'
import { listPatientFiles, updateFileSummary } from '@/lib/patient-files'
import { downloadFile } from '@/lib/s3'
import { extractDietPlan, DietPlan } from '@/lib/structured-extract'
import { logSystemError } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function mimeOf(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
}

// GET — plano alimentar estruturado (refeições) do arquivo de dieta mais recente.
// Cacheia o JSON no summary; gera via IA na primeira vez.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await listPatientFiles(Number(id), 'diet')
  if (files.length === 0) return NextResponse.json({ plan: null })

  const latest = files[0]

  if (latest.summary) {
    try {
      const cached = JSON.parse(latest.summary) as DietPlan
      if (cached && Array.isArray(cached.meals)) {
        return NextResponse.json({ plan: cached, file: { url: null, name: latest.original_name } })
      }
    } catch { /* regenera */ }
  }

  try {
    const buffer = await downloadFile(latest.s3_key)
    const plan = await extractDietPlan(buffer, mimeOf(latest.original_name), latest.original_name)
    if (plan) await updateFileSummary(latest.id, JSON.stringify(plan))
    return NextResponse.json({ plan })
  } catch (err) {
    void logSystemError('diet_plan', 'falha ao extrair plano alimentar', { fileId: latest.id, patientId: Number(id), code: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ plan: null })
  }
}
