# Intervalo por paciente + Aguardando nova prescrição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Relatórios › Em tratamento, classificar cada paciente pelo seu próprio intervalo de aplicação (ajustável no card) e mostrar numa 4ª sub-aba quem finalizou a prescrição e aguarda a próxima.

**Architecture:** As regras puras (`src/lib/em-tratamento.ts`) ganham intervalo, limite crítico e a etiqueta `aguardando`. O banco ganha a coluna `patients.application_interval_days` e passa a aceitar o modelo `aguardando`. Uma rota PATCH grava o intervalo, e a tela ganha o seletor e a 4ª sub-aba.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-18-intervalo-e-aguardando-design.md](../specs/2026-09-18-intervalo-e-aguardando-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/em-tratamento.ts` | Intervalos, limite crítico, etiqueta `aguardando`, sub-aba `aguardando`, mensagem nova. |
| `src/lib/em-tratamento-db.ts` | Lê o intervalo e a última folha; `definirIntervalo`. |
| `src/lib/db.ts` | Coluna `application_interval_days`; trava de `template` aceita `aguardando`. |
| `src/app/api/reports/em-tratamento/intervalo/route.ts` | **Novo.** PATCH do intervalo. |
| `src/app/relatorios/EmTratamento.tsx` | 4ª sub-aba, card 🔵, seletor de intervalo, legenda. |
| `__tests__/lib/em-tratamento.test.ts`, `__tests__/components/EmTratamento.test.tsx` | Testes. |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco.
- **`npm run build` roda as migrações idempotentes nesse banco.** Isso é conhecido e aceito: a página `/admin/auditoria` é pré-renderizada e chama `initSchema()`. Rode o build só onde o plano pede. É esse build que cria a coluna nova e troca a trava em produção.
- **Scripts `.mts` de conferência (somente leitura):**
  - ficam na raiz do repo e rodam com `node --env-file=.env.local x.mts`;
  - importam `postgres` direto e módulos puros com a extensão `.ts`;
  - não conseguem importar `src/lib/db.ts` nem `src/lib/stock.ts`;
  - apague o script ao terminar e nunca imprima segredos.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas antes deste trabalho (`task-definitions`, `task-completions`, `patients`, `PatientCard`). `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore esses, só não aumente a lista.
- **ESLint:** não está configurado.
- **Nome da trava:** confirmado por leitura em produção, é `treatment_messages_template_check`, com `CHECK (template = ANY (ARRAY['verde','amarela','vermelha']))`. A coluna `application_interval_days` ainda não existe.
- **Sessão da equipe:** vem de `import { auth } from '@/auth'`. `logAudit` vem de `@/lib/audit` e nunca lança erro. `idPacienteValido` vem de `@/lib/arquivo-paciente`.
- **Mesmo instante:** folha e aplicação no mesmo instante contam como "folha depois" (`>=`). Essa é a regra atual e continua.

---

## Task 1: Regras puras (e os ajustes mínimos para compilar)

**Files:**
- Modify: `src/lib/em-tratamento.ts`
- Modify: `src/lib/em-tratamento-db.ts` (só o mapeamento)
- Modify: `src/app/relatorios/EmTratamento.tsx` (só dois objetos)
- Test: `__tests__/lib/em-tratamento.test.ts`, `__tests__/components/EmTratamento.test.tsx` (fixtures)

O tipo `PacienteEmTratamento` e a lista `ETIQUETAS` mudam. Os três consumidores são ajustados aqui só o necessário para compilar e manter o comportamento visível. A tela nova vem na Task 4.

- [ ] **Step 1: Testes que falham** (`__tests__/lib/em-tratamento.test.ts`)

**1a.** No bloco de import do topo, acrescentar `INTERVALOS, INTERVALO_PADRAO, ehIntervaloValido, limiteCritico,` à lista de nomes importados de `@/lib/em-tratamento`.

**1b.** Trocar os três testes de "encerra" do `describe('classificar')`:

```typescript
  it('folha finalizada depois da última aplicação encerra o tratamento', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA)).toBeNull()
  })

  it('folha no mesmo dia, DEPOIS da aplicação, encerra', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-10T18:00:00Z'), AGORA)).toBeNull()
  })
```

por:

```typescript
  it('folha finalizada depois da última aplicação: aguardando nova prescrição', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 6 })
  })

  it('folha no mesmo dia, DEPOIS da aplicação: aguardando', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-10T18:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 7 })
  })
```

e o teste

```typescript
  it('folha e aplicação no mesmo instante contam como encerrado', () => {
    const t = saida('2026-09-10T12:00:00Z')
    expect(classificar(t, new Date(t), AGORA)).toBeNull()
  })
```

por:

```typescript
  it('folha e aplicação no mesmo instante contam como folha depois: aguardando', () => {
    const t = saida('2026-09-10T12:00:00Z')
    expect(classificar(t, new Date(t), AGORA)).toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 7 })
  })

  it('o intervalo não muda quem está aguardando', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA, 21))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 6 })
  })
```

(O teste "sem nenhuma saída, não está em tratamento" continua esperando `null`.)

**1c.** No `describe('mensagens')`, trocar

```typescript
    expect(ETIQUETAS).toEqual(['verde', 'amarela', 'vermelha'])
```

por

```typescript
    expect(ETIQUETAS).toEqual(['verde', 'amarela', 'vermelha', 'aguardando'])
```

e

```typescript
    expect(new Set(textos).size).toBe(3)
```

por

```typescript
    expect(new Set(textos).size).toBe(4)
```

**1d.** No `describe('mensagemLonga')`, renomear o teste `'as três mensagens atuais são longas'` para `'as mensagens atuais são longas'`. O corpo não muda.

**1e.** No `describe('listarSubAba')`, trocar o helper `p` por:

```typescript
  const p = (patientId: number, nome: string, diasSemVir: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir,
    etiqueta: diasSemVir <= 7 ? 'verde' : diasSemVir <= 28 ? 'amarela' : 'vermelha',
    ultimaAplicacao: '2026-09-01T12:00:00.000Z',
    ultimaFolha: null,
    intervalo: 7,
    diasAguardando: null,
    enviada: null,
  })
  const pa = (patientId: number, nome: string, diasAguardando: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir: diasAguardando + 3, diasAguardando,
    etiqueta: 'aguardando',
    ultimaAplicacao: '2026-08-01T12:00:00.000Z',
    ultimaFolha: '2026-08-04T12:00:00.000Z',
    intervalo: 7,
    enviada: null,
  })
```

e acrescentar, dentro do mesmo `describe`, depois do último `it`:

```typescript
  const comAguardando = [...lista, pa(6, 'Zeca', 3), pa(7, 'Beto', 20), pa(8, 'Ana Paula', 20)]

  it('Todos, Não veio e Veio não mostram quem está aguardando', () => {
    expect(listarSubAba(comAguardando, 'todos').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla', 'Bruno', 'Alice'])
    expect(listarSubAba(comAguardando, 'nao_veio').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla'])
    expect(listarSubAba(comAguardando, 'veio').map(x => x.nome)).toEqual(['Alice', 'Bruno'])
  })

  it('Aguardando: só os 🔵, quem espera há mais tempo primeiro, empate por nome', () => {
    expect(listarSubAba(comAguardando, 'aguardando').map(x => x.nome)).toEqual(['Ana Paula', 'Beto', 'Zeca'])
  })
```

**1f.** Acrescentar no **fim** do arquivo:

```typescript
describe('intervalo de aplicação', () => {
  it('as opções e o padrão', () => {
    expect(INTERVALOS).toEqual([7, 10, 14, 15, 21, 28])
    expect(INTERVALO_PADRAO).toBe(7)
  })

  it('só aceita as opções da lista, como número', () => {
    expect(ehIntervaloValido(7)).toBe(true)
    expect(ehIntervaloValido(15)).toBe(true)
    expect(ehIntervaloValido(12)).toBe(false)
    expect(ehIntervaloValido('7')).toBe(false)
    expect(ehIntervaloValido(null)).toBe(false)
  })

  it('limite crítico: 28 dias, ou 2 intervalos a partir de 15', () => {
    expect([7, 10, 14, 15, 21, 28].map(limiteCritico)).toEqual([28, 28, 28, 30, 42, 56])
  })
})

describe('classificar pelo intervalo', () => {
  const s = (iso: string) => new Date(iso)
  const e = (iso: string, n: number) => classificar(s(iso), null, AGORA, n)?.etiqueta

  it('intervalo 10: até 10 em dia, 11–28 faltou, 29+ crítico', () => {
    expect(e('2026-09-07T12:00:00Z', 10)).toBe('verde')     // 10 dias
    expect(e('2026-09-06T12:00:00Z', 10)).toBe('amarela')   // 11
    expect(e('2026-08-20T12:00:00Z', 10)).toBe('amarela')   // 28
    expect(e('2026-08-19T12:00:00Z', 10)).toBe('vermelha')  // 29
  })

  it('intervalo 15: até 15 em dia, 16–30 faltou, 31+ crítico', () => {
    expect(e('2026-09-02T12:00:00Z', 15)).toBe('verde')     // 15
    expect(e('2026-09-01T12:00:00Z', 15)).toBe('amarela')   // 16
    expect(e('2026-08-18T12:00:00Z', 15)).toBe('amarela')   // 30
    expect(e('2026-08-17T12:00:00Z', 15)).toBe('vermelha')  // 31
  })

  it('intervalo 21: até 21 em dia, 22–42 faltou, 43+ crítico', () => {
    expect(e('2026-08-27T12:00:00Z', 21)).toBe('verde')     // 21
    expect(e('2026-08-26T12:00:00Z', 21)).toBe('amarela')   // 22
    expect(e('2026-08-06T12:00:00Z', 21)).toBe('amarela')   // 42
    expect(e('2026-08-05T12:00:00Z', 21)).toBe('vermelha')  // 43
  })

  it('sem intervalo informado vale 7 (comportamento de antes)', () => {
    expect(classificar(s('2026-09-10T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 7 })
    expect(classificar(s('2026-09-09T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 8 })
  })

  it('intervalo inválido (0, negativo) cai no padrão de 7', () => {
    expect(e('2026-09-09T12:00:00Z', 0)).toBe('amarela')
    expect(e('2026-09-10T12:00:00Z', -5)).toBe('verde')
  })
})

describe('mensagem de quem aguarda nova prescrição', () => {
  it('convida para a reavaliação, com o primeiro nome', () => {
    const texto = mensagemPara('aguardando', 'MARIA SOUZA')
    expect(texto.startsWith('Oi, Maria! Tudo bem? 😊 Sua prescrição chegou ao fim')).toBe(true)
    expect(texto).toContain('consulta de reavaliação')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/em-tratamento.test.ts`
Expected: FAIL (nomes novos inexistentes / asserções de `aguardando`).

- [ ] **Step 3: Implementar em `src/lib/em-tratamento.ts`**

**3a.** Trocar:

```typescript
export const ETIQUETAS = ['verde', 'amarela', 'vermelha'] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export type SubAba = 'todos' | 'nao_veio' | 'veio'

export const DIAS_VERDE = 7    // veio nos últimos 7 dias
export const DIAS_AMARELA = 28 // acima disso, crítico
```

por:

```typescript
export const ETIQUETAS = ['verde', 'amarela', 'vermelha', 'aguardando'] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export type SubAba = 'todos' | 'nao_veio' | 'veio' | 'aguardando'

export const DIAS_VERDE = 7    // veio nos últimos 7 dias
export const DIAS_AMARELA = 28 // limite crítico padrão (intervalos abaixo de 15 dias)

// Intervalo de aplicação de cada paciente, escolhido pela equipe no card.
// Lista fechada aqui (e não numa trava do banco) para mudar sem migração.
export const INTERVALOS = [7, 10, 14, 15, 21, 28] as const
export type Intervalo = (typeof INTERVALOS)[number]
export const INTERVALO_PADRAO: Intervalo = 7

export function ehIntervaloValido(valor: unknown): valor is Intervalo {
  return typeof valor === 'number' && (INTERVALOS as readonly number[]).includes(valor)
}

/**
 * Até quantos dias sem vir ainda é 🟡. Quem aplica a cada 15 dias ou mais só
 * vira crítico depois de perder 2 aplicações; os demais, depois de 28 dias.
 */
export function limiteCritico(intervalo: number): number {
  return intervalo >= 15 ? 2 * intervalo : DIAS_AMARELA
}
```

**3b.** Trocar a interface `PacienteEmTratamento` inteira por:

```typescript
export interface PacienteEmTratamento {
  patientId: number
  nome: string
  ultimaAplicacao: string // ISO
  ultimaFolha: string | null // ISO da última folha finalizada, se houver
  intervalo: number
  etiqueta: Etiqueta
  diasSemVir: number
  diasAguardando: number | null // só quando etiqueta = 'aguardando'
  enviada: MarcacaoEnviada | null
}
```

**3c.** Em `MENSAGENS`, acrescentar depois da entrada `vermelha`, antes do `}` que fecha o objeto:

```typescript
  // Texto aprovado pelo dono (18/09).
  aguardando:
    'Oi, {nome}! Tudo bem? 😊 Sua prescrição chegou ao fim — parabéns por concluir ' +
    'essa etapa! Para seguirmos com o seu acompanhamento, vamos agendar sua consulta ' +
    'de reavaliação? Qual o melhor dia para você?',
```

**3d.** Trocar a função `classificar` inteira, incluindo o comentário JSDoc logo acima dela, por:

```typescript
/**
 * `null` só quando o paciente nunca teve aplicação. Folha de prescrição
 * finalizada depois da última aplicação = terminou a prescrição e aguarda a
 * próxima (`aguardando`); uma aplicação depois da folha é um novo ciclo. Os
 * demais são classificados pelo intervalo de aplicação do próprio paciente.
 */
export function classificar(
  ultimaSaida: Date | null,
  ultimaFolha: Date | null,
  agora: Date,
  intervalo: number = INTERVALO_PADRAO,
): { etiqueta: Etiqueta; diasSemVir: number; diasAguardando?: number } | null {
  if (!ultimaSaida) return null
  const diasSemVir = Math.max(0, diasEntre(ultimaSaida, agora))

  if (ultimaFolha && ultimaFolha.getTime() >= ultimaSaida.getTime()) {
    return { etiqueta: 'aguardando', diasSemVir, diasAguardando: Math.max(0, diasEntre(ultimaFolha, agora)) }
  }

  const n = intervalo > 0 ? intervalo : INTERVALO_PADRAO
  const etiqueta: Etiqueta =
    diasSemVir <= n ? 'verde' : diasSemVir <= limiteCritico(n) ? 'amarela' : 'vermelha'
  return { etiqueta, diasSemVir }
}
```

**3e.** Trocar a função `listarSubAba` inteira, incluindo o comentário JSDoc logo acima dela, por:

```typescript
/**
 * "Todos", "Não veio" e "Veio" são só quem está em tratamento (🟢🟡🔴).
 * "Veio" em ordem de nome; "Não veio" e "Todos" por urgência. "Aguardando"
 * mostra quem espera a próxima prescrição, há mais tempo primeiro.
 */
export function listarSubAba(lista: PacienteEmTratamento[], subAba: SubAba): PacienteEmTratamento[] {
  const porNome = (a: PacienteEmTratamento, b: PacienteEmTratamento) => a.nome.localeCompare(b.nome, 'pt-BR')

  if (subAba === 'aguardando') {
    return lista
      .filter(p => p.etiqueta === 'aguardando')
      .sort((a, b) => (b.diasAguardando ?? 0) - (a.diasAguardando ?? 0) || porNome(a, b))
  }
  const emTratamento = lista.filter(p => p.etiqueta !== 'aguardando')
  if (subAba === 'veio') {
    return emTratamento.filter(p => p.etiqueta === 'verde').sort(porNome)
  }
  const base = subAba === 'nao_veio' ? emTratamento.filter(p => p.etiqueta !== 'verde') : emTratamento
  return base.sort((a, b) => b.diasSemVir - a.diasSemVir || porNome(a, b))
}
```

- [ ] **Step 4: Ajustes mínimos nos consumidores**

**4a.** Em `src/lib/em-tratamento-db.ts`:
- no import de `./em-tratamento`, acrescentar `INTERVALO_PADRAO`;
- trocar o bloco `lista.push({ ... })` inteiro por:

```typescript
    lista.push({
      patientId: l.patient_id,
      nome: l.name,
      ultimaAplicacao: iso(l.ultima_saida),
      ultimaFolha: l.ultima_folha ? iso(l.ultima_folha) : null,
      intervalo: INTERVALO_PADRAO,
      etiqueta: situacao.etiqueta,
      diasSemVir: situacao.diasSemVir,
      diasAguardando: situacao.diasAguardando ?? null,
      enviada: l.template && l.sent_at
        ? { template: l.template, sentBy: l.sent_by, sentAt: iso(l.sent_at) }
        : null,
    })
```

**4b.** Em `src/app/relatorios/EmTratamento.tsx`:
- no objeto `ETIQUETA`, acrescentar depois da linha `vermelha`:

```typescript
  aguardando: { icone: '🔵', nome: 'Aguardando', classe: 'bg-blue-50 text-blue-800 border-blue-300' },
```

- trocar o objeto `contagem` por:

```typescript
  const contagem: Record<SubAba, number> = {
    todos: lista.filter(p => p.etiqueta !== 'aguardando').length,
    nao_veio: lista.filter(p => p.etiqueta === 'amarela' || p.etiqueta === 'vermelha').length,
    veio: lista.filter(p => p.etiqueta === 'verde').length,
    aguardando: lista.filter(p => p.etiqueta === 'aguardando').length,
  }
```

**4c.** Em `__tests__/components/EmTratamento.test.tsx`, acrescentar a cada um dos três objetos de `LISTA`, depois de `ultimaAplicacao: '…',`:

```typescript
ultimaFolha: null, intervalo: 7, diasAguardando: null,
```

(As três linhas continuam de uma linha só cada.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest __tests__/lib/em-tratamento.test.ts __tests__/components/EmTratamento.test.tsx` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 suítes pré-existentes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/em-tratamento.ts src/lib/em-tratamento-db.ts src/app/relatorios/EmTratamento.tsx __tests__/lib/em-tratamento.test.ts __tests__/components/EmTratamento.test.tsx && git commit -m "feat(relatorios): regras de intervalo por paciente e aguardando nova prescricao"
```

---

## Task 2: Banco — coluna do intervalo, trava do modelo e consulta

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/em-tratamento-db.ts`

- [ ] **Step 1: Migrações**

**1a.** Em `src/lib/db.ts`, no bloco `CREATE TABLE IF NOT EXISTS treatment_messages`, trocar

```
      template TEXT NOT NULL CHECK (template IN ('verde', 'amarela', 'vermelha')),
```

por

```
      template TEXT NOT NULL CHECK (template IN ('verde', 'amarela', 'vermelha', 'aguardando')),
```

(Vale para banco novo; o banco existente é ajustado pelo bloco abaixo.)

**1b.** No **fim** de `runMigrations()`, antes da `}` que fecha a função:

```typescript

  // Em tratamento: intervalo de aplicação de cada paciente (padrão semanal).
  await sql.unsafe(`
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS application_interval_days INTEGER NOT NULL DEFAULT 7
  `).catch(() => {})

  // Modelo de mensagem "aguardando nova prescrição". Só troca a trava se ela
  // ainda não conhece 'aguardando', para não refazer a cada subida.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'treatment_messages_template_check'
          AND pg_get_constraintdef(oid) LIKE '%aguardando%'
      ) THEN
        ALTER TABLE treatment_messages DROP CONSTRAINT IF EXISTS treatment_messages_template_check;
        ALTER TABLE treatment_messages ADD CONSTRAINT treatment_messages_template_check
          CHECK (template IN ('verde', 'amarela', 'vermelha', 'aguardando'));
      END IF;
    END $$;
  `).catch(() => {})
```

