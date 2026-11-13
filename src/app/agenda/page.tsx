import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { dataBrasilia } from '@/lib/datas'
import { AgendaClient } from './AgendaClient'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // A agenda é da equipe inteira: qualquer pessoa logada, sem permissão nova.
  // O "hoje" nasce no servidor, em Brasília, e desce como texto: calculado no
  // navegador dependeria do fuso da máquina de quem abre (e do relógio dela).
  return <AgendaClient hoje={dataBrasilia(new Date())} />
}
