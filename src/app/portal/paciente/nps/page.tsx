import { redirect } from 'next/navigation'
import { portalAuth } from '@/auth-portal'
import { findPortalUserByPatientId } from '@/lib/patient-portal'
import { hasAnsweredNps } from '@/lib/feedback'
import { NpsForm } from './NpsForm'

export const dynamic = 'force-dynamic'

export default async function PortalNpsPage() {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patientId = (session?.user as any)?.patient_id as number | undefined

  if (!patientId) redirect('/portal/login')

  const portalUser = await findPortalUserByPatientId(patientId)
  if (!portalUser || !portalUser.password_hash) redirect('/portal/login')

  // Já respondeu? Vai direto para o card
  if (await hasAnsweredNps(patientId)) redirect('/portal/paciente')

  return <NpsForm patientId={patientId} />
}
