import { NextRequest, NextResponse } from 'next/server'
import { listPatientFiles, updateFileSummary } from '@/lib/patient-files'
import { downloadFile } from '@/lib/s3'
import { extractBioRaw } from '@/lib/structured-extract'
import { logSystemError } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CACHE_VERSION = 2 // bump para invalidar caches antigos (massa magra vinha errada)

interface BioMetrics {
  v: number
  data: string | null
  peso: string | null
  gordura: string | null       // ex "14,4%"
  massa_magra: string | null   // ex "85,6%" (100 - gordura)
}

function mimeOf(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
}

// Monta as métricas finais: % gordura (PGC) e % massa magra = 100 - PGC.
function build(raw: { data: string | null; peso: string | null; gordura_pct: string | null }): BioMetrics {
  let gordura: string | null = null
  let massa_magra: string | null = null
  if (raw.gordura_pct) {
    const n = parseFloat(raw.gordura_pct.replace(',', '.').replace(/[^\d.]/g, ''))
    if (Number.isFinite(n)) {
      gordura = `${raw.gordura_pct.replace('.', ',').replace('%', '')}%`
      const magra = 100 - n
      massa_magra = `${magra.toFixed(1).replace('.', ',')}%`
    }
  }
  return { v: CACHE_VERSION, data: raw.data ?? null, peso: raw.peso ?? null, gordura, massa_magra }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await listPatientFiles(Number(id), 'bioimpedance')
  if (files.length === 0) return NextResponse.json({ metrics: null })

  const latest = files[0]

  // Cache só vale se for da versão atual
  if (latest.summary) {
    try {
      const cached = JSON.parse(latest.summary) as BioMetrics
      if (cached && cached.v === CACHE_VERSION) {
        return NextResponse.json({ metrics: cached, date: latest.created_at })
      }
    } catch { /* regenera */ }
  }

  try {
    const buffer = await downloadFile(latest.s3_key)
    const raw = await extractBioRaw(buffer, mimeOf(latest.original_name), latest.original_name)
    if (!raw) return NextResponse.json({ metrics: null })
    const metrics = build(raw)
    await updateFileSummary(latest.id, JSON.stringify(metrics))
    return NextResponse.json({ metrics, date: latest.created_at })
  } catch (err) {
    void logSystemError('bio_metrics', 'falha ao extrair métricas de bioimpedância', { fileId: latest.id, patientId: Number(id), code: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ metrics: null })
  }
}
