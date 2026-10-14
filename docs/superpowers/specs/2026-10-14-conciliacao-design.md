# Aba Conciliação

**Data:** 2026-10-14
**Status:** aguardando revisão do dono

## Problema

A clínica terceirizou o financeiro num modelo de BPO à distância. O BPO
alimenta um sistema contábil; o dono exporta de lá dois relatórios (contas
recebidas e contas pagas) e baixa os extratos das duas contas bancárias
(Unicred e Itaú). Hoje essa conferência é manual, e na prática não acontece
todo mês.

Duas perguntas que ele quer responder, uma vez por mês:

1. **O que o BPO lançou bate com o que aconteceu no banco?** Como é o BPO que
   alimenta o sistema de onde saem as planilhas, comparar planilha × extrato é
   literalmente auditar o trabalho deles.
2. **O que aumentou ou diminuiu de custo de um mês para o outro?** E, quando
   uma categoria sobe, qual fornecedor fez subir.

## O que foi medido nos arquivos reais (setembro/2026)

Tudo abaixo foi conferido com os quatro arquivos de setembro, não é suposição.

**`contas_recebidas.xlsx` e `contas_pagas (1).xlsx`** — 83 lançamentos cada,
mesma estrutura de 15–16 colunas. As que importam: `Data de pagamento`,
`Nome`, `Descrição`, `Categoria`, `Banco` (Unicred/Itaú) e o valor (coluna
`Valor categoria/centro de custo`, texto com ponto decimal; negativo nas
pagas). Totais — **ILUSTRATIVOS**, os números do mês ficam nos próprios
arquivos, fora do repositório: recebidas na casa de R$ 100.000,00, pagas na casa
de R$ −150.000,00.

**Extrato Unicred (`Comp-*.pdf`)** — 7 páginas de texto extraível, período
01/09 a 30/09. Cada movimento tem data, descrição, **saldo e valor** na mesma
linha; descrições longas quebram em duas linhas.

**Extrato Itaú (`Entradas_Saidas_*.pdf`)** — formato **diferente**: sem saldo
por linha, com linhas de `SALDO EM CONTA CORRENTE` e `SALDO TOTAL DISPONÍVEL
DIA` que **não são movimento**, e descrições que quebram em até quatro linhas.
O arquivo enviado veio de **14/09 a 14/10** — período corrido, não o mês.

**O cruzamento funciona.** Casando os lançamentos Unicred por data + valor:
128 dos 139 casaram exatamente; 11 ficaram de fora e **nenhum era divergência
real** — eram as linhas de descrição quebrada que o leitor de teste não juntou.
Nada sobrou do lado do extrato. Com o leitor correto, setembro fecha
praticamente 100%.

Isso é o que dá valor à aba: quando algo não casar, é diferença de verdade.

## Contexto do código hoje

- Permissões são colunas booleanas em `users`: `is_admin`, `can_estoque`.
  São 9 usuários; só Alexandre é admin, Francielle e Carlos têm `can_estoque`.
  Como o Carlos **não** pode ver esta aba, nenhuma permissão existente serve.
- `src/lib/authz.ts` tem `isAdminSession()` e `canEstoqueSession()` — o padrão
  a seguir.
- `src/components/NavMenu.tsx` monta os links com `...(isAdmin ? [...] : [])`.
- `uploadFile` de `@/lib/s3` já é usado para guardar documentos (padrão do
  `scan-nf`).
- **`exceljs@4.4.0` é dependência, mas NÃO abre as planilhas do BPO** (medido
  em 14/10): o export usa XML com prefixo de namespace (`<x:workbook>`,
  `<x:row>`) e o parser do exceljs não enxerga os elementos. `read-excel-file`
  falha pelo mesmo motivo. O SheetJS (`xlsx`) abre, mas a versao publicada no
  npm (0.18.5) carrega duas CVEs conhecidas. Decisao: **leitor proprio sobre o
  `jszip`**, que ja e dependencia — o formato e fixo (mesmo export todo mes) e
  o leitor falha alto quando nao reconhece o arquivo.
