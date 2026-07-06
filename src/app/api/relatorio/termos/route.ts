import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') // 'signed' | 'sent' | 'draft' | null = todos

  try {
    const rows = await sql<{
      id: number
      patient_id: number
      patient_name: string
      title: string
      status: string
      created_by: string
      created_at: string
      sent_at: string | null
      signed_at: string | null
      signer_name: string | null
    }[]>`
      SELECT
        pt.id,
        pt.patient_id,
        p.name AS patient_name,
        pt.title,
        pt.status,
        pt.created_by,
        pt.created_at,
        pt.sent_at,
        pt.signed_at,
        pt.signer_name
      FROM patient_terms pt
      JOIN patients p ON p.id = pt.patient_id
      ${status ? sql`WHERE pt.status = ${status}` : sql``}
      ORDER BY pt.created_at DESC
    `

    const signed = rows.filter(r => r.status === 'signed').length
    const sent    = rows.filter(r => r.status === 'sent').length
    const draft   = rows.filter(r => r.status === 'draft').length

    return NextResponse.json({ total: rows.length, signed, sent, draft, terms: rows })
  } catch (err) {
    console.error('relatorio/termos error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
