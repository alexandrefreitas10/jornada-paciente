import { listStockItems, listMovements } from '@/lib/stock'
import EstoqueClient from './EstoqueClient'

export const dynamic = 'force-dynamic'

export default async function EstoquePage() {
  const [items, movements] = await Promise.all([
    listStockItems(),
    listMovements(),
  ])
  return <EstoqueClient initialItems={items} initialMovements={movements} />
}
