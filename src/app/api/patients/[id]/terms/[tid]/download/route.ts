import { NextRequest, NextResponse } from 'next/server'
import { listPatientTerms } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const { id, tid } = await params
  const terms = await listPatientTerms(Number(id))
  const term = terms.find(t => t.id === Number(tid))
  if (!term?.file_s3_key) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const url = await getSignedDownloadUrl(term.file_s3_key)
  return NextResponse.redirect(url)
}
