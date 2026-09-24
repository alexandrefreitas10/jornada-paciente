import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { canEstoqueSession } from '@/lib/authz'
import { validarCompra } from '@/lib/precos'
import { listarPrecos, registrarComprasRetroativas, type DadosCompra } from '@/lib/precos-db'

export const dynamic = 'force-dynamic'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
// O formato sozinho aceita 2026-02-31, que o `::date` do Postgres derrubaria com
// um 500. A ida e volta pelo Date reprova o dia que não existe no calendário.
function dataCompraValida(d: string): boolean {
  if (!DATA_ISO.test(d)) return false
  const dt = new Date(`${d}T12:00:00Z`)
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d
}
// Teto de sanidade: uma nota de papel não tem mais do que isso, e uma lista
// gigante seguraria a transação (e a conexão) sem necessidade.
const MAX_ITENS = 500

export async function GET() {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  return NextResponse.json(await listarPrecos())
}

/**
 * Notas antigas: registra SÓ o preço pago, como linha histórica.
 * Não cria item de estoque nem movimento — por isso monta `DadosCompra` sem
 * `itemId`/`movementId` e chama `registrarComprasRetroativas`, que insere
 * apenas em `stock_purchases`. Se algum dia precisar dar entrada junto, use a
 * rota de movimentos; não misture aqui.
 */
export async function POST(req: NextRequest) {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  const body = await req.json().catch(() => null)
  const itens = Array.isArray(body?.itens) ? body.itens : null
  if (!itens || itens.length === 0) {
    return NextResponse.json({ error: 'Nenhum item enviado' }, { status: 400 })
  }
  if (itens.length > MAX_ITENS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ITENS} itens por nota` }, { status: 400 })
  }

  // Valida a nota INTEIRA antes de gravar qualquer linha: meia nota salva
  // deixaria o histórico mentindo, e o dono não teria como saber o que faltou.
  const compras: DadosCompra[] = []
  for (const i of itens) {
    const produto = String(i?.produto ?? '').trim()
    const validada = validarCompra({
      valor: String(i?.valor ?? ''),
      laboratorio: String(i?.laboratorio ?? ''),
      quantidade: Number(i?.quantidade ?? 0),
    })
    const data = String(i?.data ?? '')
    if (!produto || !validada.ok || !dataCompraValida(data)) {
      return NextResponse.json({ error: `Item inválido: ${produto || '(sem nome)'}` }, { status: 400 })
    }
    const unidade = i?.unidade == null ? '' : String(i.unidade).trim()
    compras.push({
      produto,
      laboratorio: validada.laboratorio,
      centavos: validada.centavos,
      quantidade: validada.quantidade,
      unidade: unidade || null,
      data,
      fonte: 'retroativo',
      nfS3Key: i?.nfS3Key ? String(i.nfS3Key) : null,
      createdBy: userName,
    })
  }

  const total = await registrarComprasRetroativas(compras)
  await logAudit({
    userName,
    action: 'precos_retroativos_registrados',
    entityType: 'stock_purchase',
    details: `${total} item(ns)`,
  })
  return NextResponse.json({ registrados: total }, { status: 201 })
}