- **`pdf-lib` está instalado mas não extrai texto.** Extrair texto de PDF é
  uma dependência nova.
- Dinheiro no projeto é inteiro em centavos.

## Comportamento

### 1. Quem vê

Coluna nova `users.can_conciliacao`, marcada para Alexandre e Francielle. Um
helper `canConciliacaoSession()` em `authz.ts`, no mesmo molde do de estoque.
A aba só aparece no menu para quem tem a marca; a página `/conciliacao`
redireciona quem não tem; todas as rotas da API exigem a permissão.

A aba se chama **Conciliação** (com "c").

### 2. O envio mensal

Uma tela de envio que pede os quatro arquivos de uma vez, cada um no seu
campo rotulado:

- Contas recebidas (XLSX)
- Contas pagas (XLSX)
- Extrato Unicred (PDF)
- Extrato Itaú (PDF)

O dono escolhe o **mês de referência**. Ao enviar, o servidor lê os quatro,
guarda os arquivos no S3 e as linhas no banco, e abre o resultado.

**Os quatro são obrigatórios.** Conciliar com um extrato faltando daria a
falsa impressão de que o outro banco está certo.

**Conferência de período, antes de conciliar.** Cada extrato declara o período
que cobre. Se ele não cobrir o mês inteiro escolhido, a tela avisa com clareza
— *"o extrato do Itaú cobre 14/09 a 14/10; exporte de 01/09 a 30/09"* — e não
deixa concluir. Esse foi exatamente o erro do arquivo de setembro e é o erro
que mais se repete na prática.

O dono confirmou (14/10) que o extrato do Itaú de setembro saiu com os últimos
30 dias por engano e vai reexportar. Isso **não trava o desenvolvimento**: o
formato do PDF é o mesmo qualquer que seja o período, então o arquivo atual
serve de fixture para o leitor do Itaú. O que fica pendente é a primeira
conciliação real do Itaú, que só acontece com o arquivo de 01/09 a 30/09.

**Reenviar um mês substitui o anterior.** O dono acha uma diferença, cobra o
BPO, eles corrigem, ele reexporta e envia de novo. A versão anterior é
descartada; os arquivos antigos ficam no S3.

### 3. A conciliação

Uma visão por banco (Unicred e Itaú separados — cada um tem seu extrato).

O casamento é por **banco + data de pagamento + valor exato**. Quando houver
mais de um lançamento igual no mesmo dia e valor (acontece: dois boletos de
R$ 207,00 no mesmo dia), cada um do sistema consome um do extrato — a
contagem tem que bater, não só a existência.

A tela mostra, por banco:

- **Totais**: crédito e débito do sistema × crédito e débito do extrato, e a
  diferença de cada um.
- **Conciliados**: a contagem (ex.: "128 de 139").
- **Só no sistema**: o BPO lançou e o dinheiro não se moveu. Lista com data,
  valor, nome, descrição e categoria.
- **Só no extrato**: o dinheiro se moveu e o BPO não lançou. Lista com data,
  valor e descrição.

Essas duas listas são o produto da aba. É o que ele leva para o WhatsApp.

**Não existe marcar, resolver ou comentar.** Decisão do dono: ele olha e cobra
por fora. A aba não guarda situação de diferença.

### 4. O comparativo de custo

Uma visão do mês escolhido **contra o mês anterior**, por categoria.

- Ordenada pela **maior alta em reais**, não em percentual: uma categoria que
  foi de R$ 100 para R$ 400 subiu 300% e não é notícia; "Custo serviço
  prestado" subindo R$ 8.000 é.
- Mostra o valor dos dois meses, a diferença em reais e em percentual.
- Receitas e despesas em blocos separados.
- **Clicar numa categoria abre os fornecedores** (`Nome`) que a compõem, nos
  dois meses, com a mesma lógica de diferença. "Serviços contratados subiu
  R$ 6.000" não diz o que fazer; "a MKT foi de 2.500 para 8.500" diz.