- [ ] **Step 2: Consulta com o intervalo e `definirIntervalo`**

Em `src/lib/em-tratamento-db.ts`:

**2a.** No import de `./em-tratamento`, trocar `INTERVALO_PADRAO` (acrescentado na Task 1) por `type Intervalo`.

**2b.** Na interface `Linha`, acrescentar depois de `name: string`:

```typescript
  intervalo: number
```

**2c.** Na consulta de `listarEmTratamento`, trocar

```sql
    SELECT p.id AS patient_id, p.name, s.ultima_saida, f.ultima_folha,
```

por

```sql
    SELECT p.id AS patient_id, p.name, p.application_interval_days AS intervalo,
           s.ultima_saida, f.ultima_folha,
```

**2d.** Na chamada de `classificar`, acrescentar o intervalo como 4º argumento:

```typescript
    const situacao = classificar(
      new Date(l.ultima_saida),
      l.ultima_folha ? new Date(l.ultima_folha) : null,
      agora,
      l.intervalo,
    )
```

**2e.** No `lista.push`, trocar `intervalo: INTERVALO_PADRAO,` por `intervalo: l.intervalo,`.

**2f.** Acrescentar no fim do arquivo:

```typescript

/**
 * Grava o intervalo de aplicação e devolve o anterior (para a auditoria), ou
 * `null` quando o paciente não existe ou foi excluído.
 */
export async function definirIntervalo(patientId: number, intervalo: Intervalo): Promise<number | null> {
  await initSchema()
  const [r] = await sql<{ anterior: number }[]>`
    WITH a AS (
      SELECT application_interval_days AS anterior
      FROM patients
      WHERE id = ${patientId} AND deleted_at IS NULL
      FOR UPDATE
    )
    UPDATE patients SET application_interval_days = ${intervalo}
    WHERE id = ${patientId} AND deleted_at IS NULL
    RETURNING (SELECT anterior FROM a) AS anterior
  `
  return r ? r.anterior : null
}
```

