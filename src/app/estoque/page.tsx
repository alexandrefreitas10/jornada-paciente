import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import EstoqueClient from './EstoqueClient'

export const dynamic = 'force-dynamic'

export default async function EstoquePage() {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean } | undefined
  if (!u?.is_admin && !u?.can_estoque) redirect('/')
  return <EstoqueClient initialItems={[]} initialMovements={[]} />
}