- Categoria que existe num mês e não no outro aparece como entrada nova ou
  como saída (valor zero do outro lado), não é escondida.

**No primeiro mês não há comparação** — a tela diz isso em vez de mostrar
tudo como alta de 100%.

### 5. Qual data manda

Tudo usa a **data de pagamento**, inclusive o comparativo de custo. É a única
data que pode bater com o extrato, e usar a mesma nas duas metades da aba
garante que os números conversem entre si. `Competência` é lida e guardada,
mas não é usada para agrupar.

### Fora do escopo

- Marcar, resolver ou comentar diferenças.
- Subir o balanço que o BPO envia (a conferência aqui é planilha × extrato).
- Casar por aproximação (valor parecido, data próxima, nome parecido). O
  casamento é exato; o que não casar vira item de lista.
- Qualquer lançamento manual dentro da aba.
- Outras contas bancárias além de Unicred e Itaú.
- Exportar o resultado (PDF/planilha).
- Previsão, orçamento ou meta.

## Arquitetura

### Leitura dos arquivos — puro e testável

O risco maior aqui é leitor de arquivo: um dígito errado num extrato é pior
que não ter a aba. Então toda a leitura é função pura, recebendo texto ou
linhas já extraídas, com teste em cima de trechos reais dos arquivos de
setembro usados como fixture.

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/conciliacao/planilha.ts` | Converte as linhas do XLSX (já lidas pelo exceljs) em `LancamentoSistema`. Normaliza data, valor em centavos, banco, categoria. |
| `src/lib/conciliacao/extrato-unicred.ts` | Texto do PDF → `LancamentoExtrato[]`. Junta descrição quebrada; ignora linhas de saldo; extrai o período declarado. |
| `src/lib/conciliacao/extrato-itau.ts` | Idem, no formato do Itaú: sem saldo por linha, descartando `SALDO EM CONTA CORRENTE` e `SALDO TOTAL DISPONÍVEL DIA`. |
| `src/lib/conciliacao/conciliar.ts` | Casa sistema × extrato por banco+data+valor, com contagem. Devolve conciliados, só-no-sistema e só-no-extrato. |
| `src/lib/conciliacao/comparativo.ts` | Diferença por categoria entre dois meses, e por fornecedor dentro de uma categoria. |

Tipos centrais:

```typescript
export interface LancamentoSistema {
  data: string          // AAAA-MM-DD, da Data de pagamento
  competencia: string | null
  centavos: number      // negativo = saída
  banco: 'unicred' | 'itau'
  nome: string
  descricao: string | null
  categoria: string
}

export interface LancamentoExtrato {
  data: string          // AAAA-MM-DD
  centavos: number      // negativo = saída
  descricao: string
}

