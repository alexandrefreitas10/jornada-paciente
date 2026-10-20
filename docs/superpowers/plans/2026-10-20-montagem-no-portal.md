# A montagem no portal — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada montagem antes-e-depois gravada aparece no portal do paciente a quem ela pertence.

**Architecture:** A lista entra no `PortalData` montado no servidor (sem ida extra à rede) e a imagem sai por uma rota nova sob `/api/patients/[id]/montagens/[mid]/imagem`, caminho que o middleware já libera para o próprio paciente. A rota confere a sessão ela mesma e exige que a montagem seja daquele paciente.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Postgres via postgres.js, S3, Jest.

**Spec:** `docs/superpowers/specs/2026-10-20-montagem-no-portal-design.md`.

---

## Contexto que todo implementador precisa saber

1. **Leia `node_modules/next/dist/docs/` antes de escrever a rota.** O `AGENTS.md` avisa que esta versão do Next tem mudanças de API em relação ao que você "sabe": `params` é uma **Promise** e precisa de `await`.
2. **Não rode `npm run build`:** neste projeto ele roda migração no Postgres de **produção**. Verificação é `npx tsc --noEmit` e `npx jest`.
3. **4 suítes já falham antes desta branch** e não são escopo: `task-definitions`, `task-completions`, `patients`, `PatientCard`. `RelatoriosTab` e `ConciliacaoClient` falham de forma **intermitente sob carga** — se falharem, rode-as sozinhas para confirmar.
4. **Nunca** ponha nome, telefone ou foto de paciente real em teste, fixture ou commit.
5. Comentário e mensagem de commit em português; comentário explica **por que**.
6. **Esta mudança é visível para pacientes reais no minuto em que subir**, e de forma retroativa (15 montagens já gravadas). Errar o filtro de dono aqui mostra o corpo de um paciente para outro. É o ponto de atenção da entrega inteira.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/app/api/patients/[id]/montagens/[mid]/imagem/route.ts` | serve miniatura, imagem inteira e download, para equipe e para o próprio paciente |
| `__tests__/lib/montagem-do-paciente.test.ts` | a regra pura de quem pode ver |
| `__tests__/components/PortalMontagens.test.tsx` | a seção na tela de fotos do portal |

**Modificar:**

| Arquivo | O que muda |
|---|---|
| `src/lib/fotos-regras.ts` | `podeVerMontagem`, a regra pura |
| `src/lib/fotos-db.ts` | `listarMontagensDoPaciente(patientId)` |
| `src/components/portal/types.ts` | `PortalMontagem` e o campo em `PortalData` |
| `src/app/portal/paciente/page.tsx` | carrega as montagens para o `PortalData` |
| `src/components/portal/screens/Fotos.tsx` | a seção "Seu antes e depois" |

---

## Task 1: A regra pura de quem pode ver

**Files:**
- Modify: `src/lib/fotos-regras.ts`
- Test: `__tests__/lib/montagem-do-paciente.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// __tests__/lib/montagem-do-paciente.test.ts
import { podeVerMontagem } from '@/lib/fotos-regras'

// Só os campos que a regra olha. Nenhum dado real de paciente.
const daPessoa = (patientId: number | null, pessoaId: number | null = null) =>
  ({ patient_id: patientId, pessoa_id: pessoaId })

