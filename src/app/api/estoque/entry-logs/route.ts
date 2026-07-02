import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql from '@/lib/db'
import { getSignedDownloadUrl } from '@/lib/s3'

export const dynamic = 'force-dynamic'

interface EntryLog {
  id: number
  type: string
  original_filename: string | null
  s3_key: string | null
  item_count: number
  created_by: string | null
  created_at: string
}

export async function GET() {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean } | undefined
  if (!u?.is_admin && !u?.can_estoque) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const logs = await sql<EntryLog[]>`
    SELECT id, type, original_filename, s3_key, item_count, created_by, created_at
    FROM stock_entry_logs
    ORDER BY created_at DESC
    LIMIT 200
  `

  // Add signed download URLs for logs with S3 files
  const logsWithUrls = await Promise.all(logs.map(async (log) => {
    if (!log.s3_key) return { ...log, download_url: null }
    try {
      const download_url = await getSignedDownloadUrl(log.s3_key)
      return { ...log, download_url }
    } catch {
      return { ...log, download_url: null }
    }
  }))

  return NextResponse.json(logsWithUrls)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean; name?: string } | undefined
  if (!u?.is_admin && !u?.can_estoque) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { type, original_filename, s3_key, item_count } = await req.json() as {
    type: string
    original_filename?: string
    s3_key?: string
    item_count?: number
  }

  const createdBy = (session?.user as { name?: string })?.name ?? null

  const [log] = await sql<EntryLog[]>`
    INSERT INTO stock_entry_logs (type, original_filename, s3_key, item_count, created_by)
    VALUES (${type}, ${original_filename ?? null}, ${s3_key ?? null}, ${item_count ?? 0}, ${createdBy})
    RETURNING *
  `
  return NextResponse.json(log)
}
