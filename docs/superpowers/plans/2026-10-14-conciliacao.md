# Aba Conciliação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba para os dois donos da clínica, onde uma vez por mês eles sobem quatro arquivos (contas recebidas, contas pagas, extrato Unicred, extrato Itaú) e veem (a) o que o BPO lançou e não aconteceu no banco, e o que aconteceu no banco e o BPO não lançou, e (b) o que subiu ou caiu de custo contra o mês anterior, por categoria e por fornecedor.

**Architecture:** Toda a leitura e todo o cálculo são funções puras, testadas com trechos reais dos extratos. O servidor só orquestra: lê os quatro arquivos, guarda no S3 e no Postgres, e devolve o resultado já calculado. Nenhuma IA é usada — os PDFs são lidos como texto, de forma exata.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library, `exceljs` (já instalado), `unpdf` (novo).

**Spec:** [docs/superpowers/specs/2026-10-14-conciliacao-design.md](../specs/2026-10-14-conciliacao-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/conciliacao/tipos.ts` | **Novo.** Os tipos compartilhados. |
| `src/lib/conciliacao/pdf.ts` | **Novo.** PDF (bytes) → linhas de texto. Única parte que toca `unpdf`. |
| `src/lib/conciliacao/extrato-unicred.ts` | **Novo.** Linhas → movimentos + período. Puro. |
| `src/lib/conciliacao/extrato-itau.ts` | **Novo.** Idem, formato do Itaú. Puro. |
| `src/lib/conciliacao/planilha.ts` | **Novo.** Linhas do XLSX → lançamentos do sistema. Puro. |
| `src/lib/conciliacao/conciliar.ts` | **Novo.** Casa sistema × extrato. Puro. |
| `src/lib/conciliacao/comparativo.ts` | **Novo.** Diferença por categoria e por fornecedor. Puro. |
| `src/lib/conciliacao-db.ts` | **Novo.** Grava e lê um mês. Só servidor. |
| `src/lib/db.ts` | As três tabelas novas. |
| `src/lib/authz.ts` | `canConciliacaoSession()`. |
| `src/app/api/conciliacao/route.ts` | **Novo.** POST (envio) e GET (lista de meses). |
| `src/app/api/conciliacao/[mes]/route.ts` | **Novo.** GET do resultado de um mês. |
| `src/app/conciliacao/page.tsx` | **Novo.** Guarda de permissão. |
| `src/app/conciliacao/ConciliacaoClient.tsx` | **Novo.** A tela. |
| `src/components/NavMenu.tsx` | O link. |
| `src/app/usuarios/UsersClient.tsx` | A marcação da permissão. |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco.
- **`npm run build` roda as migrações idempotentes nesse banco.** Rode o build só onde o plano pedir.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas (`task-definitions`, `task-completions`, `patients`, `PatientCard`), hoje `6 failed, 390 passed, 396 total`. `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **Dinheiro em centavos inteiros**, como no resto do projeto. Use `BIGINT` nas colunas de valor.
- **Permissões** são colunas booleanas em `users` (`is_admin`, `can_estoque`). `src/lib/authz.ts` tem o padrão a seguir.
- **NAO use `exceljs` para ler as planilhas do BPO**: ele falha nelas (XML com
  prefixo de namespace). `read-excel-file` tambem. A leitura e com `jszip`
  (ja e dependencia) — ver a Task 3. `pdf-lib` esta instalado mas **nao**
  extrai texto; nao tente usa-lo para isso.
- **Os arquivos reais estão em `C:\Users\alexa\Downloads\`**: `contas_recebidas.xlsx`, `contas pagas (1).xlsx`, `Comp-14102026141412.pdf` (Unicred, 7 páginas, 01/09–30/09) e `Entradas_Saidas_ag<agencia>cc<conta>_14-10-26.pdf` (Itaú, 2 páginas, 14/09–14/10 — período errado de propósito, serve de fixture de formato). **Leia-os para conferir o seu leitor, mas NÃO os copie para dentro do repositório.**
- **As fixtures de teste são ANONIMIZADAS**: mesma estrutura, mesmas quebras de linha, mesmas peculiaridades de formatação, com nomes e valores inventados. Dado financeiro real da clínica não entra no git.

---

## Task 1: Ler os extratos

**Files:**
- Create: `src/lib/conciliacao/tipos.ts`, `pdf.ts`, `extrato-unicred.ts`, `extrato-itau.ts`
- Test: `__tests__/lib/conciliacao/extrato-unicred.test.ts`, `extrato-itau.test.ts`
- Modify: `package.json` (dependência `unpdf`)

- [ ] **Step 1: Instalar a dependência**

```bash
npm install unpdf
```

Versão conferida e funcionando: `unpdf@1.8.1`. Já foi testada fora do
repositório contra os dois PDFs reais: extrai os dois com acentuação correta.

- [ ] **Step 2: Os tipos**

Criar `src/lib/conciliacao/tipos.ts`:

```typescript
export type Banco = 'unicred' | 'itau'

/** Um lançamento como o BPO registrou no sistema contábil. */
export interface LancamentoSistema {
  data: string // AAAA-MM-DD, vem da "Data de pagamento"
  competencia: string | null
  centavos: number // negativo = saída
  banco: Banco
  nome: string
  descricao: string | null
  categoria: string
}

/** Um movimento como o banco registrou. */
export interface LancamentoExtrato {
  data: string // AAAA-MM-DD
  centavos: number // negativo = saída
  descricao: string
}

export interface PeriodoExtrato {
  inicio: string // AAAA-MM-DD
  fim: string
}

export interface ExtratoLido {
  periodo: PeriodoExtrato | null
  lancamentos: LancamentoExtrato[]
}
```

- [ ] **Step 3: O leitor de PDF (única parte que toca a biblioteca)**

Criar `src/lib/conciliacao/pdf.ts`:

```typescript
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * PDF → linhas de texto, já sem as vazias. Isolado num arquivo só porque é a
 * única parte que depende da biblioteca: os leitores de cada banco recebem
 * linhas e são testáveis sem PDF nenhum.
 */
export async function linhasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}
```

- [ ] **Step 4: Testes dos dois leitores (escrever primeiro)**

A peculiaridade central, **medida nos arquivos reais**: o `unpdf` quebra os
movimentos em várias linhas. Um registro começa numa linha que abre com data e
só termina algumas linhas depois, quando aparece o valor. O leitor precisa
**acumular linhas até fechar o registro** — uma regex por linha não resolve.

Criar `__tests__/lib/conciliacao/extrato-unicred.test.ts`:

```typescript
import { lerExtratoUnicred } from '@/lib/conciliacao/extrato-unicred'

