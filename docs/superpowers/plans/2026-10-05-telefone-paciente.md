# Telefone do paciente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à clínica um lugar para guardar o telefone do paciente — obrigatório no cadastro novo, visível e editável na ficha, e preenchível direto no card de quem está em tratamento — para que a automação de mensagem tenha a quem enviar.

**Architecture:** Uma função pura valida e formata o telefone, e é a mesma usada pela tela e pelas rotas. O cadastro grava o telefone junto do paciente; uma rota nova altera só o telefone, sem tocar nos outros dados. A aba Em tratamento passa a receber o telefone na mesma consulta que já monta a lista.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-05-telefone-paciente-design.md](../specs/2026-10-05-telefone-paciente-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/telefone.ts` | **Novo.** Limpar, validar e formatar. Puro. |
| `src/lib/patients.ts` | `PatientInput` com telefone; `createPatient` e `updatePatient` gravam; `PatientRow` declara a coluna. |
| `src/app/api/patients/route.ts` | POST exige telefone válido. |
| `src/app/api/patients/[id]/route.ts` | PUT aceita telefone (vazio permitido, inválido não). |
| `src/app/api/patients/[id]/phone/route.ts` | **Novo.** PATCH que altera só o telefone. |
| `src/lib/em-tratamento.ts` | `PacienteEmTratamento` ganha `telefone`. |
| `src/lib/em-tratamento-db.ts` | A consulta devolve o telefone. |
| `src/components/PatientModal.tsx` | Campo Telefone; obrigatório só no cadastro novo. |
| `src/components/NewPatientButton.tsx` | Passa o telefone no POST e marca o modal como obrigatório. |
| `src/components/PatientDetailClient.tsx` | Linha de telefone no cabeçalho; passa o telefone no PUT. |
| `src/app/relatorios/EmTratamento.tsx` | Marca "sem telefone", campo no card e contador no topo. |
| Testes | `__tests__/lib/telefone.test.ts` (novo), `__tests__/components/EmTratamento.test.tsx` (existente). |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco. **Não rode `npm run build`** — quem roda sou eu no fim.
- **Não há migração.** `patients.phone TEXT` já existe (`src/lib/db.ts:328`).
- **Não altere nenhum telefone já gravado.** Existem 4, digitados livremente pelos pacientes no portal. A regra nova vale para o que for gravado daqui em diante; a formatação devolve o valor intacto quando ele não tem 10 nem 11 dígitos.
- **Não toque em `updatePatientProfile` nem na rota `/api/patients/[id]/profile`.** Elas são do portal e regravam `birth_date`, `phone` e `email` de uma vez — reaproveitá-las apagaria dados do paciente. É por isso que existe uma rota só para o telefone.
- **`PatientModal` é usado pelo cadastro novo E pela edição da ficha** (`PatientDetailClient.tsx:210`). O telefone é obrigatório **só no cadastro novo**: travar a edição impediria de corrigir o nome de um dos 165 pacientes que ainda não têm número.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas (`task-definitions`, `task-completions`, `patients`, `PatientCard`). `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **DDD 55 existe** (Santa Maria/RS). O `55` do Brasil só pode ser removido quando o número tem 12 ou 13 dígitos — nunca de um número de 10 ou 11.

---

## Task 1: Regras puras do telefone

**Files:**
- Create: `src/lib/telefone.ts`
- Test: `__tests__/lib/telefone.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/telefone.test.ts`:

```typescript
import { digitosTelefone, formatarTelefone, validarTelefone } from '@/lib/telefone'

describe('digitosTelefone', () => {
  it('fica só com os dígitos', () => {
    expect(digitosTelefone('(62) 98149-1277')).toBe('62981491277')
    expect(digitosTelefone(' 62 3241 1277 ')).toBe('6232411277')
  })

  it('tira o 55 do Brasil quando ele sobra na frente', () => {
    expect(digitosTelefone('+55 62 98149-1277')).toBe('62981491277')
    expect(digitosTelefone('556232411277')).toBe('6232411277')
  })

  it('NÃO tira o 55 quando ele é o DDD', () => {
    // DDD 55 é Santa Maria/RS: 11 dígitos não podem perder o começo.
    expect(digitosTelefone('(55) 99876-5432')).toBe('55998765432')
    expect(digitosTelefone('(55) 3221-5432')).toBe('5532215432')
  })

  it('aguenta vazio', () => {
    expect(digitosTelefone('')).toBe('')
    expect(digitosTelefone('abc')).toBe('')
  })
})

describe('validarTelefone', () => {
  it('aceita celular e fixo com DDD, digitados de qualquer jeito', () => {
    expect(validarTelefone('(62) 98149-1277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('62981491277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('+55 62 98149 1277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('(62) 3241-1277')).toEqual({ ok: true, digitos: '6232411277' })
  })

  it('recusa vazio', () => {
    expect(validarTelefone('').ok).toBe(false)
    expect(validarTelefone('   ').ok).toBe(false)
  })

  it('recusa curto demais e longo demais', () => {
    expect(validarTelefone('981491277').ok).toBe(false)      // 9 dígitos
    expect(validarTelefone('629814912770').ok).toBe(false)   // 12 dígitos sem 55
  })

  it('recusa DDD inválido', () => {
    expect(validarTelefone('01981491277').ok).toBe(false)
    expect(validarTelefone('10981491277').ok).toBe(false)
  })

  it('recusa celular de 11 dígitos que não começa com 9', () => {
    expect(validarTelefone('62881491277').ok).toBe(false)
  })

  it('diz o motivo', () => {
    const r = validarTelefone('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/DDD/i)
  })
})

describe('formatarTelefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('62981491277')).toBe('(62) 98149-1277')
    expect(formatarTelefone('6232411277')).toBe('(62) 3241-1277')
  })

  it('formata também o que veio com +55', () => {
    expect(formatarTelefone('+5562981491277')).toBe('(62) 98149-1277')
  })

  it('valor antigo em formato livre volta como está', () => {
    // Os 4 telefones que já existem foram digitados pelo paciente no portal.
    expect(formatarTelefone('whatsapp 9999')).toBe('whatsapp 9999')
    expect(formatarTelefone('981491277')).toBe('981491277')
  })

  it('vazio e nulo viram string vazia', () => {
    expect(formatarTelefone(null)).toBe('')
    expect(formatarTelefone('')).toBe('')
    expect(formatarTelefone(undefined)).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/telefone.test.ts`
Expected: FAIL — `Cannot find module '@/lib/telefone'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/telefone.ts`:

```typescript
// Telefone do paciente. Puro de propósito: é o dado que vai alimentar o envio
// das mensagens, e a tela e o servidor precisam recusar exatamente a mesma coisa.

/**
 * Só os dígitos. O `55` do Brasil cai quando sobra na frente — e SÓ aí: o DDD
 * 55 existe (Santa Maria/RS), então um número de 10 ou 11 dígitos nunca perde
 * o começo.
 */
export function digitosTelefone(texto: string | null | undefined): string {
  const d = (texto ?? '').replace(/\D/g, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

export type ResultadoTelefone =
  | { ok: true; digitos: string }
  | { ok: false; motivo: string }

/** Aceita 10 (fixo) ou 11 (celular, com 9 na frente), com DDD de 11 a 99. */
export function validarTelefone(texto: string | null | undefined): ResultadoTelefone {
  const d = digitosTelefone(texto)
  if (!d) return { ok: false, motivo: 'Informe o telefone com DDD.' }
  if (d.length < 10 || d.length > 11) {
    return { ok: false, motivo: 'O telefone precisa ter DDD e 8 ou 9 dígitos.' }
  }
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return { ok: false, motivo: 'DDD inválido.' }
  if (d.length === 11 && d[2] !== '9') {
    return { ok: false, motivo: 'Celular com 9 dígitos precisa começar com 9.' }
  }
  return { ok: true, digitos: d }
}

/**
 * "62981491277" → "(62) 98149-1277". O que não casa com 10 nem 11 dígitos volta
 * como veio: os telefones antigos foram digitados livremente pelos pacientes no
 * portal e não devem sumir da tela por não caberem na regra.
 */
export function formatarTelefone(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim()
  const d = digitosTelefone(bruto)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return bruto
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest __tests__/lib/telefone.test.ts` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/telefone.ts __tests__/lib/telefone.test.ts && git commit -m "feat(telefone): regras puras de validacao e formatacao"
```

---

## Task 2: Servidor

**Files:**
- Modify: `src/lib/patients.ts`
- Modify: `src/app/api/patients/route.ts`
- Modify: `src/app/api/patients/[id]/route.ts`
- Create: `src/app/api/patients/[id]/phone/route.ts`
- Modify: `src/lib/em-tratamento.ts`
- Modify: `src/lib/em-tratamento-db.ts`
- Modify: `__tests__/lib/em-tratamento.test.ts` e `__tests__/components/EmTratamento.test.tsx` (só as fixtures)

- [ ] **Step 1: A camada de dados guarda o telefone**

Em `src/lib/patients.ts`:

**1a.** Em `PatientRow`, acrescentar depois de `name`:

```typescript
  phone: string | null
```

**1b.** Em `PatientInput`, acrescentar depois de `name`:

```typescript
  /** Só dígitos, com DDD. Vazio = sem telefone. */
  phone: string
```

**1c.** Em `createPatient`, trocar o INSERT por:

```typescript
  const rows = await sql`
    INSERT INTO patients (name, start_date, duration, notes, phone, created_by)
    VALUES (${input.name.trim()}, ${input.start_date}, ${input.duration}, ${input.notes}, ${input.phone || null}, ${input.created_by ?? null})
    RETURNING id
  `
```

**1d.** Em `updatePatient`, trocar o UPDATE por:

```typescript
  await sql`
    UPDATE patients
    SET name = ${input.name.trim()}, start_date = ${input.start_date},
        duration = ${input.duration}, notes = ${input.notes},
        phone = ${input.phone || null}
    WHERE id = ${id}
  `
```

**1e.** Criar, no fim do arquivo:

```typescript
/** Altera SÓ o telefone. Não existe para ser genérica: a rota de perfil do
 *  portal regrava nascimento e e-mail juntos e apagaria os dois. */
export async function updatePatientPhone(id: number, phone: string): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET phone = ${phone || null} WHERE id = ${id}`
}
```

- [ ] **Step 2: POST exige, PUT aceita vazio**

Em `src/app/api/patients/route.ts`, no `POST`, trocar o trecho da validação e da criação por:

```typescript
    const { name, start_date, duration, notes, phone } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    // Decisão do dono: paciente novo não entra sem telefone. A trava vale aqui
    // também, não só na tela.
    const tel = validarTelefone(phone)
    if (!tel.ok) {
      return NextResponse.json({ error: tel.motivo }, { status: 400 })
    }
    const id = await createPatient({ name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '', phone: tel.digitos, created_by: createdBy })
```

com `import { validarTelefone } from '@/lib/telefone'` no topo.

Em `src/app/api/patients/[id]/route.ts`, no `PUT`:

```typescript
    const { name, start_date, duration, notes, phone } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    // Na edição o telefone pode continuar vazio: 165 pacientes ainda não têm, e
    // travar impediria de corrigir o nome deles. Mas inválido não passa.
    const bruto = typeof phone === 'string' ? phone.trim() : ''
    let digitos = ''
    if (bruto) {
      const tel = validarTelefone(bruto)
      if (!tel.ok) return NextResponse.json({ error: tel.motivo }, { status: 400 })
      digitos = tel.digitos
    }
    await updatePatient(Number(id), { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '', phone: digitos })
```

com o mesmo import.

- [ ] **Step 3: A rota que altera só o telefone**

Criar `src/app/api/patients/[id]/phone/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { updatePatientPhone } from '@/lib/patients'
import { validarTelefone } from '@/lib/telefone'

export const dynamic = 'force-dynamic'

// Altera SÓ o telefone. Existe separada da rota de perfil do portal porque
// aquela regrava nascimento e e-mail juntos e apagaria os dois.
// O acesso é o mesmo das rotas irmãs de paciente: quem controla é o proxy.ts,
// que libera a equipe e limita a sessão do portal aos próprios GETs e a quatro
// POSTs — um PATCH vindo do portal não passa.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const tel = validarTelefone(typeof body?.phone === 'string' ? body.phone : '')
  if (!tel.ok) return NextResponse.json({ error: tel.motivo }, { status: 400 })

  await updatePatientPhone(Number(id), tel.digitos)

  const session = await auth()
  await logAudit({
    userName: session?.user?.name ?? 'desconhecido',
    action: 'telefone_atualizado',
    entityType: 'patient',
    entityId: Number(id),
    details: tel.digitos,
  })
  return NextResponse.json({ ok: true, phone: tel.digitos })
}
```

(Os campos de `logAudit` acima foram conferidos contra `src/lib/audit.ts`:
`userName`, `action`, `entityType`, `entityId`, `patientId`, `details` e
`deletedData`. Use exatamente esses.)

- [ ] **Step 4: A aba Em tratamento recebe o telefone**

Em `src/lib/em-tratamento.ts`, em `PacienteEmTratamento`, acrescentar depois de `nome`:

```typescript
  telefone: string | null
```

Em `src/lib/em-tratamento-db.ts`:

**4a.** Em `interface Linha`, depois de `name`:

```typescript
  phone: string | null
```

**4b.** No `SELECT`, trocar `SELECT p.id AS patient_id, p.name, p.application_interval_days AS intervalo,` por:

```sql
    SELECT p.id AS patient_id, p.name, p.phone, p.application_interval_days AS intervalo,
```

**4c.** No `lista.push({ ... })`, depois de `nome: l.name,`:

```typescript
      telefone: l.phone,
```

- [ ] **Step 5: Consertar as fixtures dos testes**

`PacienteEmTratamento` ganhou um campo obrigatório, então as fixtures existentes
param de compilar. **Não torne o campo opcional para evitar isso** — acrescente
`telefone` nas três fábricas:

- `__tests__/lib/em-tratamento.test.ts`, nas funções `p(...)` e `pa(...)`: acrescentar `telefone: null,` ao objeto devolvido.
- `__tests__/components/EmTratamento.test.tsx`, em cada item do array `LISTA`: acrescentar `telefone: null,` — **exceto** em um item, que recebe `telefone: '62981491277'`, para a Task 3 ter um card com telefone e outro sem.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 suítes pré-existentes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/patients.ts src/lib/em-tratamento.ts src/lib/em-tratamento-db.ts src/app/api/patients __tests__/lib/em-tratamento.test.ts __tests__/components/EmTratamento.test.tsx && git commit -m "feat(telefone): cadastro grava telefone e rota propria para alterar"
```

---

## Task 3: Telas

**Files:**
- Modify: `src/components/PatientModal.tsx`
- Modify: `src/components/NewPatientButton.tsx`
- Modify: `src/components/PatientDetailClient.tsx`
- Modify: `src/app/relatorios/EmTratamento.tsx`
- Test: `__tests__/components/EmTratamento.test.tsx`

- [ ] **Step 1: Teste da aba que falha**

Acrescentar a `__tests__/components/EmTratamento.test.tsx`, dentro do `describe`
que já existe (não apague nada):

```typescript
  it('mostra o telefone de quem tem e cobra de quem não tem', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
    expect(screen.getByText('(62) 98149-1277')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Telefone com DDD').length).toBeGreaterThan(0)
  })

  it('conta quantos estão sem telefone', async () => {
    render(<EmTratamento />)
    expect(await screen.findByText(/ainda sem telefone/)).toBeInTheDocument()
  })

  it('salva o telefone digitado no card', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
    const campo = screen.getAllByPlaceholderText('Telefone com DDD')[0]
    await userEvent.type(campo, '62999887766')
    await userEvent.click(screen.getAllByRole('button', { name: 'Salvar telefone' })[0])
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/patients\/\d+\/phone$/),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    expect(await screen.findByText('(62) 99988-7766')).toBeInTheDocument()
  })

  it('não salva telefone inválido e diz o motivo', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
    const antes = fetchMock.mock.calls.length
    await userEvent.type(screen.getAllByPlaceholderText('Telefone com DDD')[0], '123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Salvar telefone' })[0])
    expect(await screen.findByText(/DDD/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(antes)
  })
