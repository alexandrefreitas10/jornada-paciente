import { redirect } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { listPatientFiles } from '@/lib/patient-files'
import { listPatientTerms } from '@/lib/patient-terms'
import { listMovementsByPatient } from '@/lib/stock'
import { getSignedDownloadUrl } from '@/lib/s3'
import { ALL_TASK_KEYS } from '@/lib/task-definitions'
import sql from '@/lib/db'
import { portalAuth } from '@/auth-portal'
import { findPortalUserByPatientId } from '@/lib/patient-portal'
import { hasAnsweredNps } from '@/lib/feedback'
import { PortalApp } from '@/components/portal/PortalApp'
import { logoutPortal } from './actions'
import type { PortalData, PortalFile } from '@/components/portal/types'

export const dynamic = 'force-dynamic'

export default async function PortalPatientPage() {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patientId = (session?.user as any)?.patient_id as number | undefined
  if (!patientId) redirect('/portal/login')

  const portalUser = await findPortalUserByPatientId(patientId)
  if (!portalUser || !portalUser.password_hash) redirect('/portal/login')

  if (!(await hasAnsweredNps(patientId))) redirect('/portal/paciente/nps')

  const [patient, measurements, photos, bioimpedances, exams, diets, medications, terms, sessions] = await Promise.all([
    getPatient(patientId),
    listMeasurements(patientId),
    listPatientFiles(patientId, 'photo'),
    listPatientFiles(patientId, 'bioimpedance'),
    listPatientFiles(patientId, 'exam'),
    listPatientFiles(patientId, 'diet'),
    listMovementsByPatient(patientId),
    listPatientTerms(patientId),
    sql<{ id: number; name: string; total_sessions: number; created_at: string; completed_count: string }[]>`
      SELECT s.id, s.name, s.total_sessions, s.created_at,
        COUNT(c.session_number) AS completed_count
      FROM aesthetic_sessions s
      LEFT JOIN aesthetic_session_completions c ON c.aesthetic_session_id = s.id
      WHERE s.patient_id = ${patientId}
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `.catch(() => []),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!patient || (patient as any).deleted_at || (patient as any).archived_at) redirect('/portal/login')

  const withUrls = async (files: typeof photos): Promise<PortalFile[]> =>
    Promise.all(files.map(async (f) => ({
      id: f.id, original_name: f.original_name, created_at: f.created_at,
      url: await getSignedDownloadUrl(f.s3_key), summary: f.summary,
    })))

  const [pPhotos, pBio, pExams, pDiets] = await Promise.all([
    withUrls(photos), withUrls(bioimpedances), withUrls(exams), withUrls(diets),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = patient as any
  const avatarUrl = p.avatar_s3_key ? await getSignedDownloadUrl(p.avatar_s3_key) : null

  const data: PortalData = {
    patientId,
    name: patient.name,
    startDate: p.start_date ?? null,
    birthDate: p.birth_date ? String(p.birth_date).slice(0, 10) : null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    avatarUrl,
    tasksDone: patient.completed_task_keys.length,
    tasksTotal: ALL_TASK_KEYS.length,
    hasEstetica: sessions.length > 0,
    photos: pPhotos,
    exams: pExams,
    bioimpedances: pBio,
    diets: pDiets,
    medications: medications.map(m => ({
      id: m.id, item_name: m.item_name, quantity: Number(m.quantity),
      lot: m.lot, expiry_date: m.expiry_date, created_at: m.created_at, observation: m.observation,
    })),
    sessions: sessions.map(s => ({
      id: s.id, name: s.name, total_sessions: Number(s.total_sessions),
      created_at: s.created_at, completedCount: Number(s.completed_count),
    })),
    terms: terms.map(t => ({
      id: t.id, title: t.title, status: t.status, signed_at: t.signed_at,
      sent_at: t.sent_at, sign_token: t.sign_token, hasSignedFile: !!t.signed_file_s3_key,
    })),
    measurements: measurements.map(m => ({
      week: m.week, date: m.date, weight: m.weight,
      abdominal_circumference: m.abdominal_circumference, waist_circumference: m.waist_circumference,
    })),
  }

  return <PortalApp data={data} onLogout={logoutPortal} />
}
