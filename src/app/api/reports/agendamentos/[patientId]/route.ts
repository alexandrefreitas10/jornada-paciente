import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { historicoDoPaciente } from '@/lib/agenda-db'

export const dynamic = 'force-dynamic'

// O histórico completo de agendamentos de UM paciente.
//
// Existe separada de `GET /api/agenda?de&ate` porque aquela tem teto de 62
// dias — necessário lá, já que varre a clínica inteira. Aqui o recorte é uma
// pessoa, o volume é pequeno por natureza, e cortar por data esconderia
// exatamente o que o relatório serve para mostrar.
//
// Autorização igual às outras rotas de relatório deste projeto: QUALQUER
// sessão da equipe.
//
// ATENÇÃO, porque é fácil concluir o contrário: **não existe portão de
// administrador em Relatórios.** O componente `AdminGate` está declarado em
// `src/app/relatorios/RelatoriosClient.tsx` e nunca é renderizado; a página
// não confere `is_admin`; e `src/components/NavMenu.tsx` mostra "Relatórios"
// para a equipe inteira, sem condição (ao contrário de Estoque e Conciliação,
// que têm). O "Área restrita ao administrador" no cabeçalho é só texto.
//
// Isto não é regressão nem buraco novo: quem tem sessão da equipe já alcança
// a ficha do paciente e `GET /api/agenda`, e esta rota não expõe nada além
// disso. Está escrito aqui para ninguém auditar segurança daqui a seis meses
// e concluir que Relatórios é área restrita quando não é.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Conferido ANTES de consultar: `Number('abc')` é NaN e desceria até o
  // Postgres como erro 500, em vez de um recado que a tela sabe mostrar.
  const id = Number((await params).patientId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  }

  // Lista vazia é resposta boa, não 404: paciente que nunca teve agendamento é
  // o caso normal, e a tela precisa distinguir isso de "deu problema".
  return NextResponse.json({ agendamentos: await historicoDoPaciente(id) })
}