describe('podeVerMontagem', () => {
  it('deixa ver a montagem do próprio paciente', () => {
    expect(podeVerMontagem(daPessoa(7), 7)).toBe(true)
  })

  it('NÃO deixa ver a montagem de outro paciente', () => {
    // Trocar o id na URL não pode mostrar o corpo de outra pessoa.
    expect(podeVerMontagem(daPessoa(8), 7)).toBe(false)
  })

  it('NÃO deixa ver montagem de pessoa sem card por um caminho de paciente', () => {
    expect(podeVerMontagem(daPessoa(null, 3), 7)).toBe(false)
  })

  it('recusa quando a montagem não existe', () => {
    expect(podeVerMontagem(null, 7)).toBe(false)
  })

  it('recusa id de paciente inválido', () => {
    expect(podeVerMontagem(daPessoa(7), Number.NaN)).toBe(false)
    expect(podeVerMontagem(daPessoa(7), 0)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/montagem-do-paciente.test.ts --selectProjects lib`
Expected: FAIL — `podeVerMontagem` não existe.

- [ ] **Step 3: Implementar em `src/lib/fotos-regras.ts`**

```ts
/** O mínimo que a regra precisa olhar — serve tanto para uma linha de
 *  `antes_depois` quanto para `null` (montagem que não existe). */
type DonoDaMontagem = { patient_id: number | null; pessoa_id: number | null } | null

/**
 * A montagem é deste paciente?
 *
 * Existe separada da rota porque é a única coisa que impede um paciente de
 * ver o corpo de outro: no portal o `[mid]` da URL é editável, e sem esta
 * checagem trocar o número mostraria a montagem de outra pessoa. Montagem de
 * pasta sem card (`pessoa_id` preenchido) nunca pertence a um paciente.
 */
export function podeVerMontagem(montagem: DonoDaMontagem, patientId: number): boolean {
  if (!montagem) return false
  if (!Number.isInteger(patientId) || patientId <= 0) return false
  return montagem.patient_id === patientId
}
```

- [ ] **Step 4: Rodar e ver passar; provar que pega a regressão**

Run: `npx jest __tests__/lib/montagem-do-paciente.test.ts --selectProjects lib` → PASS.

Depois troque `montagem.patient_id === patientId` por `montagem.patient_id != null`, confirme que o teste de "outro paciente" quebra, e desfaça.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fotos-regras.ts __tests__/lib/montagem-do-paciente.test.ts
git commit -m "feat(portal): regra de quem pode ver uma montagem" -- src/lib/fotos-regras.ts __tests__/lib/montagem-do-paciente.test.ts
```

---

## Task 2: A consulta por paciente

**Files:**
- Modify: `src/lib/fotos-db.ts`

- [ ] **Step 1: Acrescentar a função**

Junto das outras de montagem, seguindo o padrão do arquivo (`await initSchema()` no começo, `deleted_at IS NULL` sempre):

```ts
/** As montagens de um paciente, mais recente primeiro. Devolve as colunas
 *  inteiras; quem monta o `PortalData` escolhe o que vai para o navegador do
 *  paciente — e manda bem menos que isto (ver a spec §4). */
export async function listarMontagensDoPaciente(patientId: number): Promise<Montagem[]> {
  await initSchema()
  return sql<Montagem[]>`
    SELECT * FROM antes_depois
    WHERE patient_id = ${patientId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `
}
```

- [ ] **Step 2: Conferir e commitar**

Run: `npx tsc --noEmit` — só os 4 erros pré-existentes de `PatientCard.test.tsx`.

```bash
git commit -m "feat(portal): consulta das montagens de um paciente" -- src/lib/fotos-db.ts
```

---

## Task 3: A rota da imagem

**Files:**
- Create: `src/app/api/patients/[id]/montagens/[mid]/imagem/route.ts`

**Leia antes:** `src/app/api/patients/[id]/files/[fid]/download/route.ts` (o vocabulário `?proxy=1` e o anti-IDOR), `src/app/api/fotos/montagens/[id]/imagem/route.ts` (a versão da equipe, com `contentTypeSeguro` e `nosniff`) e `src/auth-portal.ts` (`portalAuth`).

- [ ] **Step 1: Escrever a rota**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { portalAuth } from '@/auth-portal'
import { acharMontagem } from '@/lib/fotos-db'
import { podeVerMontagem } from '@/lib/fotos-regras'
import { apelidoDeArquivo } from '@/lib/montagem'
import { idDeCaminho } from '@/lib/fotos-regras'
import { getFileStream, getSignedDownloadUrlWithFilename } from '@/lib/s3'
import { contentTypeSeguro } from '@/lib/tipos-de-imagem'

// A montagem antes-e-depois vista pelo PACIENTE, no portal — e também pela
// equipe, que chega pelo mesmo caminho.
//
// Mora sob `/api/patients/[id]/` porque é o único prefixo que o `proxy.ts`
// libera para sessão de portal (GET do próprio id). A rota da equipe
// (`/api/fotos/montagens/...`) exige `auth()` e é inalcançável para o paciente.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const { id, mid } = await params
  const patientId = idDeCaminho(id)
  const montagemId = idDeCaminho(mid)
  if (patientId == null || montagemId == null) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  // Confere a sessão aqui, além do middleware: equipe vê qualquer paciente, e
  // paciente vê só a si mesmo. Confiar só no `proxy.ts` seria confiar numa
  // linha de configuração de rota que ninguém relê.
  const equipe = await auth()
  if (!equipe?.user) {
    const portal = await portalAuth()
    const doPortal = portal?.user?.patient_id
    if (doPortal == null || Number(doPortal) !== patientId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  const montagem = await acharMontagem(montagemId)
  // Mesma resposta para "não existe" e "não é sua": de fora, as duas são
  // indistinguíveis, senão trocar o número na URL vira um jeito de descobrir
  // quais montagens existem.
  if (!podeVerMontagem(montagem, patientId)) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  const inteira = req.nextUrl.searchParams.get('proxy') === '1'
  const miniatura = req.nextUrl.searchParams.get('thumb') === '1'

  if (inteira || miniatura) {
    const { body, contentType } = await getFileStream(
      miniatura ? montagem!.s3_key_thumb : montagem!.s3_key,
    )
    return new NextResponse(body, {
      headers: {
        // Nunca o tipo cru do S3: imagem servida inline na origem do app com um
        // tipo executável roda script com a sessão de quem abriu.
        'Content-Type': contentTypeSeguro(contentType),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="antes-depois"',
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  const extensao = montagem!.s3_key.split('.').pop()?.toLowerCase() || 'jpg'
  const url = await getSignedDownloadUrlWithFilename(
    montagem!.s3_key,
    `antes-depois-${apelidoDeArquivo(montagem!.nome)}.${extensao}`,
  )
  return NextResponse.redirect(url)
}
```

Se `idDeCaminho` não estiver exportado de `fotos-regras.ts`, exporte-o (ele já existe lá, criado para as rotas da aba Fotos). Junte os dois `import` do mesmo módulo numa linha só.

- [ ] **Step 2: Conferir e commitar**

Run: `npx tsc --noEmit` — nenhum erro novo.

```bash
git commit -m "feat(portal): rota da imagem da montagem para o paciente" -- "src/app/api/patients/[id]/montagens"
```

---

## Task 4: A lista no `PortalData`

**Files:**
- Modify: `src/components/portal/types.ts`
- Modify: `src/app/portal/paciente/page.tsx`

- [ ] **Step 1: O tipo**

Em `src/components/portal/types.ts`:

```ts
/** Uma montagem antes-e-depois do paciente. Leva SÓ o que a tela mostra: o id
 *  (para pedir a imagem) e as duas datas. Chave do S3, nome gravado, autor e
 *  identidade visual são dados internos da clínica e não viajam para o
 *  navegador do paciente. */
export interface PortalMontagem {
  id: number
  dataAntes: string | null
  dataDepois: string | null
}
```

E o campo em `PortalData`, junto de `photos`:

```ts
  montagens: PortalMontagem[]
```

- [ ] **Step 2: Carregar na página**

Em `src/app/portal/paciente/page.tsx`, junto das outras consultas, importando `listarMontagensDoPaciente` de `@/lib/fotos-db` e mapeando para o tipo acima:

```ts
    montagens: (await listarMontagensDoPaciente(patientId)).map(m => ({
      id: m.id,
      dataAntes: m.data_antes ? new Date(m.data_antes).toISOString() : null,
      dataDepois: m.data_depois ? new Date(m.data_depois).toISOString() : null,
    })),
```

O `new Date(...).toISOString()` é proposital: o postgres.js devolve `Date` em coluna `TIMESTAMPTZ`, e o tipo declara `string` (ver o AVISO no topo de `src/lib/fotos-db.ts`). Normalizar aqui, na fronteira, faz o tipo dizer a verdade para quem recebe.

Siga o estilo do arquivo: se as outras consultas estão em `try/catch` ou `Promise.all`, entre junto, para a página não quebrar inteira se esta falhar.

- [ ] **Step 3: Conferir e commitar**

Run: `npx tsc --noEmit` — nenhum erro novo.

```bash
git commit -m "feat(portal): montagens do paciente nos dados do portal" -- src/components/portal/types.ts src/app/portal/paciente/page.tsx
```

---

## Task 5: A seção na tela de fotos do portal

**Files:**
- Modify: `src/components/portal/screens/Fotos.tsx`
- Test: `__tests__/components/PortalMontagens.test.tsx`

Esta task traz especificação, não JSX literal: o que não pode variar é o endereço da imagem, a ordem, as datas e o caso vazio. A aparência segue o que já existe na tela (`C`, `serif`, `shadowCard`, `ScreenHeader`, `EmptyState` de `../theme` e `../ui`) — **não invente estilo novo**, o portal tem design próprio.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// __tests__/components/PortalMontagens.test.tsx
import { render, screen } from '@testing-library/react'
import { Fotos } from '@/components/portal/screens/Fotos'
import type { PortalData } from '@/components/portal/types'

// Paciente inventado: nada real entra em teste.
const base = {
  patientId: 42, name: 'Fulana de Tal', startDate: null, birthDate: null,
  phone: null, email: null, avatarUrl: null, tasksDone: 0, tasksTotal: 0,
  hasEstetica: false, photos: [], exams: [], bioimpedances: [], diets: [],
  medications: [], sessions: [], terms: [], measurements: [], prescricoes: [],
  prescricaoIndicacao: null, montagens: [],
} as unknown as PortalData

const comMontagens = (montagens: PortalData['montagens']): PortalData =>
  ({ ...base, montagens })

it('mostra a seção com a montagem do próprio paciente', () => {
  render(<Fotos data={comMontagens([
    { id: 9, dataAntes: '2026-06-18T12:00:00.000Z', dataDepois: '2026-09-29T12:00:00.000Z' },
  ])} onBack={() => {}} />)

  expect(screen.getByText(/antes e depois/i)).toBeInTheDocument()
  const img = screen.getByRole('img', { name: /antes e depois/i })
  // Miniatura, e do caminho do PRÓPRIO paciente.
  expect(img).toHaveAttribute('src', '/api/patients/42/montagens/9/imagem?thumb=1')
})

it('mostra a mais recente primeiro', () => {
  render(<Fotos data={comMontagens([
    { id: 20, dataAntes: '2026-09-01T12:00:00.000Z', dataDepois: '2026-10-01T12:00:00.000Z' },
    { id: 10, dataAntes: '2026-06-01T12:00:00.000Z', dataDepois: '2026-07-01T12:00:00.000Z' },
  ])} onBack={() => {}} />)

  const imgs = screen.getAllByRole('img', { name: /antes e depois/i })
  expect(imgs[0]).toHaveAttribute('src', expect.stringContaining('/montagens/20/'))
})

it('não renderiza a seção quando não há montagem', () => {
  render(<Fotos data={comMontagens([])} onBack={() => {}} />)
  expect(screen.queryByText(/seu antes e depois/i)).not.toBeInTheDocument()
})

it('não quebra com data ausente', () => {
  render(<Fotos data={comMontagens([
    { id: 5, dataAntes: null, dataDepois: null },
  ])} onBack={() => {}} />)
  expect(screen.getByRole('img', { name: /antes e depois/i })).toBeInTheDocument()
})
```

Se algum seletor não casar com o que o componente renderiza, **ajuste o teste ao componente** — menos o endereço da imagem, a ordem e o caso vazio, que são o contrato.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/components/PortalMontagens.test.tsx --selectProjects components`

- [ ] **Step 3: Implementar a seção**

Em `src/components/portal/screens/Fotos.tsx`, dentro da tela principal (a que tem `<ScreenHeader title="Minhas fotos" ...>`), **antes** da grade de fotos soltas:

- Renderize só se `data.montagens.length > 0`.
- Título "Seu antes e depois", no mesmo padrão de título de seção da tela.
- Um item por montagem, na ordem em que vêm (o servidor já manda a mais recente primeiro — **não reordene no cliente**).
- Imagem: `src={`/api/patients/${data.patientId}/montagens/${m.id}/imagem?thumb=1`}`, com `alt` que contenha "antes e depois".
- Sob a imagem, as duas datas em `dd/mm/aaaa` (reuse o `fmtDateTime` que já existe no arquivo), com um separador. Data ausente não imprime nada e não quebra.
- Tocar abre a imagem inteira: `?proxy=1`. Use o mesmo gesto que a tela já usa para abrir foto, se houver; se não houver, um link que abre em nova aba serve.
- Um jeito de salvar: link para a rota **sem** parâmetro (o download com nome de arquivo), com o ícone `IconDownload` que o arquivo já importa.

- [ ] **Step 4: Rodar os testes**

Run: `npx jest __tests__/components/PortalMontagens.test.tsx --selectProjects components` → PASS.
Run: `npx jest --selectProjects components` → só `PatientCard` falhando (e, sob carga, as duas intermitentes).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(portal): secao Seu antes e depois na tela de fotos" -- src/components/portal/screens/Fotos.tsx __tests__/components/PortalMontagens.test.tsx
```

---

## Task 6: Revisão final

- [ ] **Step 1:** `npx jest` — só as 4 pré-existentes (confirme as intermitentes rodando-as sozinhas).
- [ ] **Step 2:** `npx tsc --noEmit` — só o erro pré-existente de `PatientCard.test.tsx`.
- [ ] **Step 3: A conferência que importa.** Releia a rota da Task 3 e confirme, lendo o código: um `[mid]` de montagem de **outro** paciente devolve 404; uma sessão de portal de outro paciente devolve 401; e `podeVerMontagem` é chamada **antes** de qualquer leitura do S3.
- [ ] **Step 4:** `git diff master --stat` e confira que nenhum dado real de paciente entrou em teste ou fixture.

---

## Depois

Merge em `master`, push, e verificar o deploy comparando o hash de `https://jornada-paciente.onrender.com/login` até mudar e ficar estável em 3 requisições.

Avisar o dono de que, no minuto em que subir, **as 15 montagens já gravadas ficam visíveis** para os 13 pacientes correspondentes — foi a escolha dele, mas é o tipo de coisa que ele vai querer saber a hora exata.
