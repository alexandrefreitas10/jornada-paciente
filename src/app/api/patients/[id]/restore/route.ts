import { NextResponse } from 'next/server'
import { restorePatient } from '@/lib/patients'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  await restorePatient(Number(id))
  return NextResponse.json({ ok: true })
}
