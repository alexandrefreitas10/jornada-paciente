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
      (SELECT lot FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS lot,
      (SELECT expiry_date FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS expiry_date
    FROM stock_items i
    LEFT JOIN stock_movements m ON m.item_id = i.id
    GROUP BY i.id
    HAVING COALESCE(
      SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
      SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
      0
    ) > 0
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
}): Promise<StockMovement> {
  await initSchema()
  const [row] = await sql<StockMovement[]>`
    INSERT INTO stock_movements (item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key, created_by, measurement_id)
    VALUES (
      ${data.item_id}, ${data.type}, ${data.quantity},
      ${data.lot ?? null}, ${data.expiry_date ?? null}, ${data.patient_id ?? null}, ${data.patient_name ?? null},
      ${data.observation ?? null}, ${data.nf_s3_key ?? null}, ${data.created_by ?? null}, ${data.measurement_id ?? null}
    )
    RETURNING *
  `
  return normalizeMovement(row)
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
  const [row] = await sql<StockMovement[]>`
    UPDATE stock_movements
    SET quantity = ${data.quantity},
        lot = ${data.lot ?? null},
        expiry_date = ${data.expiry_date ?? null},
        patient_name = ${data.patient_name ?? null},
        observation = ${data.observation ?? null}
    WHERE id = ${id}
    RETURNING *
  `
  return row ? normalizeMovement(row) : null
}
