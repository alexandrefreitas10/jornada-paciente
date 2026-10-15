# Fatura do cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir a linha "Cartão de Crédito" do Custos — 13% de tudo que sai da clínica hoje numa linha só — nas categorias de verdade, lendo a fatura em PDF de forma determinística e deixando a IA decidir apenas a categoria de cada estabelecimento.

**Architecture:** A leitura da fatura é pura e prova a si mesma (soma das compras = total declarado pela própria fatura). O enquadramento decide a categoria por três camadas: o que o dono já corrigiu, depois a IA, depois "não identificado". A substituição no Custos é uma transformação da lista de lançamentos antes do comparativo — assim categoria, ordem e detalhe por fornecedor continuam funcionando sem mudança.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library, `unpdf` (já instalado), Anthropic SDK (já usado no `scan-nf`).

**Spec:** [docs/superpowers/specs/2026-10-15-fatura-cartao-design.md](../specs/2026-10-15-fatura-cartao-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/fatura/pdf-posicional.ts` | **Novo.** PDF → linhas reconstruídas por posição. Único que fala com o pdf.js. |
| `src/lib/fatura/ler-fatura.ts` | **Novo.** Linhas → `FaturaLida`. Puro. |
| `src/lib/fatura/enquadrar.ts` | **Novo.** Decide a categoria de cada compra. Puro. |
| `src/lib/fatura/substituir.ts` | **Novo.** Troca o lançamento "Cartão de Crédito" pelas compras. Puro. |
| `src/lib/fatura-db.ts` | **Novo.** Grava e lê fatura, compras e a memória de categoria. |
| `src/lib/db.ts` | As três tabelas novas. |
| `src/app/api/conciliacao/[mes]/fatura/route.ts` | **Novo.** POST e DELETE. |
| `src/app/api/conciliacao/[mes]/fatura/[compraId]/route.ts` | **Novo.** PATCH da categoria. |
| `src/lib/conciliacao/resultado.ts` | `montarResultado` aplica a substituição. |
| `src/app/conciliacao/ConciliacaoClient.tsx` | Envio da fatura e lista de compras no Custos. |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco. **Não rode `npm run build`** — quem roda sou eu no fim.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas (`task-definitions`, `task-completions`, `patients`, `PatientCard`) — hoje `6 failed, 530 passed, 536 total`. `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **Dinheiro em centavos inteiros**, `BIGINT` nas colunas.
- **As duas faturas reais estão em `C:\Users\alexa\Downloads\`**: `fatura.pdf` (ref. out/2026, 9 páginas) e `fatura (1).pdf` (ref. set/2026 — é a que corresponde ao pagamento de setembro). **Leia para conferir, NUNCA copie o conteúdo para o repositório.** As fixtures são anonimizadas: mesma estrutura e mesmas quebras, nomes e valores inventados.
- **A permissão já existe** (`canConciliacaoSession()`); a aba Conciliação já está no ar.
- A categoria que o BPO usa e que será substituída chama-se exatamente **`Cartão de Crédito`**.

---

## Task 1: Ler a fatura

**Files:**
- Create: `src/lib/fatura/tipos.ts`, `pdf-posicional.ts`, `ler-fatura.ts`
- Test: `__tests__/lib/fatura/ler-fatura.test.ts`

- [ ] **Step 1: Os tipos**

`src/lib/fatura/tipos.ts`:

```typescript
export interface CompraCartao {
  data: string            // AAAA-MM-DD
  estabelecimento: string
  parcela: string | null  // "2/5"
  centavos: number        // positivo: é despesa
  internacional: boolean
}

export interface FaturaLida {
  referencia: string          // AAAA-MM
  totalFatura: number         // SALDO TOTAL
  despesasDeclaradas: number  // DESPESAS/DÉBITOS
  faturaAnterior: number      // TOTAL FATURA ANTERIOR
  compras: CompraCartao[]
  /** soma(compras) - despesasDeclaradas. Zero = a leitura fecha. */
  residuo: number
}
```

- [ ] **Step 2: A extração por posição**

Esta fatura **não** pode ser lida pelo texto corrido: o PDF traz as letras
separadas (`"A N D R A D E"`) dentro de cada item de texto. O código abaixo foi
rodado contra as duas faturas reais e é o que faz a soma fechar.

`src/lib/fatura/pdf-posicional.ts`:

```typescript
import { getDocumentProxy } from 'unpdf'

/** "A N D R A D E" → "ANDRADE". Só quando o item INTEIRO é caractere-espaço. */
const juntarLetras = (s: string) => (/^(\S )+\S?$/.test(s) ? s.replace(/ /g, '') : s)

/**
 * A fatura tem as letras separadas no conteúdo do PDF, então o texto corrido
 * vem inútil. Aqui cada item é reposicionado: agrupa por linha (y) e ordena por
 * x, inserindo espaço só quando há vão de verdade entre dois itens.
 */
export async function linhasDaFatura(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes)
  const saida: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent()
    const porLinha = new Map<number, { x: number; t: string; w: number }[]>()
    for (const item of conteudo.items as { str?: string; width?: number; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue
      const y = Math.round(item.transform[5])
      porLinha.set(y, [...(porLinha.get(y) ?? []), { x: item.transform[4], t: juntarLetras(item.str), w: item.width ?? 0 }])
    }
    for (const [, itens] of [...porLinha.entries()].sort((a, b) => b[0] - a[0])) {
      itens.sort((a, b) => a.x - b.x)
      let linha = ''
      let fim: number | null = null
      for (const i of itens) {
        if (fim !== null && i.x - fim > 1.5) linha += ' '
        linha += i.t
        fim = i.x + i.w
      }
      saida.push(linha.replace(/\s+/g, ' ').trim())
    }
  }
  return saida
}
```

- [ ] **Step 3: Teste do leitor (escrever primeiro)**

`__tests__/lib/fatura/ler-fatura.test.ts` — o trecho abaixo tem a mesma
estrutura e as mesmas quebras das faturas reais, com nomes e valores
**inventados**:

```typescript
import { lerFatura } from '@/lib/fatura/ler-fatura'