- [ ] **Step 3: Tipos e testes**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

**Não** rode o build nesta task. É o build da Task 3 que aplica a migração.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/em-tratamento-db.ts && git commit -m "feat(relatorios): intervalo de aplicacao no banco e modelo aguardando"
```

---

## Task 3: Rota do intervalo (+ build e conferência em produção)

**Files:**
- Create: `src/app/api/reports/em-tratamento/intervalo/route.ts`

- [ ] **Step 1: Rota**

Criar `src/app/api/reports/em-tratamento/intervalo/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido } from '@/lib/arquivo-paciente'
import { ehIntervaloValido, INTERVALOS } from '@/lib/em-tratamento'
import { definirIntervalo } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const patientId = idPacienteValido(body?.patient_id)
  const intervalo = body?.intervalo
  if (!patientId || !ehIntervaloValido(intervalo)) {
    return NextResponse.json(
      { error: `patient_id e intervalo (${INTERVALOS.join(', ')} dias) são obrigatórios` },
      { status: 400 }
    )
  }

  const userName = session.user.name ?? 'desconhecido'
  const anterior = await definirIntervalo(patientId, intervalo)
  if (anterior === null) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  if (anterior !== intervalo) {
    await logAudit({
      userName,
      action: 'intervalo_aplicacao_alterado',
      entityType: 'patient',
      entityId: patientId,
      patientId,
      details: `de ${anterior} para ${intervalo} dias`,
    })
  }
  return NextResponse.json({ intervalo })
}
```

- [ ] **Step 2: Tipos, testes e build**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"` → `✓ Compiled successfully`. Confira também que a rota `/api/reports/em-tratamento/intervalo` aparece na lista de rotas.

