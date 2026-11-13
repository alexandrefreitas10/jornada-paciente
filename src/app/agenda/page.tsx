import { auth } from '@/auth'
import { podeEstoque } from '@/lib/permissoes'
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
  // Só a ponte "registrar saída dos ativos" depende de outro módulo: quem não
  // entra em Estoque não pode ver um atalho que termina em 403 depois do trabalho
  // de escanear os itens. Mesma regra do menu.
  return (
    <AgendaClient
      hoje={dataBrasilia(new Date())}
      podeEstoque={podeEstoque(session.user as { is_admin?: boolean; can_estoque?: boolean })}
    />
  )
}