const LINHAS = [
  'EMPRESA EXEMPLO LTDA',
  'R E F. : set/2026',
  'TOTAL FATURA ANTERIOR R$ 1.000,00',
  'PAGAMENTOS RECEBIDOS - R$ 1.010,00',
  'DESPESAS/DÉBITOS + R$ 2.500,00',
  'ENCARGOS R$ 0',
  'SALDO TOTAL = R$ 2.490,00',
  'L A N ÇA M E N T O S – VI S A',
  'D ATA DESCRIÇÃO VA L O R',
  // compra simples
  '03/set LOJA EXEMPLO R$ 500,00',
  // parcelada (24 das 67 na fatura real)
  '27/ago FORNECEDOR EXEMPLO Parc.2/5 R$ 1.000,00',
  // compra de ano anterior: mês > referência ⇒ 2025
  '16/dez SERVICO ANTIGO Parc.10/12 R$ 400,00',
  // internacional: três linhas, a do meio tem data e valor
  'SOFTWARE EXEMPLO - USD 100.00',
  '09/set R$ 500,00',
  'Conversão: USD 1 = R$ 5,00',
  // IOF vem como compra normal
  '09/set IOF comprainternacional- SOFTWARE EXEMPLO R$ 100,00',
  // negativos: NÃO são compra
  '02/set Anuidade- bonificação -R$ 10,00',
  '11/set Pagamento Recebido -R$ 1.000,00',
  'Página1de9',
]