Esse build aplica as migrações em produção: cria a coluna com 7 para todos e troca a trava.

- [ ] **Step 3: Conferência em produção (somente leitura)**

Criar `conferir-intervalo.mts` na raiz:

```typescript
import postgres from 'postgres'
import { classificar } from './src/lib/em-tratamento.ts'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 60 })
const [coluna] = await sql`
  SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE application_interval_days = 7) AS com_7
  FROM patients`
const [trava] = await sql`
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conname = 'treatment_messages_template_check'`
const linhas = await sql`
  WITH saidas AS (
    SELECT m.patient_id, MAX(m.created_at) AS ultima_saida
    FROM stock_movements m JOIN stock_items i ON i.id = m.item_id
    WHERE m.type = 'saida' AND m.patient_id IS NOT NULL
      AND COALESCE(m.observation, '') <> 'Implante hormonal' AND i.name NOT ILIKE '%implante%'
    GROUP BY m.patient_id
  ),
  folhas AS (
    SELECT patient_id, MAX(created_at) AS ultima_folha FROM patient_files
    WHERE file_type = 'prescription' AND deleted_at IS NULL GROUP BY patient_id
  )
  SELECT p.application_interval_days AS intervalo, s.ultima_saida, f.ultima_folha
  FROM saidas s
  JOIN patients p ON p.id = s.patient_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
  LEFT JOIN folhas f ON f.patient_id = s.patient_id`
await sql.end()

const conta: Record<string, number> = {}
for (const l of linhas) {
  const c = classificar(new Date(l.ultima_saida), l.ultima_folha ? new Date(l.ultima_folha) : null, new Date(), l.intervalo)
  if (c) conta[c.etiqueta] = (conta[c.etiqueta] ?? 0) + 1
}
console.log('pacientes:', coluna, '\ntrava:', trava?.def, '\netiquetas:', conta)
```

