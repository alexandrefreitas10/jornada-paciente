import sql, { initSchema } from './db'

export interface StockItem {
  id: number
  name: string
  unit: string
  notes: string | null
  created_by: string | null
  created_at: string
  quantity: number
  lot: string | null
  expiry_date: string | null
}

export interface StockMovement {
  id: number
  item_id: number
  item_name: string
  type: 'entrada' | 'saida'
  quantity: number
  lot: string | null
  expiry_date: string | null
  patient_id: number | null
  patient_name: string | null
  observation: string | null
  nf_s3_key: string | null
  created_by: string | null
  created_at: string
  measurement_id: number | null
}

export async function listStockItems(): Promise<StockItem[]> {
  await initSchema()
  const rows = await sql<StockItem[]>`
    SELECT
      i.*,
      COALESCE(
        SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
        SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
        0
      ) AS quantity,
      (SELECT lot FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC, id DESC LIMIT 1) AS lot,
      (SELECT expiry_date FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC, id DESC LIMIT 1) AS expiry_date
    FROM stock_items i
    LEFT JOIN stock_movements m ON m.item_id = i.id
    GROUP BY i.id
    -- Esconde apenas os zerados (esgotado é normal). Saldo NEGATIVO aparece
    -- para o operador ver e corrigir, em vez de sumir silenciosamente.
    HAVING COALESCE(
      SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
      SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
      0
    ) <> 0
    ORDER BY i.name ASC
  `
  return rows.map(r => ({ ...r, quantity: Number(r.quantity) }))
}

export async function getStockItem(id: number): Promise<StockItem | null> {
  await initSchema()
  const [row] = await sql<StockItem[]>`
    SELECT
      i.*,
      (SELECT lot FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS lot,
      (SELECT expiry_date FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS expiry_date,
      COALESCE(
        SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
        SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
        0
      ) AS quantity
    FROM stock_items i
    LEFT JOIN stock_movements m ON m.item_id = i.id
    WHERE i.id = ${id}
    GROUP BY i.id
  `
  return row ? { ...row, quantity: Number(row.quantity) } : null
}

export async function createStockItem(
  name: string, unit: string, notes: string | null, createdBy: string | null
): Promise<StockItem> {
  await initSchema()
  const [row] = await sql<(StockItem & { quantity?: number })[]>`
    INSERT INTO stock_items (name, unit, notes, created_by)
    VALUES (${name}, ${unit}, ${notes}, ${createdBy})
    RETURNING *
  `
  return { ...row, quantity: 0 }
}

export async function updateStockItem(
  id: number, name: string, unit: string, notes: string | null
): Promise<StockItem | null> {
  await initSchema()
  await sql`UPDATE stock_items SET name = ${name}, unit = ${unit}, notes = ${notes} WHERE id = ${id}`
  return getStockItem(id)
}

// A coluna quantity é NUMERIC — o driver devolve string; normaliza para number
function normalizeMovement(m: StockMovement): StockMovement {
  return { ...m, quantity: Number(m.quantity) }
}

export async function listMovements(type?: 'entrada' | 'saida'): Promise<StockMovement[]> {
  await initSchema()
  const rows = type
    ? await sql<StockMovement[]>`
        SELECT m.*, i.name AS item_name
        FROM stock_movements m
        JOIN stock_items i ON i.id = m.item_id
        WHERE m.type = ${type}
        ORDER BY m.created_at DESC
      `
    : await sql<StockMovement[]>`
        SELECT m.*, i.name AS item_name
        FROM stock_movements m
        JOIN stock_items i ON i.id = m.item_id
        ORDER BY m.created_at DESC
      `
  return rows.map(normalizeMovement)
}

export async function listMovementsByPatient(patientId: number): Promise<StockMovement[]> {
  await initSchema()

  // Apenas saídas reais do estoque vinculadas ao paciente
  const rows = await sql<StockMovement[]>`
    SELECT m.*, i.name AS item_name
    FROM stock_movements m
    JOIN stock_items i ON i.id = m.item_id
    WHERE m.patient_id = ${patientId} AND m.type = 'saida'
    ORDER BY m.created_at DESC
  `
  return rows.map(normalizeMovement)
}

// Erro de negócio: saída maior que o saldo disponível.
export class InsufficientStockError extends Error {
  constructor(public available: number, public requested: number) {
    super('Saldo insuficiente em estoque')
    this.name = 'InsufficientStockError'
  }
}

