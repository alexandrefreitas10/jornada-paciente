import { NextRequest, NextResponse } from 'next/server'
import { listMovements, createMovement, InsufficientStockError } from '@/lib/stock'
import { auth } from '@/auth'
import { canEstoqueSession } from '@/lib/authz'
import { resolverPacienteId } from '@/lib/patient-link'
import { validarCompra } from '@/lib/precos'
import type { DadosCompra } from '@/lib/precos-db'

type DadosEntradaCompra = Omit<DadosCompra, 'movementId' | 'itemId' | 'createdBy'>

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as 'entrada' | 'saida' | null
  const movements = await listMovements(type ?? undefined)
  return NextResponse.json(movements)
}

export async function POST(req: NextRequest) {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const body = await req.json()
  const { item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key, measurement_id, idempotency_key, unit_price, laboratory, purchased_at, product_name, source, unit, purchase_quantity } = body
  if (!item_id || !type || !quantity) {
    return NextResponse.json({ error: 'item_id, type e quantity são obrigatórios' }, { status: 400 })
  }

  // Toda ENTRADA registra o que foi pago e de qual laboratório (decisão do
  // dono, sem exceção). Saída não tem preço.
  let compra: DadosEntradaCompra | null = null
  if (type === 'entrada') {
    const produto = String(product_name ?? '').trim()
    // Tirzepatida entra em mg no estoque mas é comprada em frascos: quando a
    // tela manda a quantidade da compra, é ela que vale para o preço unitário
    // (senão o total viraria preço × total de mg). A validação do movimento em
    // si continua sendo sobre `quantity`.
    const qtdCompra = Number(purchase_quantity)
    const quantidadeCompra = Number.isFinite(qtdCompra) && qtdCompra > 0 ? qtdCompra : Number(quantity)
    const validada = validarCompra({
      valor: String(unit_price ?? ''),
      laboratorio: String(laboratory ?? ''),
      quantidade: quantidadeCompra,
    })
    if (!produto || !validada.ok) {
      // Sem o nome do produto o histórico ficaria órfão: a chave de
      // agrupamento é o nome normalizado, não o id do item (que é o lote).
      const campos = validada.ok ? [] : validada.erros
      return NextResponse.json(
        { error: 'Informe o produto, o valor pago e o laboratório desta entrada.', campos },
        { status: 400 }
      )
    }
    compra = {
      produto,
      laboratorio: validada.laboratorio,
      centavos: validada.centavos,
      quantidade: validada.quantidade,
      unidade: unit ? String(unit) : null,
      data: typeof purchased_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(purchased_at)
        ? purchased_at
        : new Date().toISOString().slice(0, 10),
      fonte: source === 'manual' ? 'manual' : 'nf',
      nfS3Key: nf_s3_key ?? null,
    }
  }

  try {
    const movement = await createMovement({
      item_id: Number(item_id), type, quantity: Number(quantity),
      lot, expiry_date, patient_id: await resolverPacienteId(patient_id, patient_name),
      patient_name, observation, nf_s3_key, created_by: createdBy,
      measurement_id: measurement_id ? Number(measurement_id) : null,
      idempotency_key: idempotency_key ?? null,
      compra,
    })
    return NextResponse.json(movement, { status: 201 })
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `Saldo insuficiente: disponível ${err.available}, solicitado ${err.requested}` },
        { status: 409 }
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