Run: `node --env-file=.env.local conferir-intervalo.mts`

Expected:
- `total` igual a `com_7`, porque todo mundo começa com 7;
- a trava contém `aguardando`;
- as etiquetas ficam perto de verde+amarela+vermelha ≈ 47 e aguardando ≈ 39, os números da tela em 18/09. Os números mudam a cada dia.

Se a coluna ou a trava não tiverem mudado, pare e reporte.

Depois: `rm conferir-intervalo.mts`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/em-tratamento/intervalo/route.ts && git commit -m "feat(relatorios): rota para ajustar o intervalo de aplicacao"
```

---

## Task 4: Tela — 4ª sub-aba, card 🔵 e seletor de intervalo

**Files:**
- Modify: `src/app/relatorios/EmTratamento.tsx`
- Modify: `src/lib/em-tratamento.ts` (remover `DIAS_VERDE` se sobrar sem uso)
- Test: `__tests__/components/EmTratamento.test.tsx`

- [ ] **Step 1: Testes que falham**

Em `__tests__/components/EmTratamento.test.tsx`:

**1a.** Acrescentar um 4º paciente ao fim de `LISTA` (ele não entra em Todos, então as contagens e posições dos testes existentes não mudam):

```typescript
  { patientId: 4, nome: 'Davi Rocha', etiqueta: 'aguardando', diasSemVir: 12, ultimaAplicacao: '2026-09-05T12:00:00.000Z', ultimaFolha: '2026-09-12T12:00:00.000Z', intervalo: 7, diasAguardando: 5, enviada: null },