// Trechos ANONIMIZADOS com a mesma estrutura e as mesmas quebras do extrato real.
// No Unicred cada movimento fecha com "R$ <saldo>" e depois "[-] R$ <valor>".
const LINHAS = [
  'Pág. 1CENTRAL DE RELACIONAMENTO: Capitais e regiões metropolitanas: 3003 7703',
  'Extrato',
  'EMPRESA EXEMPLO LTDA - **.',
  'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
  'Saldo em 31/08/2026: R$ 57.219,04',
  'Lançamentos Saldo (R$)Data Valor (R$)',
  // fecha na própria linha
  '02/09/2026 ARRECADACAO DE CONVENIOS ( Doc.: Convênio ) R$ 38.412,70- R$ 207,00',
  '02/09/2026 ARRECADACAO DE CONVENIOS ( Doc.: Convênio ) R$ 38.205,70- R$ 207,00',
  // quebra: a descrição e os valores vêm nas linhas seguintes
  '01/09/2026 CRED DOM – ARRANJO CREDITO ( Doc.: DomCred /',
  'FORNECEDOR EXEMPLO INSTITUIC ) R$ 38.657,35R$ 362,80',
  '01/09/2026 DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX /',
  'FULANO DE TAL ) R$ 24.657,35- R$ 14.000,00',
  // quebra em três
  '08/09/2026 LIQUIDACAO DE TITULO - IB ( Doc.: 1234567890 /',
  '12345678000199 - EMPRESA DE SERVICOS',
  'EXEMPLO LTDA ) R$ 23.036,15- R$ 1.408,55',
]

