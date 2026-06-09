// src/app/pacientes/[id]/page.tsx
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getPatient } from '@/lib/patients'
import { PatientDetailClient } from '@/components/PatientDetailClient'

export const dynamic = 'force-dynamic'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patient = getPatient(db, Number(id))
  if (!patient) notFound()
  return <PatientDetailClient patient={patient} />
}