```

O `fetchMock` do `beforeEach` já trata `PATCH`, mas devolve `{ intervalo }` para
qualquer um — o do intervalo e o do telefone. Acrescente a distinção **antes** do
`if (init?.method === 'PATCH')` que já existe:

```typescript
    if (init?.method === 'PATCH' && url.includes('/phone')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, phone: JSON.parse(String(init.body)).phone }) }
    }
```

Reaproveite os helpers `cards()` e `fetchMock` que já estão no arquivo em vez de
criar outros.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx` → FAIL nos quatro novos.

- [ ] **Step 3: Campo no modal de paciente**

Em `src/components/PatientModal.tsx`:

**3a.** Acrescentar `phone: string` a `PatientFormData`, e `telefoneObrigatorio?: boolean` a `Props`.

**3b.** O estado inicial passa a ser `initial ?? { name: '', start_date: '', duration: '', notes: '', phone: '' }`.

**3c.** Em `handleSubmit`, depois da checagem do nome:

```typescript
    const tel = validarTelefone(form.phone)
    if (telefoneObrigatorio && !tel.ok) { setError(tel.motivo); return }
    if (form.phone.trim() && !tel.ok) { setError(tel.motivo); return }
```

**3d.** Um campo novo, logo depois do campo de Nome:

```tsx
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefone {telefoneObrigatorio && '*'}
            </label>
            <input
              type="tel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(62) 98149-1277"
            />
          </div>
```