describe('lerExtratoUnicred', () => {
  it('lê o período declarado no cabeçalho', () => {
    expect(lerExtratoUnicred(LINHAS).periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
  })

  it('lê o movimento que fecha na própria linha, com sinal', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const convenios = lancamentos.filter(l => l.descricao.includes('CONVENIOS'))
    expect(convenios).toHaveLength(2)
    expect(convenios[0]).toEqual({ data: '2026-09-02', centavos: -20700, descricao: expect.stringContaining('ARRECADACAO DE CONVENIOS') })
  })

  it('junta a descrição quebrada em duas linhas', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const credito = lancamentos.find(l => l.centavos === 36280)
    expect(credito?.data).toBe('2026-09-01')
    expect(credito?.descricao).toContain('FORNECEDOR EXEMPLO')
  })

  it('junta a descrição quebrada em três linhas', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const titulo = lancamentos.find(l => l.centavos === -140855)
    expect(titulo?.data).toBe('2026-09-08')
    expect(titulo?.descricao).toContain('EMPRESA DE SERVICOS')
  })

  it('não confunde o saldo com o valor', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    // 38.657,35 é saldo; 362,80 é o valor. Nenhum lançamento pode ter o saldo.
    expect(lancamentos.some(l => Math.abs(l.centavos) === 3865735)).toBe(false)
  })

  it('ignora cabeçalho, rodapé e a linha de saldo anterior', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    expect(lancamentos).toHaveLength(5)
    expect(lancamentos.some(l => l.descricao.includes('Saldo em'))).toBe(false)
  })

  it('devolve período nulo e lista vazia num texto que não é extrato', () => {
    expect(lerExtratoUnicred(['qualquer coisa', 'outra linha'])).toEqual({ periodo: null, lancamentos: [] })
  })
})
```

Criar `__tests__/lib/conciliacao/extrato-itau.test.ts`:

```typescript
import { lerExtratoItau } from '@/lib/conciliacao/extrato-itau'

// No Itaú NÃO há saldo por linha: o valor é o último número do registro, e o
// CNPJ aparece antes dele. Linhas de SALDO não são movimento.
const LINHAS = [
  'Agência 9999 Conta 9999999-9CNPJ 12.345.678/0001-99EMPRESA EXEMPLO LTDA',
  'Saldo total Limite da conta Utilizado Disponível',
  'R$ 13.207,80 R$ 30.000,00 R$ 0,00 R$ 30.000,00',
  'Lançamentos do período: 01/09/2026 até 30/09/2026',
  'Data Lançamentos Razão Social CNPJ/CPF Valor (R$) Saldo (R$)',
  '30/09/2026 SALDO EM CONTA CORRENTE 13.207,80',
  '29/09/2026 SALDO TOTAL DISPONÍVEL DIA 13.207,07',
  // fecha na própria linha, débito
  '29/09/2026 PIX ENVIADO EMPRESA EXEMPLO LTDA 12.345.678/0001-99 -7.400,00',
  // sem CNPJ, crédito pequeno
  '28/09/2026 RENDIMENTOS REND PAGO APLIC AUT MAIS 0,02',
  // quebra em duas: CNPJ e valor na linha seguinte
  '27/09/2026 RECEBIMENTO REDE VISA',
  'AT1234567890',
  'ADQUIRENTE EXEMPLO S.A. 09.876.543/0001-21 4.117,20',
  // quebra em quatro
  '26/09/2026 PAGAMENTOS',
  'FORNECEDOR EXEMPLO INDUSTRIA,',
  'COMERCIO, IMPORTACAO E',
  'EXPORTACAO LTDA',
  '11.222.333/0002-44 -312,45',
]

