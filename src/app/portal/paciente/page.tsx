import { redirect } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { listPatientFiles } from '@/lib/patient-files'
import { getSignedDownloadUrl } from '@/lib/s3'
import { PatientDetailClient } from '@/components/PatientDetailClient'
import { portalAuth } from '@/auth-portal'
import { findPortalUserByPatientId } from '@/lib/patient-portal'
import { hasAnsweredNps } from '@/lib/feedback'
import { PortalLogoutButton } from './PortalLogoutButton'

export const dynamic = 'force-dynamic'

export default async function PortalPatientPage() {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patientId = (session?.user as any)?.patient_id as number | undefined

  if (!patientId) redirect('/portal/login')

  // Valida que o acesso ainda existe e está ativo no banco —
  // cobre revogação e redefinição de senha com sessão antiga ainda válida
  const portalUser = await findPortalUserByPatientId(patientId)
  if (!portalUser || !portalUser.password_hash) redirect('/portal/login')

  // Primeiro acesso: responder o NPS antes de entrar
  if (!(await hasAnsweredNps(patientId))) redirect('/portal/paciente/nps')

  const [patient, measurements, photos, bioimpedances, exams, diets, evolutionPhotos, prescriptions] = await Promise.all([
    getPatient(patientId),
    listMeasurements(patientId),
    listPatientFiles(patientId, 'photo'),
    listPatientFiles(patientId, 'bioimpedance'),
    listPatientFiles(patientId, 'exam'),
    listPatientFiles(patientId, 'diet'),
    listPatientFiles(patientId, 'evolution'),
    listPatientFiles(patientId, 'prescription'),
  ])

  // Paciente excluído (lixeira) ou arquivado não acessa o portal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!patient || (patient as any).deleted_at || (patient as any).archived_at) redirect('/portal/login')

  const withUrls = async (files: typeof photos) =>
    Promise.all(files.map(async (f) => ({ ...f, url: await getSignedDownloadUrl(f.s3_key) })))

  const [initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions] = await Promise.all([
    withUrls(photos),
    withUrls(bioimpedances),
    withUrls(exams),
    withUrls(diets),
    withUrls(evolutionPhotos),
    withUrls(prescriptions),
  ])

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">🌸 Minha Área</span>
        <PortalLogoutButton />
      </div>
      <PatientDetailClient
        patient={patient}
        initialMeasurements={measurements}
        initialPhotos={initialPhotos}
        initialBioimpedances={initialBioimpedances}
        initialExams={initialExams}
        initialDiets={initialDiets}
        initialEvolutionPhotos={initialEvolutionPhotos}
        initialPrescriptions={initialPrescriptions}
        currentUserName=""
        readOnly={true}
      />
    </div>
  )
}
