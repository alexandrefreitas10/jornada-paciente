import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { getSession } from './sessions'
import type { TrainingSession } from './types'

// Remove os contadores de token da sessão. Custo é informação de gestão: só o
// admin vê. Tem que sair NO SERVIDOR, não só ficar escondido na tela — a
// resposta da API é visível no navegador de qualquer usuário logado.
export function withoutCost(session: TrainingSession): TrainingSession {
  const {
    patient_input_tokens: _pi, patient_output_tokens: _po,
    eval_input_tokens: _ei, eval_output_tokens: _eo,
    ...rest
  } = session
  return rest
}

export async function currentUserId(): Promise<number | null> {
  const session = await auth()
  const id = Number((session?.user as { id?: string })?.id)
  return Number.isFinite(id) ? id : null
}

// Defesa contra IDOR: a sessão de treino é do dono, ou (leitura) de qualquer
// admin. Devolve 404 (não 403) para quem não tem acesso — não confirma que a
// sessão existe.
export async function loadOwnedSession(
  sessionId: number,
  opts: { ownerOnly?: boolean } = {}
): Promise<{ session: TrainingSession; userId: number } | { error: string; status: number }> {
  const userId = await currentUserId()
  if (userId === null) return { error: 'Sessão inválida.', status: 401 }

  // id de rota não-numérico (ex.: "abc") viraria NaN e quebraria a query no banco
  // com um erro cru do Postgres — barra aqui e devolve o mesmo 404 do "não existe".
  if (!Number.isFinite(sessionId)) return { error: 'Treino não encontrado.', status: 404 }

  const session = await getSession(sessionId)
  if (!session) return { error: 'Treino não encontrado.', status: 404 }

  if (session.user_id !== userId) {
    // ownerOnly: usado pelas rotas de escrita (mensagens, encerrar/avaliar) —
    // admin não pode responder dentro do treino nem avaliar por outra pessoa,
    // mesmo podendo LER (GET) qualquer sessão. Sempre 404, nunca 403: tanto
    // faz o motivo (não é dono e não é admin, ou é admin mas a rota é ownerOnly),
    // a resposta não pode revelar se a sessão existe nem por que o acesso foi negado.
    if (opts.ownerOnly || !(await isAdminSession())) {
      return { error: 'Treino não encontrado.', status: 404 }
    }
  }
  return { session, userId }
}
