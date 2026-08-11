# Código de acesso ao Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o convite por link (UUID) do Portal do Paciente por um código de 6 caracteres ditável por telefone, com o paciente escolhendo o próprio e-mail na ativação.

**Architecture:** A lógica do código (sortear, normalizar, classificar estado) fica isolada num módulo puro e testável. O código mora na própria linha de `patient_users` — não há tabela nova, porque a conta do paciente já existe. A rota antiga por link continua funcionando para os 6 convites pendentes.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Postgres via `postgres` (postgres.js), next-auth v5, bcryptjs, Tailwind v4, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-08-10-codigo-acesso-portal-design.md](../specs/2026-08-10-codigo-acesso-portal-design.md)

---

## O que o banco obrigou a mudar em relação à spec

`patient_users.email` é **`NOT NULL`** hoje. Como o paciente passa a escolher o e-mail só na ativação, a linha precisa nascer sem e-mail — a migração solta essa restrição. O índice `UNIQUE` no e-mail permanece e continua funcionando: em Postgres, `UNIQUE` aceita múltiplos `NULL`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/portal-invite-code.ts` | **Novo.** Alfabeto, sorteio, normalização e classificação de estado. Puro, sem banco — é o que os testes cobrem. |
| `src/lib/db.ts` | +2 colunas, +1 índice, e `email` deixa de ser `NOT NULL`. |
| `src/lib/rate-limit.ts` | +1 escopo (`portal_code`). |
| `src/lib/patient-portal.ts` | Gerar código, ler estado, ativar conta. Estende o arquivo existente. |
| `src/app/api/patients/[id]/portal-invite/route.ts` | `POST` passa a gerar código em vez de link. |
| `src/app/api/portal/codigo/verificar/route.ts` | **Novo.** Público. Diz se o código serve, antes de pedir e-mail e senha. |
| `src/app/api/portal/codigo/ativar/route.ts` | **Novo.** Público. Código + e-mail + senha → conta ativa. |
| `src/app/portal/ativar/page.tsx` | **Novo.** Tela onde o paciente digita o código. |
| `src/components/PatientDetailClient.tsx` | Bloco do portal no card: código, validade e "Copiar mensagem". |

Testes só na lógica pura, como o resto do projeto (`__tests__/lib/patients.test.ts` é um stub porque o projeto não testa banco nem rota).

**Duas limitações declaradas de propósito:**

1. **As tarefas 5 e 6 (telas) vêm especificadas, não pré-escritas.** As outras trazem o código completo. As telas trazem os campos, as chamadas, as mensagens exatas e o comportamento de erro — mas o markup fica com quem implementa, porque precisa copiar as convenções do **portal**, que tem design próprio mobile-first, diferente do sistema interno. Markup inventado aqui entraria em conflito.
2. **A autorização da rota de gerar código não tem teste automatizado.** Ela é protegida pelo `src/proxy.ts`, que exige sessão de staff em tudo sob `/api/patients`. O projeto não testa rota, então isso se confere à mão.

`npx jest` tem **4 suítes que já falhavam antes deste trabalho** (`task-definitions`, `task-completions`, `patients`, `PatientCard`) e `tsc` tem erros pré-existentes em `__tests__/components/PatientCard.test.tsx`. Ignore — só não piore.

---

## Task 1: Lógica pura do código

**Files:**
- Create: `src/lib/portal-invite-code.ts`
- Test: `__tests__/lib/portal-invite-code.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// __tests__/lib/portal-invite-code.test.ts
import {
  ALFABETO, TAMANHO, VALIDADE_DIAS,
  sortearCodigo, normalizarCodigo, classificarCodigo,
} from '@/lib/portal-invite-code'

describe('portal-invite-code — alfabeto', () => {
  it('não tem nenhum caractere que se confunde ao ditar', () => {
    for (const proibido of ['O', '0', 'I', '1', 'L', 'S', '5', 'U', 'V']) {
      expect(ALFABETO).not.toContain(proibido)
    }
  })

  it('tem 27 símbolos e código de 6 posições', () => {
    expect(ALFABETO).toHaveLength(27)
    expect(new Set(ALFABETO).size).toBe(27)
    expect(TAMANHO).toBe(6)
    expect(VALIDADE_DIAS).toBe(30)
  })
})

