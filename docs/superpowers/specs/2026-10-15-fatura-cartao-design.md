# Conciliação › Fatura do cartão

**Data:** 2026-10-15
**Status:** aguardando revisão do dono

## Problema

A aba Conciliação mostra o custo do mês por categoria. Em setembro, a maior
linha depois de retirada e medicação é **"Cartão de Crédito — R$ 20.000,00"**:
13% de tudo que saiu da clínica, numa única linha que não diz nada.

O BPO lança a fatura como uma despesa só, e ninguém sabe o que tem dentro. Com
isso, a pergunta que a aba existe para responder — *o que aumentou de custo?* —
fica cega justamente onde mais gasto se concentra.

## O que foi medido na fatura real (ref. out/2026)

Tudo abaixo foi conferido no arquivo, não é suposição.

**A fatura fecha, e isso é o que torna a leitura determinística possível.** Três
identidades, todas exatas:

| Conta | Confere |
|---|---|
| soma dos 67 lançamentos de compra | **R$ 22.000,00** = `DESPESAS/DÉBITOS` declarado |
| os dois totais por portador | somam o `SALDO TOTAL` (a fatura separa por portador; o relatório descarta essa divisão) |
| anterior − pagamentos + despesas + encargos | 20.000,00 − 20.020,00 + 22.000,00 + 0 = **21.980,00** |

**Duas faturas foram lidas, e as duas fecham com a mesma regra** — o formato é
estável: `out/2026` com 67 compras somando R$ 22.000,00, e `set/2026` com 74
compras somando R$ 20.020,00, cada uma igual ao seu `DESPESAS/DÉBITOS`.

**O `TOTAL FATURA ANTERIOR` desta fatura é R$ 20.000,00** — exatamente o valor
que o BPO lançou como despesa de cartão em setembro. É assim que a fatura se
amarra ao mês.

**Peculiaridades do arquivo, todas com consequência no leitor:**

- **O texto vem com as letras separadas** (`A N D R A D E`). O texto corrido do
  PDF é inútil: a leitura tem que ser **por posição** (itens do pdf.js
  agrupados por `y`, ordenados por `x`), com uma regra que refaz a palavra
  quando o item inteiro é letra-espaço-letra. Isso é diferente dos extratos, que
  funcionam com texto corrido.
- **Linha de compra:** `DD/mmm DESCRIÇÃO [Parc. N/M] R$ 9.999,99`.
- **A data não tem ano.** `16/dez` numa fatura `out/2026` é dezembro de **2025**:
  mês maior que o da referência pertence ao ano anterior.
- **24 dos 63 são parcelados** (`Parc. 2/5`).
- **Compra internacional ocupa três linhas**, e a do meio é a que tem data e
  valor em reais:
  ```
  ANTHROPIC* CLAUDE SUB - USD 108.47
  09/set                        R$ 551,57
  Conversão: USD 1 = R$ 5,09
  ```
  São 4 na fatura, somando R$ 905,45 — e eram exatamente elas que faltavam para
  a soma fechar quando o leitor as ignorava. O **IOF vem em linha separada**,
  como compra normal (`IOF compra internacional - RENDER.COM R$ 10,33`).
- **Há linhas negativas que não são despesa**: `Pagamento Recebido -R$ 20.000,00`
  e `Anuidade - bonificação -R$ 21,50`. Entram no resumo, nunca na lista de
  compras.
- São **dois portadores**, e por decisão do dono isso **não** aparece no
  relatório.

## Comportamento

### 1. Onde entra

Dentro da aba **Conciliação**, no mês já enviado. A fatura é enviada **à parte
dos quatro arquivos**, em outro momento: reenviar o mês (porque o BPO corrigiu
alguma coisa) **não apaga a fatura**, e enviar a fatura não exige reenviar o mês.

É opcional: um mês sem fatura funciona exatamente como funciona hoje.

### 2. Qual fatura

A do mês em que a fatura **foi paga**, não a do mês em que ela fechou. Em
setembro saiu R$ 20.000,00 do caixa; a fatura a enviar é a que tem esse total.

Ao enviar, o sistema compara o total da fatura com o valor lançado pelo BPO na
categoria "Cartão de Crédito" daquele mês. **Diferente não bloqueia — avisa**,
mostrando os dois números. Em setembro eles batem exatamente; mas um estorno de
anuidade (os R$ 21,50 desta fatura) pode fazer o pago diferir do total, e
recusar por causa disso seria errado.

### 3. A leitura

Determinística, sem IA. Devolve os lançamentos de compra e os totais declarados
pela própria fatura.

