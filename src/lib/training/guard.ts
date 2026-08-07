import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { getSession } from './sessions'
import type { TrainingSession } from './types'

export async function currentUserId(): Promise<number | null> {
  const session = await auth()
  const id = Number((session?.user as { id?: string })?.id)
  return Number.isFinite(id) ? id : null
}

// Defesa contra IDOR: a sessão de treino é do dono, ou de qualquer admin.
// Devolve 404 (não 403) para quem não é dono — não confirma que a sessão existe.
export async function loadOwnedSession(
  sessionId: number
): Promise<{ session: TrainingSession; userId: number } | { error: string; status: number }> {
  const userId = await currentUserId()
  if (userId === null) return { error: 'Sessão inválida.', status: 401 }

  // id de rota não-numérico (ex.: "abc") viraria NaN e quebraria a query no banco
  // com um erro cru do Postgres — barra aqui e devolve o mesmo 404 do "não existe".
  if (!Number.isFinite(sessionId)) return { error: 'Treino não encontrado.', status: 404 }

  const session = await getSession(sessionId)
  if (!session) return { error: 'Treino não encontrado.', status: 404 }

  if (session.user_id !== userId && !(await isAdminSession())) {
    return { error: 'Treino não encontrado.', status: 404 }
  }
  return { session, userId }
}
