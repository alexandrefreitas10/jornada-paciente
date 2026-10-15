import { NextRequest, NextResponse } from 'next/server'
import { canConciliacaoSession } from '@/lib/authz'
import { montarMesGravado } from '@/lib/conciliacao-db'
import { mesValido } from '@/lib/conciliacao/periodo'

export const dynamic = 'force-dynamic'

// A releitura de um mês já enviado: a MESMA conciliação e o MESMO comparativo
// que o envio devolveu, montados por `montarMesGravado` a partir das linhas
// gravadas — inclusive as compras da fatura do cartão, que entram no comparativo
// pela mesma porta em todos os caminhos.
//
// A `leitura` vem reduzida: só os quatro descartes que o banco guarda, que são
// os que acendem o aviso de falha de leitura. Isso é de propósito — reabrir
// setembro no mês seguinte e ver as mesmas diferenças SEM o aviso faria o dono
// cobrar do BPO um tropeço do leitor. O resto (quantas linhas entraram, período
// do extrato) fica de fora como `undefined`, nunca como zero.

type Params = { params: Promise<{ mes: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }

  const { mes } = await params
  if (!mesValido(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}". Esperado AAAA-MM.` }, { status: 400 })
  }

  const montado = await montarMesGravado(mes)
  if (!montado) {
    return NextResponse.json({ error: `A conciliação de ${mes} ainda não foi enviada.` }, { status: 404 })
  }

  return NextResponse.json(montado)
}
