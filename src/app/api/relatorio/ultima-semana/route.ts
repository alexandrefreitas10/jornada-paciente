import { NextResponse } from 'next/server'
import { getPatientsInLastWeek } from '@/lib/relatorio'

export async function GET() {
  const patients = await getPatientsInLastWeek()
  return NextResponse.json(patients)
}
