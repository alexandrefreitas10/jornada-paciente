import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { canConciliacaoSession } from '@/lib/authz'
import { lerSistemaDoMes, montarMesGravado } from '@/lib/conciliacao-db'
import { mesValido } from '@/lib/conciliacao/periodo'
import { trocarCategoria } from '@/lib/fatura-db'
import { categoriasDisponiveis } from '@/lib/fatura/enquadrar'

export const dynamic = 'force-dynamic'

// Trocar a categoria de uma compra da fatura.
//
// **É a rota que decide se esta aba sobrevive ao segundo mês.** Ela grava a
// escolha na memória do ESTABELECIMENTO, não só na linha da compra: sem isso o
// dono recategoriza as mesmas ~70 compras todo mês e abandona a aba na terceira
// vez. Medido nas duas faturas reais: uma memória construída só com setembro já
// cobre 41 das 67 compras de outubro. Pelo mesmo motivo a troca alcança as
// outras compras do mesmo estabelecimento NESTA fatura (ver `trocarCategoria`).
//
// Só a categoria é editável. Valor, estabelecimento e data vêm da fatura e não
// se corrigem à mão — se estiverem errados, o errado é a leitura, e o lugar de
// consertar é o leitor.

type Params = { params: Promise<{ mes: string; compraId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }

  const { mes, compraId: idBruto } = await params
  if (!mesValido(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}". Esperado AAAA-MM.` }, { status: 400 })
  }
  const compraId = Number(idBruto)
  if (!Number.isInteger(compraId) || compraId <= 0) {
    return NextResponse.json({ error: `Compra inválida: "${idBruto}".` }, { status: 400 })
  }

  const corpo: unknown = await req.json().catch(() => null)
  const escolhida =
    corpo && typeof corpo === 'object' && typeof (corpo as { categoria?: unknown }).categoria === 'string'
      ? (corpo as { categoria: string }).categoria.trim()
      : ''
  if (!escolhida) {
    return NextResponse.json({ error: 'Esperado { "categoria": "..." } no corpo.' }, { status: 400 })
  }

  const sistema = await lerSistemaDoMes(mes)
  if (!sistema) {
    return NextResponse.json({ error: `A conciliação de ${mes} ainda não foi enviada.` }, { status: 404 })
  }

  // A categoria tem de ser uma das que o BPO usa NESTE mês (mais o "não
  // identificado"). Aceitar qualquer texto deixaria a memória — que vale para
  // todos os meses seguintes — apontar para uma categoria que não existe do
  // outro lado da comparação, e a linha nasceria sozinha no comparativo. A
  // lista também não oferece "Cartão de Crédito" de volta: mandar a compra para
  // a linha que esta aba existe para abrir não informaria nada.
  const permitidas = categoriasDisponiveis(sistema.map(l => l.categoria))
  const categoria = permitidas.find(c => c === escolhida)
  if (!categoria) {
    return NextResponse.json(
      {
        error:
          `"${escolhida}" não é uma categoria usada em ${mes}. Recarregue a página: a lista de categorias ` +
          `é a do mês, e ela muda quando o mês é reenviado.`,
      },
      { status: 400 }
    )
  }

  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  // A troca e a memória caem ou passam juntas (uma transação, em `fatura-db`).
  const trocada = await trocarCategoria({ mes, compraId, categoria, definidoPor: userName })
  if (!trocada) {
    return NextResponse.json(
      { error: `Esta compra não está na fatura de ${mes}. Recarregue a página.` },
      { status: 404 }
    )
  }

  await logAudit({
    userName,
    action: 'fatura_cartao_categoria',
    entityType: 'fatura_cartao',
    entityId: mes,
    details:
      `compra ${compraId} (${trocada.estabelecimento}) → "${categoria}"; ` +
      `${trocada.alteradas} compra(s) do mesmo estabelecimento na fatura; ` +
      `memória: ${trocada.chave || 'não gravada (sem nome legível)'}`,
  })

  // O mês inteiro volta remontado: trocar a categoria de uma compra move
  // dinheiro entre as categorias do Custos, e a tela não recalcula dinheiro.
  const resultado = await montarMesGravado(mes)
  if (!resultado) {
    return NextResponse.json(
      { error: `A troca foi gravada, mas a conciliação de ${mes} não está mais no sistema. Recarregue a página.` },
      { status: 409 }
    )
  }
  return NextResponse.json(resultado)
}