**A soma dos lançamentos tem que bater com o `DESPESAS/DÉBITOS`.** Se não bater,
a tela diz o resíduo e **a fatura não é usada no Custos** — uma abertura
incompleta é pior que nenhuma, porque faria uma categoria parecer menor do que é.
É a mesma regra da prova de saldo dos extratos.

### 4. O enquadramento

Cada compra recebe uma categoria. **As categorias são as mesmas que o BPO já
usa** (Custo serviço prestado, Serviços contratados, Material de expediente,
Telefone e Internet, Máquinas e Equipamentos, Manutenção e Reforma, Taxas e
contribuições, Despesas financeiras…), senão o comparativo mês a mês não
conversaria consigo mesmo. Mais uma categoria nova: **"Cartão de crédito (não
identificado)"**.

A ordem de decisão, da mais confiável para a menos:

1. **O que o dono já corrigiu antes.** Um estabelecimento que ele já classificou
   uma vez vai para a mesma categoria, sem perguntar e sem IA.
2. **A IA**, para o que sobrou. Ela recebe o nome do estabelecimento e a lista de
   categorias, e devolve uma categoria ou "não sei".
3. **"Cartão de crédito (não identificado)"** para o que a IA não souber.

Na tela, cada compra mostra a categoria com um seletor ao lado. Trocar a
categoria **grava a escolha para aquele estabelecimento** — no mês seguinte,
"MP*APIONEIRA" já vai sozinho para onde ele mandou. Sem essa memória, ele
recategoriza as mesmas 60 compras todo mês e abandona a aba em dois meses.

A tela mostra quanto da fatura foi identificado ("R$ 23.100 de R$ 25.302, 91%"),
para ele saber se vale a pena mexer.

### 5. O efeito no Custos

Quando o mês tem fatura lida e fechada, **a linha "Cartão de Crédito" some do
Custos e é substituída** pelas categorias das compras.

**O total de despesas do mês não pode mudar** — é o mesmo dinheiro,
redistribuído. Mas a soma das compras **não** é igual ao valor pago, e as duas
faturas reais mostram por quê: a de set/2026 tem R$ 20.020,00 de compras e
`SALDO TOTAL` de R$ 20.000,00, que é o que o BPO lançou e o que saiu do banco.
A diferença de R$ 21,50 é um estorno de anuidade que só aparece como crédito na
fatura seguinte.

Então a substituição usa **o valor que o BPO lançou** como total, e a diferença
entre ele e a soma das compras entra como uma linha explícita — *"Cartão —
créditos e ajustes"*, de R$ −21,50 em setembro. Assim as compras vão para as
categorias certas, a diferença fica visível em vez de ser diluída, e o total do
mês continua idêntico. **Essa invariante precisa de teste**: se o total mudar,
alguma compra entrou duas vezes ou sumiu.

No detalhe de uma categoria, as compras do cartão aparecem junto dos
fornecedores do BPO, identificadas como vindas do cartão.

### 6. O que não muda

- A conciliação bancária não é tocada: a fatura não é extrato, e o pagamento
  dela continua sendo um único débito no banco, como já é hoje.
- Sem fatura no mês, tudo funciona como hoje.
- A separação por portador existe no arquivo e é descartada.

### Fora do escopo

- Conciliar a fatura contra o extrato (o pagamento já concilia hoje, como um
  débito só).
- Mais de uma fatura por mês. **É um cartão só** — se um dia houver outro, é
  outra conversa.
- Parcelamento como compromisso futuro ("faltam 3 de 5"). A visão é de caixa:
  a parcela do mês é o custo do mês.
- Converter moeda. O valor em reais já vem na fatura.
- Editar o valor ou a descrição de uma compra. Só a categoria é editável.
- Aprender categoria a partir da descrição livre (só do estabelecimento).

## Arquitetura

### Leitura — puro e testável

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/fatura/pdf-posicional.ts` | **Novo.** PDF → linhas reconstruídas por posição, com o des-espaçamento. É o único que fala com o pdf.js. |
| `src/lib/fatura/ler-fatura.ts` | **Novo.** Linhas → `FaturaLida`. Puro. |
| `src/lib/fatura/enquadrar.ts` | **Novo.** Decide a categoria de cada compra a partir da memória e do que a IA devolveu. Puro — a IA é chamada fora. |

```typescript
export interface CompraCartao {
  data: string           // AAAA-MM-DD, ano deduzido da referência
  estabelecimento: string
  parcela: string | null // "2/5"
  centavos: number       // sempre positivo: é despesa
  internacional: boolean
}

