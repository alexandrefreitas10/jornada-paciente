import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

interface ImplantNote {
  id: number
  patient_key: string
  content: string
  created_by: string | null
  created_at: string
}

// GET /api/implants/notes?key=... — lista as observações de um card (por chave)
export async function GET(req: NextRequest) {
  await initSchema()
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key é obrigatório' }, { status: 400 })

  const rows = await sql<ImplantNote[]>`
    SELECT id, patient_key, content, created_by, created_at
    FROM implant_notes
    WHERE patient_key = ${key}
    ORDER BY created_at ASC
  `
  return NextResponse.json(rows)
}

// POST /api/implants/notes { key, content } — cria observação com autor da sessão
export async function POST(req: NextRequest) {
  await initSchema()
  const session = await auth()
  const createdBy = session?.user?.name ?? 'Desconhecido'
  const { key, content } = await req.json()

  if (!key || !content?.trim()) {
    return NextResponse.json({ error: 'key e content são obrigatórios' }, { status: 400 })
  }

  const [row] = await sql<ImplantNote[]>`
    INSERT INTO implant_notes (patient_key, content, created_by)
    VALUES (${key}, ${content.trim()}, ${createdBy})
    RETURNING id, patient_key, content, created_by, created_at
  `
  return NextResponse.json(row, { status: 201 })
}