export async function createMovement(data: {
  item_id: number
  type: 'entrada' | 'saida'
  quantity: number
  lot?: string | null
  expiry_date?: string | null
  patient_id?: number | null
  patient_name?: string | null
  observation?: string | null
  nf_s3_key?: string | null
  created_by?: string | null
  measurement_id?: number | null
  idempotency_key?: string | null
}): Promise<StockMovement> {
  await initSchema()

  if (!(data.quantity > 0)) {
    throw new Error('Quantidade deve ser maior que zero')
  }

  // Idempotência: se já existe um movimento com essa chave, devolve-o sem
  // gravar de novo (protege contra duplo clique / retry de rede).
  if (data.idempotency_key) {
    const [existing] = await sql<StockMovement[]>`
      SELECT * FROM stock_movements WHERE idempotency_key = ${data.idempotency_key}::uuid
    `
    if (existing) return normalizeMovement(existing)
  }

  // Tudo numa transação com lock por item, para que saldo e regra de lote
  // sejam consistentes sob concorrência.
  const row = await sql.begin(async (tx) => {
    let itemId = data.item_id

    // REGRA CRÍTICA: um item de estoque = um lote. Entrada com lote diferente
    // dos lotes já registrados é redirecionada para o item certo (ou cria um).
    if (data.type === 'entrada' && data.lot && data.lot.trim()) {
      const newLot = data.lot.trim().toLowerCase()
      const existingLots = await tx<{ lot: string }[]>`
        SELECT DISTINCT lot FROM stock_movements
        WHERE item_id = ${itemId} AND type = 'entrada' AND lot IS NOT NULL AND TRIM(lot) <> ''
      `
      const lots = existingLots.map(r => r.lot.trim().toLowerCase())
      if (lots.length > 0 && !lots.includes(newLot)) {
        const [item] = await tx<{ name: string; unit: string; notes: string | null }[]>`
          SELECT name, unit, notes FROM stock_items WHERE id = ${itemId}
        `
        if (item) {
          const [match] = await tx<{ id: number }[]>`
            SELECT DISTINCT i.id FROM stock_items i
            JOIN stock_movements m ON m.item_id = i.id AND m.type = 'entrada'
            WHERE LOWER(TRIM(i.name)) = ${item.name.trim().toLowerCase()}
              AND LOWER(TRIM(m.lot)) = ${newLot}
            LIMIT 1
          `
          if (match) {
            itemId = match.id
          } else {
            const [created] = await tx<{ id: number }[]>`
              INSERT INTO stock_items (name, unit, notes, created_by)
              VALUES (${item.name}, ${item.unit}, ${item.notes}, ${data.created_by ?? null})
              RETURNING id
            `
            itemId = created.id
          }
        }
      }
    }

    // Lock por item (serializa saídas concorrentes do mesmo item)
    await tx`SELECT pg_advisory_xact_lock(${itemId})`

    // Saída nunca pode deixar o saldo negativo
    if (data.type === 'saida') {
      const [{ balance }] = await tx<{ balance: string }[]>`
        SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN quantity ELSE -quantity END), 0) AS balance
        FROM stock_movements WHERE item_id = ${itemId}
      `
      const available = Number(balance)
      if (available - data.quantity < 0) {
        throw new InsufficientStockError(available, data.quantity)
      }
    }

    const [inserted] = await tx<StockMovement[]>`
      INSERT INTO stock_movements (item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key, created_by, measurement_id, idempotency_key)
      VALUES (
        ${itemId}, ${data.type}, ${data.quantity},
        ${data.lot ?? null}, ${data.expiry_date ?? null}, ${data.patient_id ?? null}, ${data.patient_name ?? null},
        ${data.observation ?? null}, ${data.nf_s3_key ?? null}, ${data.created_by ?? null}, ${data.measurement_id ?? null},
        ${data.idempotency_key ?? null}
      )
      RETURNING *
    `
    return inserted
  })

  return normalizeMovement(row as StockMovement)
}

