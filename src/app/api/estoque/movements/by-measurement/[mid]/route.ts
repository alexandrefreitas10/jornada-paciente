import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

// Atualiza o movimento de saída vinculado a uma medição específica
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params
  const { quantity, observation } = await req.json()
  const [row] = await sql`
    UPDATE stock_movements
    SET quantity = ${Number(quantity)},
        observation = ${observation ?? null}
    WHERE measurement_id = ${Number(mid)} AND type = 'saida'
    RETURNING *
  `
  if (!row) return NextResponse.json({ ok: false, notFound: true })
  return NextResponse.json(row)
}
