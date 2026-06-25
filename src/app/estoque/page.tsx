import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listStockItems, listMovements } from '@/lib/stock'
import EstoqueClient from './EstoqueClient'

export const dynamic = 'force-dynamic'

export default async function EstoquePage() {
  const session = await auth()
  if (!(session?.user as { is_admin?: boolean } | undefined)?.is_admin) redirect('/')

  const [items, movements] = await Promise.all([
    listStockItems(),
    listMovements(),
  ])
  return <EstoqueClient initialItems={items} initialMovements={movements} />
}