describe('lerExtratoItau', () => {
  it('lê o período declarado', () => {
    expect(lerExtratoItau(LINHAS).periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
  })

  it('ignora as linhas de saldo — elas não são movimento', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    expect(lancamentos.some(l => /SALDO/i.test(l.descricao))).toBe(false)
    expect(lancamentos.some(l => Math.abs(l.centavos) === 1320780)).toBe(false)
  })

  it('lê débito e crédito que fecham na própria linha', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    expect(lancamentos.find(l => l.descricao.includes('PIX ENVIADO'))?.centavos).toBe(-740000)
    expect(lancamentos.find(l => l.descricao.includes('RENDIMENTOS'))?.centavos).toBe(2)
  })

  it('não confunde o CNPJ com o valor', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    const rede = lancamentos.find(l => l.descricao.includes('REDE VISA'))
    expect(rede?.centavos).toBe(411720)
    expect(rede?.data).toBe('2026-09-27')
  })

  it('junta a descrição quebrada em quatro linhas', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    const pag = lancamentos.find(l => l.centavos === -31245)
    expect(pag?.data).toBe('2026-09-26')
    expect(pag?.descricao).toContain('FORNECEDOR EXEMPLO')
  })

  it('lê exatamente 4 movimentos neste trecho', () => {
    expect(lerExtratoItau(LINHAS).lancamentos).toHaveLength(4)
  })
})
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npx jest __tests__/lib/conciliacao` → FAIL (módulos não existem).

- [ ] **Step 6: Implementar os dois leitores**

A forma de cada um: percorrer as linhas; quando a linha abre com data, começa
um registro novo e acumula as linhas seguintes até o texto acumulado fechar
(ter o valor). Cada banco decide o que é "fechar":

- **Unicred:** o acumulado termina em `R$ <saldo>` seguido de `[-] R$ <valor>`.
  O **último** par de valores é o que vale; o penúltimo é saldo e é descartado.
- **Itaú:** o acumulado termina num número no formato brasileiro que **não**
  seja parte de um CNPJ/CPF. Descartar o registro cuja descrição contenha
  `SALDO EM CONTA CORRENTE` ou `SALDO TOTAL DISPONÍVEL`.

Os padrões abaixo foram **medidos** nos dois PDFs reais — não são suposição.

Um helper comum, em `tipos.ts` ou num `util.ts` do mesmo diretório:

```typescript
/** "13.207,80" → 1320780. Formato brasileiro, sem passar por float. */
export function brParaCentavos(texto: string): number {
  const limpo = texto.replace(/\s|R\$/g, '')
  const neg = limpo.startsWith('-')
  const [inteiro, decimal = '00'] = limpo.replace('-', '').split(',')
  return (neg ? -1 : 1) * (Number(inteiro.replace(/\./g, '')) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2)))
}