export interface FaturaLida {
  referencia: string     // AAAA-MM da fatura
  totalFatura: number    // SALDO TOTAL, centavos
  despesasDeclaradas: number // DESPESAS/DÉBITOS, centavos
  faturaAnterior: number
  compras: CompraCartao[]
  /** `soma(compras) - despesasDeclaradas`. Zero = a leitura fecha. */
  residuo: number
}
```

### IA

Uma chamada por envio, com a lista de estabelecimentos ainda não conhecidos e a
lista de categorias, pedindo uma categoria ou `null` para cada. Usa o cliente
Anthropic que o projeto já tem (`scan-nf` é o modelo). É a 5ª função de IA do
sistema e divide o mesmo saldo das outras.

Falha ou resposta fora do formato **não derruba o envio**: tudo que não foi
enquadrado cai em "não identificado", e a tela diz que a sugestão automática
falhou.

### Banco

```sql
CREATE TABLE IF NOT EXISTS fatura_cartao (
  id SERIAL PRIMARY KEY,
  mes DATE NOT NULL UNIQUE,         -- mês do pagamento, dia 1
  referencia DATE NOT NULL,         -- referência impressa na fatura
  total_centavos BIGINT NOT NULL,
  despesas_centavos BIGINT NOT NULL,
  residuo_centavos BIGINT NOT NULL,
  s3_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fatura_compra (
  id SERIAL PRIMARY KEY,
  fatura_id INTEGER NOT NULL REFERENCES fatura_cartao(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  estabelecimento TEXT NOT NULL,
  estabelecimento_chave TEXT NOT NULL,
  parcela TEXT,
  valor_centavos BIGINT NOT NULL,
  internacional BOOLEAN NOT NULL DEFAULT FALSE,
  categoria TEXT NOT NULL,
  origem_categoria TEXT NOT NULL CHECK (origem_categoria IN ('memoria','ia','manual','nao_identificado'))
);

CREATE TABLE IF NOT EXISTS fatura_categoria_memoria (
  estabelecimento_chave TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  definido_por TEXT,
  definido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`fatura_cartao` **não** tem FK para `conciliacao_meses`: é por isso que reenviar
o mês não apaga a fatura. A ligação é pelo campo `mes`.

`estabelecimento_chave` é o nome normalizado (minúscula, sem acento, pontuação
virando espaço), como já se faz no estoque — senão `MP*APIONEIRA` e
`MP* APIONEIRA` seriam dois estabelecimentos.

### API

- `POST /api/conciliacao/[mes]/fatura` — envia e lê a fatura. Exige
  `canConciliacaoSession()`.
- `PATCH /api/conciliacao/[mes]/fatura/[compraId]` — troca a categoria de uma
  compra e grava a memória do estabelecimento.
- `DELETE /api/conciliacao/[mes]/fatura` — remove a fatura do mês (volta a linha
  "Cartão de Crédito"). Existe porque enviar a fatura errada é fácil.

### Interface

`ConciliacaoClient.tsx` ganha o envio da fatura e, na aba Custos, a lista de
compras com o seletor de categoria. A substituição da linha acontece na
montagem do comparativo, no servidor — a tela não recalcula dinheiro.

### Testes

- **Puros, com fixtures anonimizadas** (mesma estrutura e mesmas quebras da
  fatura real, nomes e valores inventados): compra simples; parcelada;
  internacional nas três linhas; IOF; linha negativa de pagamento e de
  bonificação, que não podem virar compra; `16/dez` numa fatura `out/2026`
  virando 2025; a soma fechando; e a soma **não** fechando, com o resíduo certo.
- **Enquadramento**: memória vence a IA; IA preenche o resto; o que ninguém sabe
  vira "não identificado"; IA indisponível não quebra nada.
- **Substituição no Custos**: a invariante de que o total de despesas do mês não
  muda ao abrir a fatura.
- **Componente**: trocar a categoria de uma compra; a porcentagem identificada;
  o aviso de resíduo; mês sem fatura.

## Riscos

1. **Mudança de layout da fatura pela Unicred.** O leitor quebra, e a prova de
   soma faz isso aparecer como resíduo — ruidoso, não silencioso. É a razão de a
   prova existir.
2. **A IA erra categoria.** Por isso ela nunca é a última palavra: a memória do
   dono vence, e toda sugestão é visível e editável. O erro custa um clique e
   não se repete.
3. **Mais dado financeiro no sistema** — agora o detalhe de cada compra. Mesma
   permissão de duas pessoas, mesmo cuidado dos extratos.