describe('portal-invite-code — sorteio', () => {
  it('sempre gera 6 caracteres do alfabeto permitido', () => {
    for (let i = 0; i < 200; i++) {
      const c = sortearCodigo()
      expect(c).toHaveLength(TAMANHO)
      expect([...c].every(ch => ALFABETO.includes(ch))).toBe(true)
    }
  })
})

describe('portal-invite-code — normalização', () => {
  it('aceita o que o paciente realmente digita', () => {
    // Minúscula, hífen, espaço e ponto colado pelo teclado do celular.
    expect(normalizarCodigo('k7p2m9')).toBe('K7P2M9')
    expect(normalizarCodigo('K7P2-M9')).toBe('K7P2M9')
    expect(normalizarCodigo('K7P2 M9')).toBe('K7P2M9')
    expect(normalizarCodigo(' k7p2m9. ')).toBe('K7P2M9')
  })

  it('rejeita tamanho errado', () => {
    expect(normalizarCodigo('K7P2M')).toBeNull()
    expect(normalizarCodigo('K7P2M99')).toBeNull()
    expect(normalizarCodigo('')).toBeNull()
  })

  it('rejeita caractere ambíguo, mesmo com tamanho certo', () => {
    expect(normalizarCodigo('K7P2MO')).toBeNull() // letra O
    expect(normalizarCodigo('K7P2M0')).toBeNull() // zero
    expect(normalizarCodigo('K7P2MI')).toBeNull()
    expect(normalizarCodigo('K7P2ML')).toBeNull()
    expect(normalizarCodigo('K7P2MS')).toBeNull()
    expect(normalizarCodigo('K7P2M5')).toBeNull()
    expect(normalizarCodigo('K7P2MU')).toBeNull()
    expect(normalizarCodigo('K7P2MV')).toBeNull()
  })

  it('não estoura com entrada nula', () => {
    expect(normalizarCodigo(null as unknown as string)).toBeNull()
    expect(normalizarCodigo(undefined as unknown as string)).toBeNull()
  })
})

describe('portal-invite-code — estado', () => {
  const agora = new Date('2026-08-10T12:00:00Z')
  const futuro = '2026-09-09T12:00:00Z'
  const passado = '2026-08-01T12:00:00Z'

  it('linha ausente é inválido', () => {
    expect(classificarCodigo(null, agora)).toBe('invalido')
  })

  it('já usado tem precedência sobre expirado', () => {
    // Quem ativou e voltou no link precisa ler "já usado", não "expirado".
    expect(classificarCodigo(
      { invite_used_at: '2026-08-02T10:00:00Z', invite_expires_at: passado }, agora,
    )).toBe('usado')
  })

  it('expirado quando a validade já passou', () => {
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: passado }, agora)).toBe('expirado')
  })

  it('a fronteira exata da expiração já conta como expirado', () => {
    expect(classificarCodigo(
      { invite_used_at: null, invite_expires_at: agora.toISOString() }, agora,
    )).toBe('expirado')
  })

  it('válido quando não foi usado e ainda está no prazo', () => {
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: futuro }, agora)).toBe('valido')
  })

  it('sem data de validade é inválido, não eterno', () => {
    // Linha antiga (convite por link) não tem invite_expires_at — não pode virar
    // um código válido para sempre por omissão.
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: null }, agora)).toBe('invalido')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest __tests__/lib/portal-invite-code.test.ts`
Expected: FAIL — `Cannot find module '@/lib/portal-invite-code'`

- [ ] **Step 3: Implementar**

Criar `src/lib/portal-invite-code.ts`:

```typescript
import { randomInt } from 'crypto'

