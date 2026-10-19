import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import sql, { initSchema } from '@/lib/db'
import { listarMontagens, listarPessoas } from '@/lib/fotos-db'
import FotosClient from './FotosClient'

export const dynamic = 'force-dynamic'

export default async function FotosPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  // A aba é da equipe inteira (decisão do dono): sem checagem de permissão.

  try {
    await initSchema()
  } catch {}

  // Cada consulta no seu próprio try/catch, como em `implantes/page.tsx`: se o
  // banco falhar, a aba abre vazia em vez de dar 500 na tela inteira.
  let montagens: Awaited<ReturnType<typeof listarMontagens>> = []
  let pessoas: Awaited<ReturnType<typeof listarPessoas>> = []
  try {
    ;[montagens, pessoas] = await Promise.all([listarMontagens(), listarPessoas()])
  } catch {}

  // A lista de pacientes é para o montador (Task 10) escolher "de quem é" sem
  // precisar de outra rota. Mesma consulta de `implantes/page.tsx`.
  let pacientes: { id: number; name: string }[] = []
  try {
    pacientes = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM patients WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name
    `
  } catch {}

  return (
    <FotosClient
      montagensIniciais={montagens}
      pessoasIniciais={pessoas}
      pacientes={pacientes}
    />
  )
}
