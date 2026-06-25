import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  await initSchema()

  const rows = await sql<{ id: number; name: string; photo_count: string; last_photo: string }[]>`
    SELECT
      p.id,
      p.name,
      COUNT(pf.id) AS photo_count,
      MAX(pf.created_at) AS last_photo
    FROM patients p
    INNER JOIN patient_files pf ON pf.patient_id = p.id
    WHERE
      pf.file_type = 'photo'
      AND pf.deleted_at IS NULL
      AND p.deleted_at IS NULL
    GROUP BY p.id, p.name
    ORDER BY p.name ASC
  `

  const patients = rows.map(r => ({
    id: r.id,
    name: r.name,
    photo_count: Number(r.photo_count),
    last_photo: r.last_photo,
  }))

  return NextResponse.json({ total: patients.length, patients })
}
