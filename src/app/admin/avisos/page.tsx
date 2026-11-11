import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { AvisosClient } from './AvisosClient'

// O guardião global (`src/proxy.ts` — no Next 16 o middleware passou a se
// chamar assim) já barra quem não tem sessão da equipe. A trava daqui é outra:
// ela separa ADMIN de equipe. Disparar aviso no celular de paciente não é
// tarefa de quem apenas usa o sistema.
export default async function AvisosPage() {
  const session = await auth()
  if (!session?.user?.name) redirect('/login')
  if (!(await isAdminSession())) redirect('/')

  return <AvisosClient />
}