/** "01/09/2026" → "2026-09-01". */
export function dataBrParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
```

**Unicred** (`extrato-unicred.ts`). O registro fecha quando o acumulado termina
com saldo e valor. Repare: o sinal de negativo fica **entre** os dois, colado
no fim do saldo — `R$ 38.412,70- R$ 207,00` é débito de 207,00; sem o traço
(`R$ 38.657,35R$ 362,80`) é crédito.

```typescript
const PERIODO = /Período de (\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/
const ABRE = /^(\d{2}\/\d{2}\/\d{4})\s+(?!\d{2}:\d{2})/  // data seguida de hora é cabeçalho
const FECHA = /R\$\s*[\d.]+,\d{2}\s*(-)?\s*R\$\s*([\d.]+,\d{2})\s*$/

export function lerExtratoUnicred(linhas: string[]): ExtratoLido {
  let periodo: PeriodoExtrato | null = null
  const lancamentos: LancamentoExtrato[] = []
  let data: string | null = null
  let buffer = ''

  const fechar = () => {
    const m = data && FECHA.exec(buffer)
    if (m) {
      const centavos = brParaCentavos(m[2]) * (m[1] ? -1 : 1)
      lancamentos.push({ data: data!, centavos, descricao: buffer.replace(FECHA, '').trim() })
    }
    data = null
    buffer = ''
  }

  for (const linha of linhas) {
    if (!periodo) {
      const p = PERIODO.exec(linha)
      if (p) periodo = { inicio: dataBrParaIso(p[1])!, fim: dataBrParaIso(p[2])! }
    }
    const abre = ABRE.exec(linha)
    if (abre) {
      fechar() // o registro anterior que não fechou é descartado
      data = dataBrParaIso(abre[1])
      buffer = linha.slice(abre[0].length).trim()
    } else if (data) {
      buffer += ' ' + linha.trim()
    }
    if (data && FECHA.test(buffer)) fechar()
  }
  fechar()
  return { periodo, lancamentos }
}
```

**Itaú** (`extrato-itau.ts`). Não há saldo por linha: o valor é o último número
do registro, com o sinal colado (`-7.400,00`). O CNPJ/CPF aparece antes dele e
**não pode** ser confundido com valor — tire-o do texto antes de procurar o
número. As linhas de saldo não são movimento.

```typescript
const PERIODO_ITAU = /Lançamentos do período:\s*(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/
const DOC = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g
const VALOR_FIM = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/
const NAO_E_MOVIMENTO = /SALDO EM CONTA CORRENTE|SALDO TOTAL DISPON/i
```

Mesma máquina de estado do Unicred, trocando o `FECHA` por: tirar os
documentos com `DOC`, e então testar `VALOR_FIM` no que sobrou. Descartar o
registro cuja descrição case `NAO_E_MOVIMENTO`.

Se algum caso real não couber nesses padrões, **acrescente um teste** com o
trecho anonimizado antes de ajustar o código — nunca o contrário.

- [ ] **Step 7: Conferir contra os PDFs reais (fora do repositório)**

Criar na raiz `conferir-extratos.mts`, rodar e **apagar em seguida**:

```typescript
import { readFile } from 'node:fs/promises'
import { linhasDoPdf } from './src/lib/conciliacao/pdf.ts'
import { lerExtratoUnicred } from './src/lib/conciliacao/extrato-unicred.ts'
import { lerExtratoItau } from './src/lib/conciliacao/extrato-itau.ts'

const uni = lerExtratoUnicred(await linhasDoPdf(new Uint8Array(await readFile('C:/Users/alexa/Downloads/Comp-14102026141412.pdf'))))
const ita = lerExtratoItau(await linhasDoPdf(new Uint8Array(await readFile('C:/Users/alexa/Downloads/Entradas_Saidas_ag<agencia>cc<conta>_14-10-26.pdf'))))
const soma = (l: { centavos: number }[], f: (c: number) => boolean) => l.filter(x => f(x.centavos)).reduce((s, x) => s + x.centavos, 0) / 100
for (const [nome, e] of [['UNICRED', uni], ['ITAU', ita]] as const) {
  console.log(`${nome}: periodo ${e.periodo?.inicio} a ${e.periodo?.fim} | ${e.lancamentos.length} movimentos`)
  console.log(`   credito ${soma(e.lancamentos, c => c > 0).toFixed(2)} | debito ${soma(e.lancamentos, c => c < 0).toFixed(2)}`)
  console.log(`   sem data valida: ${e.lancamentos.filter(x => !/^\d{4}-\d{2}-\d{2}$/.test(x.data)).length}`)
}
```

Run: `node --env-file=.env.local conferir-extratos.mts`

**O que esperar:** Unicred com período 2026-09-01 a 2026-09-30 e crédito e
débito na ordem de grandeza dos totais impressos no próprio PDF — a conferência
é contra o arquivo na mão, porque número de conta da clínica não fica escrito
aqui. (Só para ilustrar a forma do que sai: algo como crédito **100.000,00** e
débito **−160.000,00**.) O módulo tem de dar **mais alto** que o do teste
anterior, porque os 11 movimentos de descrição quebrada que ele perdeu agora
entram. O número de referência correto vem da Task 2, quando o casamento
rodar. Itaú com período 2026-09-14 a 2026-10-14 (o arquivo está com
período errado de propósito) e ~45 movimentos.

**Se algum dos dois devolver período nulo ou zero movimentos, pare e reporte** —
é o leitor que está errado, não o arquivo.

Depois: `rm conferir-extratos.mts`.

- [ ] **Step 8: Verificar e commitar**

Run: `npx jest __tests__/lib/conciliacao` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

```bash
git add package.json package-lock.json src/lib/conciliacao __tests__/lib/conciliacao && git commit -m "feat(conciliacao): leitores dos extratos Unicred e Itau"
```

---

## Task 2: Planilhas, casamento e comparativo

**Files:**
- Create: `src/lib/conciliacao/planilha.ts`, `conciliar.ts`, `comparativo.ts`
- Test: `__tests__/lib/conciliacao/planilha.test.ts`, `conciliar.test.ts`, `comparativo.test.ts`

- [ ] **Step 1: O leitor da planilha**

As duas planilhas têm a mesma estrutura. Colunas medidas no arquivo real
(`Table1`, linha 1 = cabeçalho, 83 linhas de dados em setembro):

```
Id | Vencimento | Competência | Previsto para | Data de pagamento | CPF/CNPJ |
Nome | Descrição | Referência | Categoria | Detalhamento | Centro de Custo |
Valor categoria/centro de custo | Identificador | Banco | [Número NFS-e]
```

`planilha.ts` **não** lê o arquivo: recebe uma matriz de linhas (o que o
`exceljs` já devolve) e converte. Assim é puro e testável.

```typescript
export function lerPlanilha(linhas: unknown[][]): LancamentoSistema[]
```

Regras, todas medidas no arquivo real:

- Acha as colunas **pelo nome do cabeçalho**, não pela posição — as duas
  planilhas diferem na última coluna, e o fornecedor pode mudar a ordem.
  A coluna de valor é a que começa com `Valor`.
- Data no formato `DD/MM/AAAA` → `AAAA-MM-DD`. Linha sem data de pagamento é
  **descartada** (não foi paga, não pode estar no extrato).
- Valor é texto com **ponto decimal** (`362.80`, `-10000`). Converta para
  centavos inteiros sem passar por float arredondado: trate a parte inteira e
  a decimal separadamente.
- `Banco`: `Unicred` → `'unicred'`, `Itaú`/`Itau` → `'itau'`. Qualquer outro
  valor **descarta a linha e conta num aviso** — não invente banco.
- `CPF/CNPJ` **não é lido**: não é usado em nada e é dado pessoal de terceiro.

Testes: cabeçalho fora de ordem; linha sem data de pagamento; valor negativo;
valor com decimal e sem decimal; banco desconhecido; planilha vazia; e que o
CPF/CNPJ não aparece em nenhum campo do resultado.

- [ ] **Step 2: O casamento**

```typescript
export interface ResultadoConciliacao {
  banco: Banco
  conciliados: number
  soNoSistema: LancamentoSistema[]
  soNoExtrato: LancamentoExtrato[]
  totalSistemaCredito: number; totalSistemaDebito: number
  totalExtratoCredito: number; totalExtratoDebito: number
}

export function conciliar(
  sistema: LancamentoSistema[],
  extrato: LancamentoExtrato[],
  banco: Banco,
): ResultadoConciliacao
```

Casa por **data + centavos exatos**, dentro do banco. O ponto que um teste
precisa fixar: quando houver **dois lançamentos iguais no mesmo dia e valor**
(acontece — dois boletos de R$ 207,00 em 02/09), dois do sistema têm que
consumir dois do extrato, não um. Use contagem, não existência.

Testes: casamento perfeito; sobra só de um lado; sobra dos dois; o caso dos
dois iguais no mesmo dia (2×2, e 2 do sistema × 1 do extrato deixando 1 sobra);
listas vazias; lançamento de outro banco que não pode entrar.

- [ ] **Step 3: O comparativo**

```typescript
export interface LinhaComparativo {
  chave: string          // categoria, ou nome do fornecedor no detalhe
  atual: number          // centavos
  anterior: number
  diferenca: number      // atual - anterior
  percentual: number | null  // null quando o mês anterior era zero
}

export function compararCategorias(atual: LancamentoSistema[], anterior: LancamentoSistema[]): {
  receitas: LinhaComparativo[]
  despesas: LinhaComparativo[]
}

export function compararFornecedores(
  atual: LancamentoSistema[], anterior: LancamentoSistema[], categoria: string,
): LinhaComparativo[]
```

- Separa receita (centavos > 0) de despesa (< 0).
- Ordena pela **maior alta em reais**. Em despesa, "alta" é ficar mais
  negativo: ordene pelo que mais aumentou o gasto, não pelo maior `diferenca`
  numérico — um teste precisa fixar isso, é o erro fácil de cometer.
- Categoria presente num mês e ausente no outro entra com zero do outro lado,
  nunca é omitida.
- `percentual` é `null` quando o mês anterior era zero (não é "infinito" nem
  100%).

Testes: subiu, caiu, só no mês atual, só no anterior, ordenação por reais e
não por percentual (o caso de 100→400 ficando abaixo de 30.000→38.000),
despesa ordenada corretamente, mês anterior vazio.

- [ ] **Step 4: Verificar e commitar**

Run: `npx jest __tests__/lib/conciliacao` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

```bash
git add src/lib/conciliacao __tests__/lib/conciliacao && git commit -m "feat(conciliacao): leitura da planilha, casamento e comparativo"
```

---

## Task 3: Permissão, banco e rotas

**Files:**
- Modify: `src/lib/db.ts`, `src/lib/authz.ts`, `src/proxy.ts` (se necessário)
- Create: `src/lib/conciliacao-db.ts`, `src/app/api/conciliacao/route.ts`, `src/app/api/conciliacao/[mes]/route.ts`

- [ ] **Step 1: Migração**

No fim de `runMigrations()`, as três tabelas da spec (`conciliacao_meses`,
`conciliacao_sistema`, `conciliacao_extrato`) com os índices, e:

```typescript
await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS can_conciliacao BOOLEAN DEFAULT FALSE`).catch(() => {})
```

**Não** marque ninguém por SQL. A marcação é feita na tela de Usuários, pelo
dono — assim fica registrado quem marcou e quando.

- [ ] **Step 2: A permissão**

Em `src/lib/authz.ts`, no mesmo molde de `canEstoqueSession`:

```typescript
/** Conciliação é dos donos da clínica: admin ou can_conciliacao. */
export async function canConciliacaoSession(): Promise<boolean> {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_conciliacao?: boolean } | undefined
  return !!u?.is_admin || !!u?.can_conciliacao
}
```

Confira como `can_estoque` chega na sessão (em `src/auth.ts`) e faça o mesmo
com `can_conciliacao` — se o campo não for colocado na sessão, a função acima
devolve sempre `false` e **nada funciona**. Esse é o erro mais provável desta
task.

- [ ] **Step 3: Gravar e ler um mês**

`src/lib/conciliacao-db.ts`:

- `salvarMes(dados)` — numa **transação**: apaga o mês se já existir (o
  `ON DELETE CASCADE` limpa as linhas), insere `conciliacao_meses`, depois as
  linhas de sistema e de extrato em lote.
- `lerMes(mes)` — devolve as linhas dos dois lados.
- `listarMeses()` — os meses já enviados, do mais novo para o mais antigo.

- [ ] **Step 4: As rotas**

`POST /api/conciliacao` — `multipart/form-data` com os quatro arquivos e o mês:

1. `canConciliacaoSession()`, senão 403.
2. Mês no formato `AAAA-MM`, senão 400.
3. Os quatro arquivos presentes, senão 400 dizendo **quais** faltam.
4. Lê os dois XLSX com `matrizDoXlsx` (leitor próprio sobre o `jszip`; o
   `exceljs` **não** abre esses arquivos) e os dois PDFs com `linhasDoPdf` + o
   leitor do banco.
5. **Confere o período de cada extrato**: tem que cobrir do dia 1 ao último dia
   do mês. Se não cobrir, **400** com a mensagem exata do que veio e do que
   deveria vir — e nada é gravado. Cobrir MAIS que o mês passa, e aí o que cai
   fora do mês é separado dos dois lados e **contado** (`foraDoMes`), para não
   virar divergência inventada.
6. Sobe os quatro ao S3 (`conciliacao/<mes>/<nome>`), tolerando falha do S3 sem
   derrubar o envio (padrão do `scan-nf`).
7. Grava na transação. Registra em `logAudit`.
8. Devolve o resultado já calculado.

`GET /api/conciliacao` — lista de meses. `GET /api/conciliacao/[mes]` —
conciliação dos dois bancos + comparativo contra o mês anterior.

Limite de tamanho: recuse arquivo acima de ~15 MB com 400, para não derrubar o
processo com um PDF gigante.

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.
**Não** rode o build nesta task.

```bash
git add src/lib src/app/api/conciliacao && git commit -m "feat(conciliacao): permissao, tabelas e rotas"
```

---

## Task 4: A tela

**Files:**
- Create: `src/app/conciliacao/page.tsx`, `src/app/conciliacao/ConciliacaoClient.tsx`
- Test: `__tests__/components/ConciliacaoClient.test.tsx`
- Modify: `src/components/NavMenu.tsx`, `src/app/usuarios/UsersClient.tsx`

- [ ] **Step 1: Teste do componente (escrever primeiro)**

Cobrir, com `fetch` mockado no padrão dos outros testes de componente do
projeto (veja `__tests__/components/PrecosTab.test.tsx`):

- os quatro campos de arquivo aparecem, rotulados;
- o botão de enviar fica travado enquanto faltar arquivo ou mês;
- quando a rota devolve erro de período, a mensagem do servidor aparece na
  tela (não um "erro ao enviar" genérico);
- a conciliação mostra, por banco, a contagem e as duas listas de diferença;
- quando não há diferença nenhuma, diz isso em vez de mostrar lista vazia;
- o comparativo lista as categorias ordenadas pela maior alta em reais;
- clicar numa categoria abre os fornecedores;
- no primeiro mês, o comparativo diz que não há mês anterior.

- [ ] **Step 2: A página e a guarda**

`page.tsx` no molde de `src/app/estoque/page.tsx`: redireciona quem não tem a
permissão.

- [ ] **Step 3: A tela**

Duas abas internas, **Conciliação** e **Custos**, com um seletor de mês no
topo e o envio dos quatro arquivos.

Na Conciliação, um bloco por banco: os totais lado a lado (sistema × extrato,
com a diferença), a contagem de conciliados, e as duas listas. A lista é o
produto da aba — deixe ela fácil de ler e de copiar: data, valor, nome,
descrição e categoria, em ordem de data.

Em Custos, a tabela de categorias com valor do mês, valor do mês anterior,
diferença em reais e em percentual, ordenada pela maior alta. Receitas e
despesas em blocos separados. Clicar na categoria abre os fornecedores.

Siga o visual das outras telas (cartões brancos, borda cinza, `rounded-xl`) —
não invente um estilo novo.

- [ ] **Step 4: O menu e a tela de usuários**

Em `NavMenu.tsx`, o link `{ href: '/conciliacao', label: 'Conciliação' }`
condicionado a `isAdmin || canConciliacao` — e confira como `canEstoque` chega
no componente hoje, fazendo igual.

Em `UsersClient.tsx`, a marcação `can_conciliacao` junto de `can_estoque`,
inclusive no PUT que salva o usuário.

- [ ] **Step 5: Verificar e commitar**

Run: `npx jest __tests__/components/ConciliacaoClient.test.tsx` → PASS (3×).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

```bash
git add src/app/conciliacao src/components/NavMenu.tsx src/app/usuarios __tests__/components/ConciliacaoClient.test.tsx && git commit -m "feat(conciliacao): aba, menu e permissao na tela de usuarios"
```

---

## Conferência final (quem coordena, não o executor)

- `npm run build` — aqui também é onde se confirma que o `unpdf` entra no
  pacote do servidor sem erro. **Se o build quebrar por causa dele, pare**: é o
  risco número 1 da spec, e o plano B (mandar o PDF para a IA) muda a Task 1.
- Merge em `master` e push.
- Em produção: marcar `can_conciliacao` para Alexandre e Francielle na tela de
  Usuários, conferir que o Carlos **não** vê a aba, e subir setembro.
- O extrato do Itaú de setembro ainda vai vir com o período certo (o atual é de
  14/09 a 14/10). Até lá, o envio de setembro vai ser recusado pela conferência
  de período — que é o comportamento correto.