describe('lerFatura', () => {
  it('lê a referência e os totais do resumo', () => {
    const f = lerFatura(LINHAS)
    expect(f.referencia).toBe('2026-09')
    expect(f.totalFatura).toBe(249000)
    expect(f.despesasDeclaradas).toBe(250000)
    expect(f.faturaAnterior).toBe(100000)
  })

  it('lê compra simples e parcelada', () => {
    const { compras } = lerFatura(LINHAS)
    expect(compras.find(c => c.estabelecimento.includes('LOJA EXEMPLO')))
      .toMatchObject({ data: '2026-09-03', centavos: 50000, parcela: null, internacional: false })
    expect(compras.find(c => c.estabelecimento.includes('FORNECEDOR EXEMPLO')))
      .toMatchObject({ data: '2026-08-27', centavos: 100000, parcela: '2/5' })
  })

  it('mês maior que o da referência é do ano anterior', () => {
    // 16/dez numa fatura de set/2026 é dezembro de 2025
    expect(lerFatura(LINHAS).compras.find(c => c.parcela === '10/12')?.data).toBe('2025-12-16')
  })

  it('compra internacional: nome de uma linha, data e valor da seguinte', () => {
    const c = lerFatura(LINHAS).compras.find(x => x.centavos === 50000 && x.internacional)
    expect(c).toMatchObject({ data: '2026-09-09', internacional: true })
    expect(c?.estabelecimento).toContain('SOFTWARE EXEMPLO')
  })

  it('o IOF é uma compra, não um encargo escondido', () => {
    expect(lerFatura(LINHAS).compras.find(c => /IOF/i.test(c.estabelecimento))?.centavos).toBe(10000)
  })

  it('pagamento recebido e estorno de anuidade NÃO são compra', () => {
    const { compras } = lerFatura(LINHAS)
    expect(compras.some(c => /Pagamento Recebido/i.test(c.estabelecimento))).toBe(false)
    expect(compras.some(c => /bonifica/i.test(c.estabelecimento))).toBe(false)
    expect(compras.every(c => c.centavos > 0)).toBe(true)
  })

  it('a soma das compras prova a leitura', () => {
    const f = lerFatura(LINHAS)
    // 500 + 1.000 + 400 + 500 + 100 = 2.500 = DESPESAS/DÉBITOS
    expect(f.compras.reduce((s, c) => s + c.centavos, 0)).toBe(250000)
    expect(f.residuo).toBe(0)
  })

  it('quando falta uma compra, o resíduo denuncia', () => {
    const semUma = LINHAS.filter(l => !l.startsWith('03/set LOJA'))
    expect(lerFatura(semUma).residuo).toBe(-50000)
  })

  it('texto que não é fatura não vira fatura', () => {
    expect(() => lerFatura(['qualquer coisa', 'outra linha'])).toThrow(/fatura/i)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx jest __tests__/lib/fatura` → FAIL (módulo não existe).

- [ ] **Step 5: Implementar `ler-fatura.ts`**

Padrões medidos nas duas faturas reais — **não são chute**:

```typescript
const REF = /R\s?E\s?F\.?\s*:\s*([a-z]{3})\/(\d{4})/i
const RESUMO_ANTERIOR = /TOTAL FATURA ANTERIOR\s+R\$\s*([\d.]+,\d{2})/i
const RESUMO_DESPESAS = /DESPESAS\/D[ÉE]BITOS\s*\+?\s*R\$\s*([\d.]+,\d{2})/i
const RESUMO_TOTAL = /SALDO TOTAL\s*=?\s*R\$\s*([\d.]+,\d{2})/i
/** Compra que fecha na própria linha. O `-` antes do R$ marca crédito. */
const COMPRA = /^(\d{2})\/([a-z]{3})\s+(.+?)\s+(-?)R\$\s*([\d.]+,\d{2})$/i
/** Internacional: a linha só tem data e valor; o nome está na linha ANTERIOR. */
const SO_VALOR = /^(\d{2})\/([a-z]{3})\s+(-?)R\$\s*([\d.]+,\d{2})$/i
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
```

Regras:

- **Ano deduzido da referência**: mês da compra **maior** que o da referência ⇒
  ano anterior. (`dez` numa fatura de `set/2026` ⇒ 2025.)
- **`SO_VALOR` casa antes de `COMPRA`** — senão `09/set R$ 500,00` seria lido
  como uma compra de descrição vazia. O estabelecimento vem da linha anterior,
  sem o sufixo `- USD 100.00`, e a compra é marcada `internacional: true`.
- **Qualquer linha com `-R$` é crédito e não entra em `compras`.** São
  pagamento recebido e estorno; se entrassem, o relatório ficaria negativo.
- **Falta de referência ou de `DESPESAS/DÉBITOS` ⇒ `throw`.** Devolver uma
  fatura vazia faria o Custos esconder a linha do cartão sem pôr nada no lugar.
- Valor em centavos inteiros, nunca float.

- [ ] **Step 6: Rodar, ver passar, e conferir contra as faturas reais**

Run: `npx jest __tests__/lib/fatura` → PASS.

Criar na raiz um teste Jest temporário (um `.mts` com `node --env-file` **não**
funciona: os módulos do projeto importam sem extensão) que lê os dois PDFs reais
com `linhasDaFatura` + `lerFatura` e imprime referência, nº de compras, soma e
resíduo. Precisa de `NODE_OPTIONS=--experimental-vm-modules` por causa do `unpdf`.

**Os números a reproduzir, medidos:**

| arquivo | referência | compras | soma | resíduo |
|---|---|---|---|---|
| `fatura.pdf` | 2026-10 | **67** | **R$ 22.000,00** | **0** |
| `fatura (1).pdf` | 2026-09 | **74** | **R$ 20.020,00** | **0** |

**Se qualquer resíduo for diferente de zero, pare e reporte** — é o leitor que
está errado. Apague o teste temporário depois.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fatura __tests__/lib/fatura && git commit -m "feat(fatura): leitura deterministica da fatura do cartao"
```

---

## Task 2: Enquadrar as compras

**Files:**
- Create: `src/lib/fatura/enquadrar.ts`
- Test: `__tests__/lib/fatura/enquadrar.test.ts`

- [ ] **Step 1: A regra, pura**

```typescript
export const NAO_IDENTIFICADO = 'Cartão de crédito (não identificado)'

export type OrigemCategoria = 'memoria' | 'ia' | 'manual' | 'nao_identificado'

export interface CompraEnquadrada extends CompraCartao {
  categoria: string
  origem: OrigemCategoria
}

/** Nome do estabelecimento só para COMPARAR: "MP*APIONEIRA" e "MP* APIONEIRA"
 *  são o mesmo lugar. Mesma normalização usada no estoque. */
export function chaveEstabelecimento(nome: string): string

/**
 * Três camadas, nesta ordem: o que o dono já corrigiu vence sempre; depois o
 * que a IA sugeriu; o resto é "não identificado".
 *
 * A IA nunca sobrepõe uma escolha do dono — é isso que faz a aba melhorar com
 * o uso em vez de pedir a mesma correção todo mês.
 */
export function enquadrar(
  compras: CompraCartao[],
  memoria: Map<string, string>,
  sugestaoIa: Map<string, string | null>,
): CompraEnquadrada[]
```

Testes: memória vence a IA; IA preenche o que a memória não sabe; sem nenhuma
das duas vira `NAO_IDENTIFICADO`; IA devolvendo categoria fora da lista é
ignorada (não inventa categoria); `MP*APIONEIRA` e `MP* APIONEIRA` usam a mesma
memória; lista vazia devolve lista vazia.

- [ ] **Step 2: A chamada da IA (fora do puro)**

Em `src/lib/fatura/ia.ts`: recebe os estabelecimentos desconhecidos e a lista de
categorias, devolve `Map<chave, categoria | null>`. Modelo e formato no padrão
do `src/app/api/estoque/scan-nf/route.ts` (cliente Anthropic, `messages.create`,
resposta em JSON).

**Falha da IA não derruba o envio**: devolve mapa vazio e tudo cai em "não
identificado". Esta é a 5ª função de IA do projeto e divide o mesmo saldo das
outras.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fatura __tests__/lib/fatura && git commit -m "feat(fatura): enquadramento por memoria, IA e nao identificado"
```

---

## Task 3: Substituir a linha do cartão no Custos

**Files:**
- Create: `src/lib/fatura/substituir.ts`
- Test: `__tests__/lib/fatura/substituir.test.ts`
- Modify: `src/lib/conciliacao/resultado.ts`

- [ ] **Step 1: A substituição, pura**

A ideia que faz tudo funcionar sem mexer no comparativo: **transformar a lista
de lançamentos antes de compará-la**. Tirando o lançamento "Cartão de Crédito" e
pondo as compras no lugar, `compararCategorias` e `compararFornecedores`
continuam funcionando sem uma linha de mudança — inclusive o detalhe por
fornecedor, que passa a mostrar os estabelecimentos do cartão.

```typescript
export const AJUSTES_CARTAO = 'Cartão — créditos e ajustes'

/**
 * Troca o lançamento "Cartão de Crédito" pelas compras da fatura.
 *
 * O total do mês NÃO pode mudar. Mas a soma das compras não é igual ao valor
 * pago: a fatura de set/2026 tem R$ 20.020,00 de compras e R$ 20.000,00 de
 * saldo, porque um estorno de anuidade só aparece na fatura seguinte. A
 * diferença vira uma linha explícita, em vez de ser diluída nas categorias.
 */
export function substituirCartao(
  sistema: LancamentoSistema[],
  compras: CompraEnquadrada[],
): LancamentoSistema[]
```

- [ ] **Step 2: Os testes que importam**

- **A invariante**: a soma de `centavos` antes e depois é idêntica. É o teste
  mais importante do arquivo.
- A linha de ajuste aparece com a diferença exata (−R$ 21,50 no caso real) e
  **não aparece** quando a diferença é zero.
- A categoria "Cartão de Crédito" some do resultado.
- Sem fatura, a lista volta intacta.
- Um mês com mais de um lançamento de "Cartão de Crédito" (não acontece hoje,
  mas o tipo permite): todos somados viram a base da substituição.
- Compra fica com `banco` e `data` coerentes, para não quebrar nada a jusante.

- [ ] **Step 3: Ligar em `montarResultado`**

`montarResultado` passa a aceitar `compras?: CompraEnquadrada[]` e aplica
`substituirCartao` **antes** de `compararCategorias` — no mês atual e, quando
houver fatura do mês anterior, também nele (senão a comparação seria de aberto
contra fechado, e toda categoria do cartão apareceria como se tivesse nascido
naquele mês).

- [ ] **Step 4: Commit**

```bash
git add src/lib __tests__/lib && git commit -m "feat(fatura): abertura do cartao substitui a linha no comparativo"
```

---

## Task 4: Banco, rotas e tela

**Files:**
- Modify: `src/lib/db.ts`, `src/app/conciliacao/ConciliacaoClient.tsx`
- Create: `src/lib/fatura-db.ts`, `src/app/api/conciliacao/[mes]/fatura/route.ts`, `.../[compraId]/route.ts`
- Test: `__tests__/components/ConciliacaoClient.test.tsx`

- [ ] **Step 1: Migração**

As três tabelas da spec (`fatura_cartao`, `fatura_compra`,
`fatura_categoria_memoria`) no fim de `runMigrations()`, no estilo do arquivo.

**`fatura_cartao` não tem FK para `conciliacao_meses`** — é o que faz reenviar o
mês não apagar a fatura. A ligação é pela coluna `mes`.

- [ ] **Step 2: `fatura-db.ts`**

`salvarFatura` (transação: apaga a fatura do mês se existir, insere fatura e
compras), `lerFatura(mes)`, `apagarFatura(mes)`, `lerMemoria()`,
`gravarMemoria(chave, categoria, quem)`, `trocarCategoria(compraId, categoria)`.

- [ ] **Step 3: As rotas**

- `POST /api/conciliacao/[mes]/fatura` — permissão → tamanho → lê o PDF →
  **se `residuo !== 0`, responde 400 com o resíduo e não grava** → busca a
  memória → chama a IA para o que falta → enquadra → sobe o PDF ao S3 →
  grava → `logAudit` → devolve a fatura lida.
  Compara `totalFatura` com o valor lançado em "Cartão de Crédito" naquele mês e
  devolve o aviso quando diferem (**não bloqueia**).
- `PATCH .../fatura/[compraId]` — troca a categoria e **grava a memória** do
  estabelecimento.
- `DELETE .../fatura` — remove a fatura do mês.

Todas exigem `canConciliacaoSession()`.

- [ ] **Step 4: A tela**

No Custos: envio da fatura, a porcentagem identificada ("R$ 23.100 de R$ 25.302
— 91% identificado"), a lista das compras com seletor de categoria, o aviso
quando o total da fatura difere do que o BPO lançou, e o botão de remover.

Testes de componente: trocar a categoria chama o PATCH e atualiza a linha; o
resíduo diferente de zero aparece como erro e a fatura não é usada; mês sem
fatura mostra o convite para enviar; a porcentagem identificada confere.

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

```bash
git add -A src __tests__ && git commit -m "feat(fatura): banco, rotas e tela da fatura do cartao"
```

---

## Conferência final (quem coordena, não o executor)

- `npm run build`.
- Merge em `master` e push.
- Em produção: subir `fatura (1).pdf` (ref. set/2026) no mês 2026-09 e conferir
  que a linha "Cartão de Crédito" de R$ 20.000,00 some, que as categorias somam
  o mesmo total de despesas de antes, e que aparece a linha de ajuste de
  −R$ 21,50.
