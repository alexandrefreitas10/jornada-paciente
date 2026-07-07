import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean } | undefined
  if (!u?.is_admin && !u?.can_estoque) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params

  // Busca o log
  const [log] = await sql<{ id: number; type: string; created_by: string | null; created_at: string }[]>`
    SELECT id, type, created_by, created_at FROM stock_entry_logs WHERE id = ${Number(id)}
  `
  if (!log) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  // Busca movimentos de entrada criados dentro de 60s do log pelo mesmo usuário
  const movements = await sql<{ id: number; item_name: string; quantity: number; lot: string | null; expiry_date: string | null; created_at: string }[]>`
    SELECT m.id, i.name AS item_name, m.quantity, m.lot, m.expiry_date, m.created_at
    FROM stock_movements m
    JOIN stock_items i ON i.id = m.item_id
    WHERE m.type = 'entrada'
      AND m.created_at BETWEEN ${log.created_at}::timestamptz - INTERVAL '10 minutes'
                            AND ${log.created_at}::timestamptz + INTERVAL '2 minutes'
      AND (
        ${log.created_by ?? null} IS NULL
        OR m.created_by = ${log.created_by ?? null}
      )
    ORDER BY m.created_at, m.id
  `

  return NextResponse.json({ log, movements })
}