// Cria movimento de ajuste para corrigir quantidade diretamente
export async function adjustStockQuantity(
  itemId: number,
  currentQty: number,
  targetQty: number,
  lot: string | null,
  expiryDate: string | null,
  createdBy: string | null
): Promise<void> {
  await initSchema()
  const diff = targetQty - currentQty
  if (diff !== 0) {
    const type = diff > 0 ? 'entrada' : 'saida'
    await sql`
      INSERT INTO stock_movements (item_id, type, quantity, lot, expiry_date, observation, created_by)
      VALUES (${itemId}, ${type}, ${Math.abs(diff)}, ${lot}, ${expiryDate}, ${'Ajuste manual'}, ${createdBy})
    `
  } else {
    // Quantidade não mudou: atualiza lote/validade direto na última entrada
    await sql`
      UPDATE stock_movements
      SET lot = ${lot}, expiry_date = ${expiryDate}
      WHERE id = (
        SELECT id FROM stock_movements
        WHERE item_id = ${itemId} AND type = 'entrada'
        ORDER BY created_at DESC
        LIMIT 1
      )
    `
  }
}

export async function updateMovement(
  id: number,
  data: { quantity: number; lot?: string | null; expiry_date?: string | null; patient_name?: string | null; observation?: string | null }
): Promise<StockMovement | null> {
  await initSchema()

  // Mesma regra crítica da criação: se a edição muda o lote de uma entrada e o
  // item tem OUTRAS entradas com lote diferente, move a entrada para o item
  // do lote certo (ou cria um novo) — lotes nunca se misturam no mesmo card.
  const [current] = await sql<{ item_id: number; type: string }[]>`
    SELECT item_id, type FROM stock_movements WHERE id = ${id}
  `
  if (!current) return null

  let itemId = current.item_id
  if (current.type === 'entrada' && data.lot && data.lot.trim()) {
    const newLot = data.lot.trim().toLowerCase()
    const otherLots = await sql<{ lot: string }[]>`
      SELECT DISTINCT lot FROM stock_movements
      WHERE item_id = ${itemId} AND type = 'entrada' AND id <> ${id}
        AND lot IS NOT NULL AND TRIM(lot) <> ''
    `
    const lots = otherLots.map(r => r.lot.trim().toLowerCase())
    if (lots.length > 0 && !lots.includes(newLot)) {
      const [item] = await sql<{ name: string; unit: string; notes: string | null }[]>`
        SELECT name, unit, notes FROM stock_items WHERE id = ${itemId}
      `
      if (item) {
        const [match] = await sql<{ id: number }[]>`
          SELECT DISTINCT i.id FROM stock_items i
          JOIN stock_movements m ON m.item_id = i.id AND m.type = 'entrada'
          WHERE LOWER(TRIM(i.name)) = ${item.name.trim().toLowerCase()}
            AND LOWER(TRIM(m.lot)) = ${newLot}
            AND i.id <> ${itemId}
          LIMIT 1
        `
        if (match) {
          itemId = match.id
        } else {
          const [created] = await sql<{ id: number }[]>`
            INSERT INTO stock_items (name, unit, notes, created_by)
            VALUES (${item.name}, ${item.unit}, ${item.notes}, ${null})
            RETURNING id
          `
          itemId = created.id
        }
      }
    }
  }

  if (!(data.quantity > 0)) {
    throw new Error('Quantidade deve ser maior que zero')
  }

  // Transação com lock: aplica a edição e garante que nenhum item afetado
  // (o atual e, se o item_id mudou, o de origem) fique com saldo negativo.
  const originItemId = current.item_id
  const row = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${itemId})`
    if (originItemId !== itemId) await tx`SELECT pg_advisory_xact_lock(${originItemId})`

    const [updated] = await tx<StockMovement[]>`
      UPDATE stock_movements
      SET quantity = ${data.quantity},
          lot = ${data.lot ?? null},
          expiry_date = ${data.expiry_date ?? null},
          patient_name = ${data.patient_name ?? null},
          observation = ${data.observation ?? null},
          item_id = ${itemId}
      WHERE id = ${id}
      RETURNING *
    `
    if (!updated) return null

    for (const affected of new Set([itemId, originItemId])) {
      const [{ balance }] = await tx<{ balance: string }[]>`
        SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN quantity ELSE -quantity END), 0) AS balance
        FROM stock_movements WHERE item_id = ${affected}
      `
      if (Number(balance) < 0) {
        throw new InsufficientStockError(Number(balance), data.quantity)
      }
    }
    return updated
  })

  return row ? normalizeMovement(row as StockMovement) : null
}
