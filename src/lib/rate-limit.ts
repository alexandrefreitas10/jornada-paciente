import sql, { initSchema } from './db'

// Rate-limiting de login persistido em Postgres (funciona em multi-instância no
// Render, onde memória de processo não é compartilhada). Uma linha por
// (scope, identifier); o incremento é uma única instrução atômica.

// Extrai o IP do cliente para usar como identificador da trava. Por convenção,
// o proxy reverso (Render) ANEXA o IP do peer ao final de X-Forwarded-For —
// não substitui, não prepende. Um cliente que manda seu próprio cabeçalho
// X-Forwarded-For só controla os elementos da frente da lista; o ÚLTIMO é
// sempre o que o proxy escreveu. Ler o [0] (primeiro), como o código antigo
// fazia, lê exatamente o valor que o atacante escolheu — `curl -H
// 'X-Forwarded-For: qualquer-coisa'` bastava para cair sempre num balde novo
// e desligar a trava de força bruta. Por isso pegamos o último valor NÃO
// VAZIO: um cabeçalho presente mas vazio ('') não é nullish, então `??` não
// pega o fallback — sem filtrar string vazia, isso faria toda requisição
// nessas condições cair no mesmo balde de x-real-ip.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const partes = xff.split(',').map(p => p.trim()).filter(Boolean)
    if (partes.length > 0) return partes[partes.length - 1]
  }
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'desconhecido'
}

const MAX_FAILS = 5 // falhas na janela antes do lockout. Janela e lockout: 15 min (literais no SQL).

// portal_code: tentativas de adivinhar o código de acesso ao portal. O
// identificador é o IP, nunca o código — se fosse o código, cada tentativa
// cairia num balde diferente e a trava nunca dispararia.
export type RateScope = 'staff' | 'portal' | 'reauth' | 'portal_code'
export interface RateStatus { blocked: boolean; retryAfterSec: number }

function norm(id: string) { return id.toLowerCase().trim() }

// Chamar ANTES do bcrypt. Se estiver bloqueado, nem gasta o hash.
export async function assertNotLocked(scope: RateScope, rawId: string): Promise<RateStatus> {
  await initSchema()
  const [row] = await sql<{ retry: number }[]>`
    SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())))::int AS retry
    FROM login_attempts
    WHERE scope = ${scope} AND identifier = ${norm(rawId)}
      AND locked_until IS NOT NULL AND locked_until > NOW()
  `
  if (row) return { blocked: true, retryAfterSec: Math.max(row.retry, 1) }
  return { blocked: false, retryAfterSec: 0 }
}

// Chamar quando a senha estiver ERRADA (ou usuário/e-mail inexistente).
// Incremento atômico numa única instrução — correto em multi-instância (o
// row-lock do ON CONFLICT serializa instâncias concorrentes).
export async function registerFailure(scope: RateScope, rawId: string): Promise<RateStatus> {
  await initSchema()
  const [row] = await sql<{ locked_until: string | null; retry: number | null }[]>`
    INSERT INTO login_attempts (scope, identifier, fail_count, first_fail_at, last_fail_at)
    VALUES (${scope}, ${norm(rawId)}, 1, NOW(), NOW())
    ON CONFLICT (scope, identifier) DO UPDATE SET
      fail_count = CASE
        WHEN login_attempts.first_fail_at < NOW() - INTERVAL '15 minutes' THEN 1
        ELSE login_attempts.fail_count + 1 END,
      first_fail_at = CASE
        WHEN login_attempts.first_fail_at < NOW() - INTERVAL '15 minutes' THEN NOW()
        ELSE login_attempts.first_fail_at END,
      last_fail_at = NOW(),
      locked_until = CASE
        WHEN (CASE WHEN login_attempts.first_fail_at < NOW() - INTERVAL '15 minutes'
                   THEN 1 ELSE login_attempts.fail_count + 1 END) >= ${MAX_FAILS}
          THEN NOW() + INTERVAL '15 minutes'
        ELSE NULL END
    RETURNING locked_until,
      CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())))::int AS retry
  `
  const blocked = !!row.locked_until && new Date(row.locked_until).getTime() > Date.now()
  return { blocked, retryAfterSec: blocked ? Math.max(row.retry ?? 1, 1) : 0 }
}

// Chamar no login BEM-SUCEDIDO: zera o contador para não punir quem só errou antes.
export async function clearAttempts(scope: RateScope, rawId: string): Promise<void> {
  await initSchema()
  await sql`DELETE FROM login_attempts WHERE scope = ${scope} AND identifier = ${norm(rawId)}`.catch(() => {})
}