com `import { validarTelefone } from '@/lib/telefone'` no topo.

- [ ] **Step 4: Cadastro novo e edição da ficha**

Em `src/components/NewPatientButton.tsx`: o tipo de `data` em `handleSave` ganha
`phone: string`, e o `<PatientModal>` recebe `telefoneObrigatorio`.

Em `src/components/PatientDetailClient.tsx`:

**4a.** No `<PatientModal>` da linha ~210, acrescentar `phone: patient.phone ?? ''` ao
objeto `initial` (junto de `name`, `start_date`, …) e mandar `phone` no corpo do PUT.
**Não** passe `telefoneObrigatorio` aqui.

**4b.** No cabeçalho, logo depois do `<p>` que mostra "Início: …":

```tsx
            <p className="text-sm mt-0.5">
              {patient.phone ? (
                <span className="text-gray-500">📱 {formatarTelefone(patient.phone)}</span>
              ) : (
                <span className="text-amber-700">📱 sem telefone</span>
              )}
            </p>
```

com `import { formatarTelefone } from '@/lib/telefone'` no topo.

- [ ] **Step 5: Card e contador na aba Em tratamento**

Em `src/app/relatorios/EmTratamento.tsx`:

**5a.** Imports: `import { formatarTelefone, validarTelefone } from '@/lib/telefone'`.