```

**1b.** No `beforeEach`, acrescentar como **primeira** linha dentro do `jest.fn(async (url, init) => {`:

```typescript
    if (init?.method === 'PATCH') {
      return { ok: true, status: 200, json: async () => ({ intervalo: JSON.parse(String(init.body)).intervalo }) }
    }
```

**1c.** Acrescentar dentro do `describe('EmTratamento', ...)`:

```typescript
  it('a 4ª sub-aba mostra só quem aguarda nova prescrição', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(nomes()).not.toContain('Davi Rocha')

    await userEvent.click(screen.getByRole('button', { name: 'Aguardando nova prescrição (1)' }))
    expect(nomes()).toEqual(['Davi Rocha'])
    const davi = cards()[0]
    expect(davi).toHaveTextContent('🔵 Aguardando')
    expect(davi).toHaveTextContent(/Prescrição finalizada em .* · há 5 dias/)
    expect(davi).not.toHaveTextContent('dias sem vir')
    expect(davi).toHaveTextContent('Oi, Davi! Tudo bem? 😊 Sua prescrição chegou ao fim')
    expect(within(davi).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
  })

  it('marcar como enviada no 🔵 usa o modelo aguardando', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'Aguardando nova prescrição (1)' }))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Marcar como enviada/ }))
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')
    expect(JSON.parse(String(post[1].body))).toEqual({ patient_id: 4, template: 'aguardando' })
  })

  it('a legenda explica a regra por intervalo', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByText(/dentro do intervalo/)).toHaveTextContent(
      '🟢 dentro do intervalo · 🟡 passou do intervalo · 🔴 mais de 28 dias (ou 2 intervalos, para quem aplica a cada 15+ dias) · 🔵 prescrição finalizada'
    )
  })

  it('mudar o intervalo salva, e quem estava em dia pelo intervalo novo vai para Veio', async () => {
    // Datas relativas a agora: a etiqueta é recalculada na hora da troca.
    const dezDiasAtras = new Date(Date.now() - 10 * 86400000).toISOString()
    const lista = LISTA.map(p => (p.patientId === 2 ? { ...p, ultimaAplicacao: dezDiasAtras, diasSemVir: 10 } : p))
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => lista }))
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Veio (1)' })).toBeInTheDocument()

    const carla = cards()[1]
    const seletor = within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' })
    expect(seletor).toHaveValue('7')
    await userEvent.selectOptions(seletor, '15')

    const patch = fetchMock.mock.calls.find(c => c[1]?.method === 'PATCH')
    expect(patch[0]).toBe('/api/reports/em-tratamento/intervalo')
    expect(JSON.parse(String(patch[1].body))).toEqual({ patient_id: 2, intervalo: 15 })
    expect(await screen.findByRole('button', { name: 'Veio (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (1)' })).toBeInTheDocument()
    expect(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' })).toHaveValue('15')
  })

  it('se salvar o intervalo falha, volta ao valor anterior e avisa no card', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => LISTA })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.selectOptions(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' }), '15')

    expect(await within(cards()[1]).findByRole('alert')).toHaveTextContent('Não foi possível salvar o intervalo')
    expect(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' })).toHaveValue('7')
    expect(screen.getByRole('button', { name: 'Não veio (2)' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar em `src/app/relatorios/EmTratamento.tsx`**

**3a.** No import de `@/lib/em-tratamento`, trocar a linha

```typescript
  listarSubAba, mensagemPara, mensagemLonga, DIAS_VERDE, DIAS_AMARELA,
```

por

```typescript
  listarSubAba, mensagemPara, mensagemLonga, classificar, INTERVALOS,
```

**3b.** Em `SUB_ABAS`, acrescentar depois de `{ key: 'veio', label: 'Veio' },`:

```typescript
  { key: 'aguardando', label: 'Aguardando nova prescrição' },
```

**3c.** Logo depois da linha `const [salvandoArquivo, setSalvandoArquivo] = useState(false)`:

```typescript
  const [salvandoIntervalo, setSalvandoIntervalo] = useState<number | null>(null)
```

**3d.** Logo antes de `function abrirArquivamento(`:

```typescript
  async function alterarIntervalo(p: PacienteEmTratamento, novo: number) {
    if (novo === p.intervalo) return
    const anterior = p
    // Otimista: a etiqueta muda na hora; volta se o servidor recusar.
    const situacao = classificar(
      new Date(p.ultimaAplicacao),
      p.ultimaFolha ? new Date(p.ultimaFolha) : null,
      new Date(),
      novo,
    )
    const atualizado: PacienteEmTratamento = situacao
      ? { ...p, intervalo: novo, etiqueta: situacao.etiqueta, diasSemVir: situacao.diasSemVir, diasAguardando: situacao.diasAguardando ?? null }
      : { ...p, intervalo: novo }
    setAviso(null)
    setSalvandoIntervalo(p.patientId)
    setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? atualizado : x)))
    try {
      const res = await fetch('/api/reports/em-tratamento/intervalo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: p.patientId, intervalo: novo }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? anterior : x)))
      setAviso({ id: p.patientId, texto: 'Não foi possível salvar o intervalo. Tente de novo.' })
    } finally {
      setSalvandoIntervalo(null)
    }
  }

```

**3e.** Trocar a legenda:

```tsx
        <p className="text-xs text-gray-500">
          🟢 veio nos últimos {DIAS_VERDE} dias · 🟡 {DIAS_VERDE + 1} a {DIAS_AMARELA} dias sem vir · 🔴 mais de {DIAS_AMARELA} dias
        </p>
```

por:

```tsx
        <p className="text-xs text-gray-500">
          🟢 dentro do intervalo · 🟡 passou do intervalo · 🔴 mais de 28 dias (ou 2 intervalos, para quem aplica a cada 15+ dias) · 🔵 prescrição finalizada
        </p>
```

**3f.** Trocar a linha de informações do card:

```tsx
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última aplicação: {dia(p.ultimaAplicacao)}
                    {p.etiqueta !== 'verde' && ` · há ${p.diasSemVir} dias sem vir`}
                  </p>
```

por:

```tsx
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.etiqueta === 'aguardando' && p.ultimaFolha
                      ? `Prescrição finalizada em ${dia(p.ultimaFolha)} · há ${p.diasAguardando ?? 0} dias · última aplicação: ${dia(p.ultimaAplicacao)}`
                      : `Última aplicação: ${dia(p.ultimaAplicacao)}${
                          p.etiqueta === 'amarela' || p.etiqueta === 'vermelha' ? ` · há ${p.diasSemVir} dias sem vir` : ''
                        }`}
                  </p>
                  <label className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                    Aplicação a cada
                    <select
                      aria-label="Intervalo de aplicação"
                      value={p.intervalo}
                      onChange={e => alterarIntervalo(p, Number(e.target.value))}
                      disabled={salvandoIntervalo === p.patientId}
                      className="border border-gray-300 rounded-md px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
                    >
                      {!(INTERVALOS as readonly number[]).includes(p.intervalo) && (
                        <option value={p.intervalo}>{p.intervalo} dias</option>
                      )}
                      {INTERVALOS.map(n => (
                        <option key={n} value={n}>{n} dias</option>
                      ))}
                    </select>
                  </label>
```

O botão 📦 já aparece em todo card que não é 🟢, então vale também para os 🔵. Não mude a condição dele.

- [ ] **Step 4: Limpeza**

Run: `grep -rn "DIAS_VERDE" src __tests__`
Se só sobrar a definição em `src/lib/em-tratamento.ts`, remova a linha `export const DIAS_VERDE = 7 ...`. `DIAS_AMARELA` continua, porque é usado por `limiteCritico`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx` → PASS (rode 3 vezes).
Run: `npx jest __tests__/lib/em-tratamento.test.ts` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

Se um teste antigo quebrar por causa da nova linha do card ou do seletor, ajuste a **consulta** do teste, nunca o texto visível. Reporte.

- [ ] **Step 6: Commit**

```bash
git add src/app/relatorios/EmTratamento.tsx src/lib/em-tratamento.ts __tests__/components/EmTratamento.test.tsx && git commit -m "feat(relatorios): sub-aba Aguardando nova prescricao e intervalo no card"
```

---

## Verificação final

- [ ] `npx jest`: só as 4 suítes pré-existentes em FAIL
- [ ] `npx tsc --noEmit`: nenhum erro novo
- [ ] `npm run build`: passa
- [ ] a conferência da Task 3 mostrou a coluna com 7 para todos, a trava com `aguardando` e cerca de 47 pacientes em tratamento + 39 aguardando
- [ ] `git status`: nada solto, exceto `.claude/launch.json`, que já estava modificado antes
- [ ] Depois do deploy, o dono confere:
  - a sub-aba "Aguardando nova prescrição" com cerca de 39 pacientes;
  - trocar o intervalo de um paciente de 15 dias e vê-lo sair de "Não veio";
  - marcar uma mensagem 🔵 como enviada.
