import { NextRequest, NextResponse } from 'next/server'
import { listPatientFiles, updateFileSummary } from '@/lib/patient-files'
import { downloadFile } from '@/lib/s3'
import { extractBioMetrics, BioMetrics } from '@/lib/structured-extract'
import { logSystemError } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function mimeOf(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
}

// GET — métricas de bioimpedância do arquivo mais recente (Data/Peso/%gordura/massa magra).
// Cacheia o JSON no summary do arquivo; gera via IA na primeira vez.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await listPatientFiles(Number(id), 'bioimpedance')
  if (files.length === 0) return NextResponse.json({ metrics: null })

  const latest = files[0] // já vem ordenado por created_at DESC

  // Cache: se o summary já é um JSON de métricas, devolve
  if (latest.summary) {
    try {
      const cached = JSON.parse(latest.summary) as BioMetrics
      if (cached && ('peso' in cached || 'gordura' in cached)) {
        return NextResponse.json({ metrics: cached, date: latest.created_at })
      }
    } catch { /* summary não é JSON — regenera abaixo */ }
  }

  try {
    const buffer = await downloadFile(latest.s3_key)
    const metrics = await extractBioMetrics(buffer, mimeOf(latest.original_name), latest.original_name)
    if (metrics) await updateFileSummary(latest.id, JSON.stringify(metrics))
    return NextResponse.json({ metrics, date: latest.created_at })
  } catch (err) {
    void logSystemError('bio_metrics', 'falha ao extrair métricas de bioimpedância', { fileId: latest.id, patientId: Number(id), code: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ metrics: null })
  }
}