**5b.** Estados novos, junto dos outros:

```typescript
  const [telefoneDigitado, setTelefoneDigitado] = useState<Record<number, string>>({})
  const [salvandoTelefone, setSalvandoTelefone] = useState<number | null>(null)
```

**5c.** A função de salvar, junto das outras:

```typescript
  async function salvarTelefone(p: PacienteEmTratamento) {
    const tel = validarTelefone(telefoneDigitado[p.patientId] ?? '')
    if (!tel.ok) { setAviso({ id: p.patientId, texto: tel.motivo }); return }
    setSalvandoTelefone(p.patientId)
    setAviso(null)
    try {
      const res = await fetch(`/api/patients/${p.patientId}/phone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: tel.digitos }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setLista(atual => atual && atual.map(x =>
        x.patientId === p.patientId ? { ...x, telefone: tel.digitos } : x))
      setTelefoneDigitado(d => ({ ...d, [p.patientId]: '' }))
    } catch {
      setAviso({ id: p.patientId, texto: 'Não foi possível salvar o telefone.' })
    } finally {
      setSalvandoTelefone(null)
    }
  }
```

**5d.** O contador, junto de `contagem` (conta a lista inteira, não a sub-aba):

```typescript
  const semTelefone = lista.filter(p => !p.telefone).length
