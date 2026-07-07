import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ImplantesClient from './ImplantesClient'
import sql from '@/lib/db'
import { initSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ImplantesPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  await initSchema()
  const patients = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM patients WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name
  `

  return <ImplantesClient patients={patients} />
}
