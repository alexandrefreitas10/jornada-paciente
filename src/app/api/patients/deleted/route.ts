import { NextResponse } from 'next/server'
import { listDeletedPatients } from '@/lib/patients'

export async function GET() {
  const patients = await listDeletedPatients()
  return NextResponse.json(patients)
}