```

e, no cabeçalho, logo depois do `<p>` de "{enviadas} de {visiveis.length} …":

```tsx
        {semTelefone > 0 && (
          <p className="text-sm font-medium text-amber-800">
            📱 {semTelefone} em tratamento ainda sem telefone
          </p>
        )}
```

**5e.** No card, logo depois do `<label>` do intervalo de aplicação:

```tsx
                  {p.telefone ? (
                    <p className="text-xs text-gray-500 mt-1">📱 {formatarTelefone(p.telefone)}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="tel"
                        value={telefoneDigitado[p.patientId] ?? ''}
                        onChange={e => setTelefoneDigitado(d => ({ ...d, [p.patientId]: e.target.value }))}
                        placeholder="Telefone com DDD"
                        className="w-44 border border-amber-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => salvarTelefone(p)}
                        disabled={salvandoTelefone === p.patientId}
                        className="text-xs font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50"
                      >
                        {salvandoTelefone === p.patientId ? '...' : 'Salvar telefone'}
                      </button>
                    </div>
                  )}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx` → PASS (rode 3 vezes).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

- [ ] **Step 7: Commit**

```bash
git add src/components src/app/relatorios/EmTratamento.tsx __tests__/components/EmTratamento.test.tsx && git commit -m "feat(telefone): campo no cadastro, na ficha e no card de em tratamento"
```

---

## Conferência final (quem coordena, não o executor)

- `npm run build`.
- Merge em `master` e push — o Render publica sozinho.
- Conferir em produção: cadastrar um paciente de teste sem telefone (tem que travar), ver a marca "sem telefone" na ficha de alguém, e o contador na aba Em tratamento batendo com os 92 − 4.
