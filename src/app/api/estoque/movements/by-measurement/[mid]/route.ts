import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

// Atualiza o movimento de saída vinculado a uma medição específica
// Tenta por measurement_id; se não encontrar, tenta pelo movimento mais recente de tirzepartida do paciente
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params
  const body = await req.json()
  const qty = Number(body.quantity)
  const obs = String(body.observation ?? '')
  const patientId = body.patient_id ? Number(body.patient_id) : null

  // Tenta pelo vínculo direto
  const byLink = await sql`
    UPDATE stock_movements
    SET quantity    = ${qty},
        observation = ${obs}
    WHERE measurement_id = ${Number(mid)} AND type = 'saida'
    RETURNING id
  `
  if (byLink.length > 0) return NextResponse.json({ ok: true, method: 'measurement_id' })

  // Fallback: movimento mais recente de tirzepartida do paciente (últimas 24h)
  if (!patientId) return NextResponse.json({ ok: false, reason: 'no patient_id for fallback' })

  const byFallback = await sql`
    UPDATE stock_movements
    SET quantity    = ${qty},
        observation = ${obs}
    WHERE id = (
      SELECT id FROM stock_movements
      WHERE type = 'saida'
        AND patient_id = ${patientId}
        AND observation ILIKE '%tirzep%'
      ORDER BY created_at DESC
      LIMIT 1
    )
    RETURNING id
  `
  if (byFallback.length > 0) return NextResponse.json({ ok: true, method: 'fallback' })

  return NextResponse.json({ ok: false, reason: 'not found' })
}
