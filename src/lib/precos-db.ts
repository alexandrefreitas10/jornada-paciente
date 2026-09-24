import type postgres from 'postgres'
import sql, { initSchema } from '@/lib/db'
import { chaveLaboratorio, chaveProduto, type Compra, type Fonte, type GrupoPreco } from './precos'

export interface DadosCompra {
  produto: string
  laboratorio: string
  centavos: number
  quantidade: number
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte
  itemId?: number | null
  movementId?: number | null
  nfS3Key?: string | null
  createdBy?: string | null
}

// `tx` permite gravar dentro da transação da entrada de estoque: entrada sem
// preço não pode existir.
type Executor = typeof sql | postgres.TransactionSql

// Assume que `initSchema()` já rodou: os dois chamadores (createMovement e
// registrarComprasRetroativas) garantem isso antes de chamar. Não chame esta
// função "a frio" de uma rota nova sem migrar antes.
export async function registrarCompra(dados: DadosCompra, tx: Executor = sql): Promise<void> {
  const total = Math.round(dados.centavos * dados.quantidade)
  await tx`
    INSERT INTO stock_purchases (
      product_name, product_key, laboratory, laboratory_key,
      unit_price_cents, quantity, unit, total_cents,
      purchased_at, source, item_id, movement_id, nf_s3_key, created_by
    ) VALUES (
      ${dados.produto}, ${chaveProduto(dados.produto)},
      ${dados.laboratorio}, ${chaveLaboratorio(dados.laboratorio)},
      ${dados.centavos}, ${dados.quantidade}, ${dados.unidade ?? null}, ${total},
      ${dados.data}::date, ${dados.fonte}, ${dados.itemId ?? null},
      ${dados.movementId ?? null}, ${dados.nfS3Key ?? null}, ${dados.createdBy ?? null}
    )
  `
}

export async function registrarComprasRetroativas(lista: DadosCompra[]): Promise<number> {
  if (lista.length === 0) return 0
  await initSchema()
  await sql.begin(async (tx) => {
    for (const dados of lista) await registrarCompra(dados, tx)
  })
  return lista.length
}

interface LinhaCompra {
  product_name: string
  product_key: string
  laboratory: string
  laboratory_key: string
  unit_price_cents: number
  quantity: string | number
  unit: string | null
  purchased_at: Date | string
  source: Fonte
}

/** Um grupo por produto+laboratório, com o histórico do mais novo ao mais antigo. */
export async function listarPrecos(): Promise<GrupoPreco[]> {
  await initSchema()
  const linhas = await sql<LinhaCompra[]>`
    SELECT product_name, product_key, laboratory, laboratory_key,
           unit_price_cents, quantity, unit, purchased_at, source
    FROM stock_purchases
    ORDER BY purchased_at DESC, id DESC
  `

  const grupos = new Map<string, GrupoPreco>()
  for (const l of linhas) {
    const chave = `${l.product_key}|${l.laboratory_key}`
    const compra: Compra = {
      centavos: l.unit_price_cents,
      quantidade: Number(l.quantity),
      unidade: l.unit,
      // DATE vem como Date; só a parte do dia interessa.
      data: new Date(l.purchased_at).toISOString().slice(0, 10),
      fonte: l.source,
    }
    const grupo = grupos.get(chave)
    if (grupo) grupo.historico.push(compra)
    // O nome exibido é o da compra mais recente (a consulta já vem ordenada).
    else grupos.set(chave, { produto: l.product_name, laboratorio: l.laboratory, chave, historico: [compra] })
  }
  return [...grupos.values()]
}
