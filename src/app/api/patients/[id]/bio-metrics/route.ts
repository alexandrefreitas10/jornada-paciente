import { NextRequest, NextResponse } from 'next/server'
import { listPatientFiles, updateFileSummary } from '@/lib/patient-files'
import { downloadFile } from '@/lib/s3'
import { extractBioRaw } from '@/lib/structured-extract'
import { logSystemError } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CACHE_VERSION = 3 // bump para invalidar caches antigos

interface BioMetrics {
  v: number
  data: string | null
  peso: string | null
  gordura: string | null         // % (PGC), ex "14,4%"
  massa_muscular: string | null  // Massa Muscular Esquelética, ex "48,6 kg"
  massa_magra: string | null     // Massa Livre de Gordura, ex "83,8 kg"
}

function mimeOf(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
}

function build(raw: { data: string | null; peso: string | null; gordura_pct: string | null; massa_muscular: string | null; massa_magra: string | null }): BioMetrics {
  let gordura: string | null = null
  if (raw.gordura_pct) {
    const num = raw.gordura_pct.replace('.', ',').replace('%', '').trim()
    if (num) gordura = `${num}%`
  }
  return {
    v: CACHE_VERSION,
    data: raw.data ?? null,
    peso: raw.peso ?? null,
    gordura,
    massa_muscular: raw.massa_muscular ?? null,
    massa_magra: raw.massa_magra ?? null,
  }
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