// Alfabeto SEM caracteres que se confundem falando ou lendo: nada de O/0, I/1/L,
// S/5, U/V. O código é ditado por telefone e digitado de um print do WhatsApp —
// cada ambiguidade aqui vira um paciente que não consegue entrar.
export const ALFABETO = 'ABCDEFGHJKMNPQRTWXYZ2346789'
export const TAMANHO = 6
export const VALIDADE_DIAS = 30

export function sortearCodigo(): string {
  let s = ''
  // randomInt (CSPRNG) e não Math.random: o código é credencial de entrada.
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return s
}

// Aceita o que o paciente realmente digita: minúscula, espaço, hífen e ponto
// colados pelo teclado do celular. Sem isso, "k7p2-m9 " seria recusado sem explicação.
export function normalizarCodigo(bruto: string): string | null {
  const s = (bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== TAMANHO) return null
  if (![...s].every(c => ALFABETO.includes(c))) return null
  return s
}

export type EstadoCodigo = 'valido' | 'invalido' | 'usado' | 'expirado'

export interface LinhaCodigo {
  invite_used_at: string | Date | null
  invite_expires_at: string | Date | null
}

// Estados distintos de propósito: "já usado" manda o paciente pro login em vez
// de dizer "inválido" — é a confusão nº 1 do fluxo por link.
export function classificarCodigo(linha: LinhaCodigo | null, agora: Date = new Date()): EstadoCodigo {
  if (!linha) return 'invalido'
  if (linha.invite_used_at) return 'usado'
  // Sem validade não vira código eterno: linha antiga (convite por link) não tem
  // esta coluna preenchida e não pode passar por código válido.
  if (!linha.invite_expires_at) return 'invalido'
  const expira = new Date(linha.invite_expires_at)
  if (expira.getTime() <= agora.getTime()) return 'expirado'
  return 'valido'
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest __tests__/lib/portal-invite-code.test.ts`
Expected: PASS — 11 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-invite-code.ts __tests__/lib/portal-invite-code.test.ts && git commit -m "feat(portal): logica do codigo de acesso — alfabeto sem ambiguidade, normalizacao e estados"
```

---

## Task 2: Migração e escopo de rate-limit

**Files:**
- Modify: `src/lib/db.ts` (novo bloco no fim de `runMigrations()`)
- Modify: `src/lib/rate-limit.ts`

Sem teste automatizado: o projeto não testa banco.

- [ ] **Step 1: Migração**

Em `src/lib/db.ts`, dentro de `runMigrations()`, **depois do último `await sql.unsafe(...)` e antes do `}` que fecha a função**:

```typescript
  // Código de acesso ao portal (substitui o convite por link).
  await sql.unsafe(`
    ALTER TABLE patient_users ADD COLUMN IF NOT EXISTS invite_code TEXT;
    ALTER TABLE patient_users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS patient_users_invite_code_idx
      ON patient_users (invite_code) WHERE invite_code IS NOT NULL;
  `).catch(() => {})
  // O e-mail passa a ser escolhido pelo PACIENTE na ativação, então a linha
  // nasce sem e-mail. O índice UNIQUE continua valendo: Postgres aceita
  // vários NULL num índice único.
  await sql.unsafe(`ALTER TABLE patient_users ALTER COLUMN email DROP NOT NULL`).catch(() => {})
```

- [ ] **Step 2: Escopo novo de rate-limit**

Em `src/lib/rate-limit.ts`, trocar a linha do tipo:

```typescript
export type RateScope = 'staff' | 'portal' | 'reauth'
```

por:

```typescript
// portal_code: tentativas de adivinhar o código de acesso ao portal. O
// identificador é o IP, nunca o código — se fosse o código, cada tentativa
// cairia num balde diferente e a trava nunca dispararia.
export type RateScope = 'staff' | 'portal' | 'reauth' | 'portal_code'
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo (os de `PatientCard.test.tsx` são pré-existentes)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/rate-limit.ts && git commit -m "feat(portal): colunas do codigo de acesso e escopo de rate-limit por IP"
```

---

## Task 3: Gerar, ler e ativar no `patient-portal.ts`

**Files:**
- Modify: `src/lib/patient-portal.ts`

- [ ] **Step 1: Acrescentar as funções**

Primeiro, **junto dos imports no topo** de `src/lib/patient-portal.ts` (não no fim do arquivo — `import` só vale no topo):

```typescript
import {
  classificarCodigo, normalizarCodigo, sortearCodigo, VALIDADE_DIAS,
  type EstadoCodigo,
} from './portal-invite-code'
import { logAudit } from './audit'
```

Acrescentar também os dois campos novos à interface `PatientUser`, que já existe no arquivo:

```typescript
  invite_code: string | null
  invite_expires_at: string | null
```

Depois, **no fim do arquivo**, as funções:

```typescript
// Gera (ou regera) o código de acesso de um paciente que JÁ EXISTE no sistema.
// Regerar é também a redefinição de senha: o password_hash é zerado, então o
// paciente obrigatoriamente escolhe uma senha nova ao usar o código.
export async function gerarCodigoAcesso(
  patientId: number
): Promise<{ code: string; expiresAt: string }> {
  await initSchema()
  // Colisão é improvável (27^6 ≈ 387 milhões), mas ON CONFLICT + retry é mais
  // honesto do que torcer: sem isso, uma colisão viraria erro 500 sem sentido.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const code = sortearCodigo()
    const rows = await sql<{ invite_expires_at: string }[]>`
      INSERT INTO patient_users (patient_id, invite_code, invite_expires_at)
      VALUES (${patientId}, ${code}, NOW() + (${VALIDADE_DIAS} || ' days')::interval)
      ON CONFLICT (patient_id) DO UPDATE SET
        invite_code = EXCLUDED.invite_code,
        invite_expires_at = EXCLUDED.invite_expires_at,
        invite_used_at = NULL,
        password_hash = NULL
      RETURNING invite_expires_at
    `.catch(() => [] as { invite_expires_at: string }[])
    if (rows.length > 0) return { code, expiresAt: rows[0].invite_expires_at }
  }
  throw new Error('Não deu pra gerar o código. Tente de novo.')
}

export interface LeituraCodigo {
  estado: EstadoCodigo
  patientName?: string
}

// Lê o estado do código ANTES de o paciente preencher e-mail e senha —
// descobrir que expirou só no envio seria perder todo o preenchimento.
export async function lerCodigoAcesso(bruto: string): Promise<LeituraCodigo> {
  const code = normalizarCodigo(bruto)
  if (!code) return { estado: 'invalido' }
  await initSchema()
  const [row] = await sql<{
    invite_used_at: string | null
    invite_expires_at: string | null
    patient_name: string
  }[]>`
    SELECT u.invite_used_at, u.invite_expires_at, p.name AS patient_name
    FROM patient_users u JOIN patients p ON p.id = u.patient_id
    WHERE u.invite_code = ${code}
  `
  const estado = classificarCodigo(row ?? null)
  return estado === 'valido' ? { estado, patientName: row.patient_name } : { estado }
}

export type ResultadoAtivacao =
  | { ok: true; patientId: number; email: string }
  | { ok: false; motivo: EstadoCodigo | 'email_em_uso' | 'senha_curta' }

export const SENHA_MINIMA = 6

// Ativa a conta e queima o código numa transação só. O SELECT ... FOR UPDATE é
// o que impede dois cliques simultâneos em "ativar" de rodarem duas vezes.
export async function ativarComCodigo(input: {
  code: string
  email: string
  password: string
}): Promise<ResultadoAtivacao> {
  const code = normalizarCodigo(input.code)
  if (!code) return { ok: false, motivo: 'invalido' }
  if (!input.password || input.password.length < SENHA_MINIMA) {
    return { ok: false, motivo: 'senha_curta' }
  }
  const email = input.email.toLowerCase().trim()
  await initSchema()
  const hash = await bcrypt.hash(input.password, 12)

  return sql.begin(async (tx) => {
    const [u] = await tx<{
      id: number
      patient_id: number
      invite_used_at: string | null
      invite_expires_at: string | null
    }[]>`
      SELECT id, patient_id, invite_used_at, invite_expires_at
      FROM patient_users WHERE invite_code = ${code} FOR UPDATE
    `
    const estado = classificarCodigo(u ?? null)
    if (estado !== 'valido') return { ok: false, motivo: estado } as ResultadoAtivacao

    // Caso real: casal em que os dois são pacientes e compartilham e-mail.
    // Sem esta checagem o erro sairia como violação de índice, sem explicação.
    const [emUso] = await tx<{ id: number }[]>`
      SELECT id FROM patient_users WHERE email = ${email} AND id <> ${u.id}
    `
    if (emUso) return { ok: false, motivo: 'email_em_uso' } as ResultadoAtivacao

    await tx`
      UPDATE patient_users
      SET email = ${email},
          password_hash = ${hash},
          invite_code = NULL,
          invite_token = NULL,
          invite_used_at = NOW(),
          email_registered_at = NOW()
      WHERE id = ${u.id}
    `
    // O card do paciente também mostra o e-mail — mantém os dois consistentes.
    await tx`UPDATE patients SET email = ${email} WHERE id = ${u.patient_id}`
    return { ok: true, patientId: u.patient_id, email } as ResultadoAtivacao
  }).then(async (r) => {
    // Auditoria fora da transação: registrar não pode derrubar a ativação.
    if (r.ok) {
      await logAudit({
        userName: `paciente:${r.email}`,
        action: 'portal.codigo.usado',
        entityType: 'patient_user',
        patientId: r.patientId,
        details: `Conta do portal ativada por código. E-mail escolhido: ${r.email}`,
      }).catch(() => {})
    }
    return r
  }) as Promise<ResultadoAtivacao>
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo. Se `sql.begin` reclamar da tipagem do retorno, mantenha o `as Promise<ResultadoAtivacao>` — é o padrão já usado em `src/lib/training/sessions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/patient-portal.ts && git commit -m "feat(portal): gerar, ler e ativar conta por codigo de acesso"
```

---

## Task 4: Rotas de API

**Files:**
- Modify: `src/app/api/patients/[id]/portal-invite/route.ts`
- Create: `src/app/api/portal/codigo/verificar/route.ts`
- Create: `src/app/api/portal/codigo/ativar/route.ts`

As duas rotas novas ficam sob `/api/portal`, que o `src/proxy.ts` já trata como público (linha 18) — o paciente ainda não tem sessão quando as chama.

- [ ] **Step 1: Trocar a geração de link por código**

Em `src/app/api/patients/[id]/portal-invite/route.ts`, substituir o `GET` e o `POST` (o `DELETE` fica como está):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import {
  findPortalUserByPatientId, gerarCodigoAcesso, revokePortalAccess,
} from '@/lib/patient-portal'
import { classificarCodigo } from '@/lib/portal-invite-code'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — status atual do acesso do paciente
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await findPortalUserByPatientId(Number(id))
  if (!user) return NextResponse.json({ status: 'none' })

  if (user.invite_used_at) {
    return NextResponse.json({ status: 'active', email: user.email })
  }
  // Código ainda válido: a secretária pode reabrir o card e ver o MESMO código.
  // Sem isso, "perdi a mensagem" viraria sempre um código novo, e o paciente que
  // já tinha anotado o antigo ficaria sem entender por que parou de funcionar.
  if (user.invite_code && classificarCodigo(user) === 'valido') {
    return NextResponse.json({
      status: 'pending',
      email: user.email,
      code: user.invite_code,
      expiresAt: user.invite_expires_at,
    })
  }
  // Convite antigo por link, ainda pendente — segue válido pela rota antiga.
  if (user.invite_token) {
    return NextResponse.json({ status: 'pending_link', email: user.email, token: user.invite_token })
  }
  return NextResponse.json({ status: 'expired', email: user.email })
}

// POST — gera (ou regera) o código. Não recebe e-mail: quem escolhe é o paciente.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const { code, expiresAt } = await gerarCodigoAcesso(Number(id))
    // Regerar apaga a senha do paciente — precisa ficar registrado quem fez.
    const session = await auth()
    await logAudit({
      userName: session?.user?.name ?? 'desconhecido',
      action: 'portal.codigo.gerado',
      entityType: 'patient_user',
      patientId: Number(id),
      details: `Código de acesso ao portal gerado (válido até ${expiresAt}). Senha anterior, se havia, foi apagada.`,
    }).catch(() => {})
    return NextResponse.json({ ok: true, code, expiresAt })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE — revoga acesso (remove patient_users e limpa email)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await revokePortalAccess(Number(id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Rota de verificação do código**

Criar `src/app/api/portal/codigo/verificar/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { lerCodigoAcesso } from '@/lib/patient-portal'
import { assertNotLocked, registerFailure } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Um código de 6 caracteres é credencial de entrada: sem trava, dá pra testar
// milhares por minuto. A trava é por IP — ver comentário em rate-limit.ts.
function ipDe(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'desconhecido'
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req)
  if ((await assertNotLocked('portal_code', ip)).blocked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 }
    )
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  const leitura = await lerCodigoAcesso(String(code ?? ''))
  if (leitura.estado !== 'valido') await registerFailure('portal_code', ip)

  return NextResponse.json(leitura)
}
```

- [ ] **Step 3: Rota de ativação**

Criar `src/app/api/portal/codigo/ativar/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ativarComCodigo, SENHA_MINIMA } from '@/lib/patient-portal'
import { assertNotLocked, clearAttempts, registerFailure } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function ipDe(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'desconhecido'
}