export interface PeriodoExtrato { inicio: string; fim: string }
```

### Extração de texto do PDF — dependência nova e risco

Nenhuma biblioteca instalada extrai texto de PDF. Será preciso acrescentar
uma (`unpdf` ou `pdfjs-dist`), e **isso é o ponto mais arriscado do
trabalho**: extrair texto de PDF dentro de uma rota do Next.js costuma
esbarrar em configuração de worker e de runtime.

Por isso o plano de implementação começa provando que a extração funciona na
rota de verdade, com os dois PDFs reais, **antes** de qualquer outra coisa. Se
não funcionar, a alternativa é mandar o PDF para a IA (o caminho que o
`scan-nf` já usa) — mais caro, mais lento e menos exato, e por isso é plano B,
não plano A.

### Banco — `src/lib/db.ts` (`runMigrations`)

```sql
CREATE TABLE IF NOT EXISTS conciliacao_meses (
  id SERIAL PRIMARY KEY,
  mes DATE NOT NULL UNIQUE,          -- sempre o dia 1 do mês de referência
  recebidas_s3_key TEXT,
  pagas_s3_key TEXT,
  unicred_s3_key TEXT,
  itau_s3_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conciliacao_sistema (
  id SERIAL PRIMARY KEY,
  mes_id INTEGER NOT NULL REFERENCES conciliacao_meses(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  competencia DATE,
  valor_centavos BIGINT NOT NULL,
  banco TEXT NOT NULL CHECK (banco IN ('unicred','itau')),
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conciliacao_extrato (
  id SERIAL PRIMARY KEY,
  mes_id INTEGER NOT NULL REFERENCES conciliacao_meses(id) ON DELETE CASCADE,
  banco TEXT NOT NULL CHECK (banco IN ('unicred','itau')),
  data DATE NOT NULL,
  valor_centavos BIGINT NOT NULL,
  descricao TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conciliacao_sistema_mes_idx ON conciliacao_sistema (mes_id);
CREATE INDEX IF NOT EXISTS conciliacao_extrato_mes_idx ON conciliacao_extrato (mes_id);
```

`mes` é único: reenviar um mês apaga o anterior (o `ON DELETE CASCADE` limpa
as linhas) e grava de novo, dentro de uma transação. As chaves do S3 antigas
não são apagadas — o arquivo fica como histórico.

Volume: ~320 linhas por mês, ~4 mil por ano. Irrelevante.

### Servidor

- `src/lib/conciliacao-db.ts` — grava um mês (transação), lê um mês, lista os
  meses existentes, lê os totais por categoria de dois meses.
- `POST /api/conciliacao` — recebe os quatro arquivos e o mês; lê, valida
  período, grava, devolve o resultado. Exige `canConciliacaoSession()`.
- `GET /api/conciliacao` — lista os meses já enviados.
- `GET /api/conciliacao/[mes]` — conciliação e comparativo daquele mês.
- O envio vai para a auditoria (`logAudit`).

### Interface

- `src/app/conciliacao/page.tsx` — guarda de permissão, no molde de
  `/estoque`.
- `src/app/conciliacao/ConciliacaoClient.tsx` — seletor de mês, envio dos
  quatro arquivos, e duas abas internas: **Conciliação** e **Custos**.
- `src/components/NavMenu.tsx` — o link, condicionado à permissão.
- `src/app/usuarios` — a marcação `can_conciliacao` na tela de usuários, junto
  de `can_estoque`.

### Testes

- **Puros, com fixtures reais** (`__tests__/lib/conciliacao/*`): trechos
  verbatim dos extratos de setembro, incluindo os casos que quebraram o leitor
  de teste — descrição em duas linhas na Unicred, descrição em quatro linhas
  no Itaú, linha de saldo que deve ser ignorada, crédito e débito, valor com
  milhar.
- **Casamento**: dois lançamentos iguais no mesmo dia casando com dois do
  extrato (não um só); sobra dos dois lados; conjunto vazio.
- **Comparativo**: categoria que subiu, que caiu, que só existe num dos meses;
  ordenação por reais e não por percentual; drill-down por fornecedor.
- **Período**: extrato que cobre o mês, que cobre demais, que cobre de menos.
- **Componente**: a tela mostra as duas listas de diferença e o aviso de
  período errado.
- Rotas e banco: sem harness no projeto; entram por revisão de código.

## Riscos conhecidos

1. **Extração de texto do PDF no runtime do Next.js** — o maior. Provado logo
   na primeira tarefa do plano; plano B é a IA.
2. **Mudança de layout do extrato pelo banco.** Se a Unicred ou o Itaú mudarem
   o PDF, o leitor quebra. Como o casamento é exato, a quebra aparece como
   "nada casou" — ruidoso, mas não silencioso, que é o comportamento certo.
3. **Dado financeiro sensível** (retiradas dos sócios, salários, CPF/CNPJ de
   fornecedores) passa a ficar no banco e no S3 do projeto. Visível para duas
   pessoas, protegido pela permissão nova e pelo `proxy.ts`. É uma ampliação
   real da superfície do sistema e precisa ser uma decisão consciente do dono.