const MENSAGEM: Record<string, string> = {
  invalido: 'Código não encontrado. Confira as 6 letras e números.',
  usado: 'Este código já foi usado. Entre com seu e-mail e senha.',
  expirado: 'Este código expirou. Peça um novo na clínica.',
  email_em_uso: 'Este e-mail já está em uso. Use outro.',
  senha_curta: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`,
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req)
  if ((await assertNotLocked('portal_code', ip)).blocked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    code?: string; email?: string; password?: string
  }
  const email = String(body.email ?? '').trim()
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Informe um e-mail válido.', motivo: 'email_invalido' }, { status: 400 })
  }

  const r = await ativarComCodigo({
    code: String(body.code ?? ''),
    email,
    password: String(body.password ?? ''),
  })

  if (!r.ok) {
    // Erro de preenchimento não é tentativa de adivinhar código — não conta
    // para a trava, senão o paciente se tranca sozinho escolhendo senha curta.
    if (r.motivo === 'invalido' || r.motivo === 'expirado') await registerFailure('portal_code', ip)
    return NextResponse.json(
      { error: MENSAGEM[r.motivo] ?? 'Não foi possível ativar.', motivo: r.motivo },
      { status: 400 }
    )
  }

  await clearAttempts('portal_code', ip).catch(() => {})
  return NextResponse.json({ ok: true, email: r.email })
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros novos; build passa

- [ ] **Step 5: Commit**

```bash
git add src/app/api/patients src/app/api/portal src/lib/patient-portal.ts && git commit -m "feat(portal): rotas de gerar, verificar e ativar codigo de acesso"
```

---

## Task 5: Tela do paciente

**Files:**
- Create: `src/app/portal/ativar/page.tsx`

Esta é a tela pública onde o paciente digita o código. **Não conflita** com `src/app/portal/ativar/[token]/page.tsx`, que continua servindo os 6 convites por link ainda pendentes. O `proxy.ts` já libera `/portal/ativar` sem sessão (linha 17).

Antes de escrever o markup, leia `src/app/portal/ativar/[token]/page.tsx` e `src/app/portal/login/PortalLoginForm.tsx` e **copie as convenções visuais de lá** — o portal tem design próprio (mobile-first), diferente do sistema interno. Não invente um visual novo.

- [ ] **Step 1: Criar a tela**

Componente cliente, em dois passos:

**Passo 1 — código.** Um campo grande para o código, em caixa alta automática, com `inputMode="text"` e `autoCapitalize="characters"`. Ao enviar, chama `POST /api/portal/codigo/verificar`.
- `estado: 'valido'` → mostra "Olá, {patientName}!" e vai para o passo 2
- `estado: 'usado'` → mensagem *"Este código já foi usado. Entre com seu e-mail e senha."* **e um botão que leva a `/portal/login`**
- `estado: 'expirado'` → *"Este código expirou. Peça um novo na clínica."*
- `estado: 'invalido'` → *"Código não encontrado. Confira as 6 letras e números."*
- HTTP 429 → mostra a mensagem de `error` da resposta

**Passo 2 — e-mail e senha.** Campos de e-mail, senha e confirmação de senha. Ao enviar, chama `POST /api/portal/codigo/ativar` com `{ code, email, password }`.
- Sucesso → redireciona para `/portal/login` com uma mensagem de "conta criada, entre com seu e-mail e senha"
- Erro → mostra `error` da resposta acima do formulário, **sem limpar o que já foi digitado**

A confirmação de senha é validada no cliente (as duas iguais) antes de enviar.

- [ ] **Step 2: Verificar**

Run: `npm run build`
Expected: build passa e `/portal/ativar` aparece na lista de rotas

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/ativar/page.tsx && git commit -m "feat(portal): tela onde o paciente digita o codigo de acesso"
```

---

## Task 6: Bloco do portal no card do paciente

**Files:**
- Modify: `src/components/PatientDetailClient.tsx`

O bloco atual (por volta das linhas 228–375) tem estado `status` / `email` / `token` / `link`, um formulário que pede o e-mail antes de gerar, e um campo somente-leitura com o link e botão "Copiar".

- [ ] **Step 1: Trocar o bloco**

Mudanças:

**O formulário de e-mail sai.** Gerar o código não pede mais e-mail — quem escolhe é o paciente. O botão vira **"Gerar código de acesso"** e chama `POST` sem corpo.

**O campo do link vira o código.** Exibir o código em fonte grande e monoespaçada (é o que a secretária vai ditar por telefone), com a validade abaixo: *"válido até {data}"*.

**"Copiar" vira "Copiar mensagem"**, e copia o texto pronto:

```typescript
const mensagem = `Oi ${patientName}! Seu acesso ao portal: entre em ${window.location.origin}/portal/ativar e digite o código ${code}`
```

**Um estado novo, `pending_link`**: paciente com convite antigo por link ainda pendente. Mostrar o link como hoje, com um aviso de que é um convite antigo e que gerar um código novo o substitui.

**Um estado novo, `expired`**: teve código, expirou sem uso. Mostrar *"o código expirou"* e o botão de gerar outro.

**No estado `active`**, o botão passa a ser **"Gerar novo código (redefinir senha)"**, com `confirm()` avisando: *"Isso apaga a senha atual do paciente. Ele vai precisar do código novo para escolher outra. Continuar?"* — porque regerar zera o `password_hash`, e fazer isso sem aviso derrubaria o acesso de um paciente que estava entrando normalmente.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros novos; build passa

- [ ] **Step 3: Commit**

```bash
git add src/components/PatientDetailClient.tsx && git commit -m "feat(portal): card mostra codigo de acesso e mensagem pronta pra copiar"
```

---

## Verificação final

- [ ] `npx jest __tests__/lib/portal-invite-code.test.ts` — 11 testes passando
- [ ] `npx jest` — as 4 suítes que **já estavam quebradas antes deste trabalho** continuam sendo as únicas vermelhas
- [ ] `npx tsc --noEmit` — sem erros novos
- [ ] `npm run build` — passa
- [ ] Com o servidor de pé: gerar código no card de um paciente de teste, abrir `/portal/ativar`, digitar o código **em minúsculo e com hífen**, escolher e-mail e senha, e conferir que entra no portal
- [ ] Repetir o mesmo código: precisa aparecer *"já foi usado"* **com o botão de ir para o login** — não *"inválido"*
- [ ] Gerar um código novo para o mesmo paciente e confirmar que a senha antiga deixou de funcionar
- [ ] Abrir um dos 6 convites antigos por link e confirmar que ainda ativa normalmente
