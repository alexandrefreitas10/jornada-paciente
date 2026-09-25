# Estoque › Preços — juntar repetição e nome variante

**Data:** 2026-09-25
**Status:** aguardando revisão do dono

## Problema

A aba Preços subiu em 24/09 e o dono lançou 106 compras a partir de notas
fiscais antigas de seis laboratórios. Duas coisas apareceram no uso real:

1. **A mesma nota traz o mesmo ativo em várias linhas**, com o mesmo preço
   unitário, porque a nota quebra a quantidade em lotes. O histórico mostra as
   três linhas. Com o tempo isso enche a tela de repetição sem informação.
   Levantamento em produção: 16 grupos repetidos, dois deles com 4 linhas
   (`UNDECANOATO 1G/4ML`, 5+5+5+5).

2. **O mesmo ativo vem escrito diferente de uma nota para a outra** e vira duas
   linhas. O caso citado pelo dono: `Testosterona 300 MG - Pellet` da Biós; se a
   próxima nota vier `Testosterona 300mg`, hoje ela abriria uma linha nova.

Há ainda uma consequência do item 1 que não é cosmética: **todos os cards estão
marcando 0,0%**. A "compra anterior" que a variação compara é a linha repetida
da própria nota, com o mesmo preço. A aba existe para achar o que subiu e hoje
não consegue achar nada.

## Contexto do código hoje

- `chaveProduto`/`chaveLaboratorio` (`src/lib/precos.ts`) usam `normalizarNome`
  de `src/lib/stock-actives.ts`: minúscula, sem acento, pontuação virando
  espaço. Isso já junta `Coenzima Q10 100mg 1ml` com `COENZIMA Q10 100MG/1ML`.
- As chaves são **gravadas** no INSERT (`stock_purchases.product_key`,
  `laboratory_key`) e `listarPrecos()` agrupa por elas.
- Os 81 nomes distintos em produção já viram 72 grupos. Nenhum par de grupos
  atuais é o mesmo ativo — o problema do nome variante é **preventivo**.
- Não existe caso de mesmo produto+laboratório+data com **preços diferentes**
  (conferido: 0), nem conflito de unidade no mesmo par (conferido: 0).
- Editar ou apagar um preço continua fora do escopo: a correção é lançar a
  compra certa.

## Comportamento

### 1. Lançamentos repetidos viram uma linha

No histórico de um par produto+laboratório, lançamentos com **a mesma data e o
mesmo valor unitário** aparecem como uma linha só, com a **quantidade somada**.

```
antes                              depois
R$ 5,83   20 un  23/04/2026        R$ 5,83   90 un  23/04/2026
R$ 5,83   30 un  23/04/2026
R$ 5,83   40 un  23/04/2026
```

- **Mesma data e preços diferentes continuam linhas separadas.** Preço
  diferente é informação, não repetição.
- **Unidade entra na comparação**: só se juntam lançamentos com a mesma unidade
  (`normalizarNome` dos dois lados, tolerando plural, como já faz `unidadeMudou`).
  Quantidade em frascos e quantidade em caixas não podem ser somadas.
- **Fonte**: se todos os lançamentos juntados vieram da mesma fonte, mostra o
  rótulo dela ("nota antiga", "nota fiscal", "lançamento manual"); se forem
  diferentes, mostra "vários lançamentos".
- O contador do botão passa a contar linhas já juntadas: `▼ Ver histórico (1)`
  no exemplo acima, não `(3)`.

A junção vale também para a **variação**: "a compra anterior" passa a ser a
compra anterior de verdade. Os 15 grupos repetidos de hoje passam a mostrar
"primeira compra" em vez de "0,0%".

### 2. O mesmo ativo cai no mesmo grupo mesmo com o nome escrito diferente

A chave de agrupamento do produto passa a ignorar, além do que já ignora:

| Ignora | Exemplo |
|---|---|
| espaço entre número e unidade | `300 mg` = `300mg` |
| palavra de forma farmacêutica | `pellet`, `pellets`, `implante`, `frasco`, `ampola`, `comprimido`, `capsula`, `seringa`, `sache`, `pote` |
| palavra de ligação | `Pool **de** Aminoácidos` = `Pool Aminoácidos` (`de`, `da`, `do`, `dos`, `das`) |

**Dose e volume continuam separando** — decisão do dono. Consequências
pretendidas, conferidas contra os dados reais:

| Par | Resultado |
|---|---|
| `Testosterona 300 MG - Pellet` (Biós) × `Testosterona 300mg` (Biós) | **junta** |
| `Testosterona 200 mg` × `Testosterona 300 mg` (Bio Meds) | separado (dose) |
| `D-RIBOSE 500MG 2ML` × `D-RIBOSE 500MG/3ML` (Victalab) | separado (volume) |
| `COMPLEXO B (COM B1)` × `COMPLEXO B (SEM B1)` | separado (produtos diferentes) |
| `POOL AMINOACIDOS 3,8% - 10ML` × `POOL DE AMINOACIDOS 5ML` | separado (volume) |
| `Testosterona 300 mg` (Bio Meds) × `Testosterona 300 MG - Pellet` (Biós) | separado (laboratório) |

O laboratório continua com a normalização atual: ela já junta
`Bio Meds Pharmaceutica Ltda` com `Bio Meds Pharmaceutica Ltda.`

### 3. O agrupamento passa a ser calculado na leitura

Hoje a chave gravada no lançamento decide o grupo, então uma regra nova só
valeria para notas futuras e as 106 compras já lançadas continuariam
espalhadas. Passando o agrupamento para a leitura, **os dados de hoje se
reorganizam sozinhos** e um ajuste futuro da regra também vale para trás, sem
migração.

As colunas `product_key` e `laboratory_key` continuam sendo gravadas e
indexadas — o que muda é quem manda no agrupamento da aba.

### 4. Qual nome aparece no título

O do lançamento mais recente do grupo, regra que já existe. Se a próxima nota
da Biós vier `Testosterona 300mg`, o título passa a ser esse e o histórico
mostra as compras do Pellet embaixo.

### 5. Nada é apagado

A junção acontece só na exibição. As 106 linhas continuam no banco exatamente
como estão. Se alguma regra se mostrar errada, volta atrás sem perda de dado.

### Limite conhecido, aceito pelo dono

Abreviação e nome de fantasia **não** juntam: `HIDROXIMETILBUTIRATO 150MG-2ML`
com um futuro `HMB 150mg 2ml`, ou `Booster Mitocondrial (Redução Gordu)`.
Nenhuma regra de texto sabe que são a mesma coisa. Se isso incomodar na
prática, o caminho é o "juntar na mão" (uma linha escolhida pelo dono, gravada
para sempre), que ele deixou fora deste escopo.

### Fora do escopo

- Juntar duas linhas manualmente.
- Pedir para a IA casar o nome com os produtos já conhecidos do laboratório.
- Editar ou apagar um preço já registrado.
- Mexer no que já está gravado em `stock_purchases`.

## Arquitetura

### Regras puras — `src/lib/precos.ts`

Tudo novo é função pura, testável sem banco e sem React.

- `chaveProduto(nome)` — passa a aplicar, depois de `normalizarNome`: colar
  número + unidade, remover palavra de forma, remover palavra de ligação.
  A lista de palavras fica em constantes exportadas, para o teste conferir a
  lista e não a implementação.
- `chaveUnidade(unidade)` — já existe como helper privado de `resumirGrupo`
  (normaliza e tolera plural); passa a ser exportado para a junção usar a mesma
  regra.
- `juntarRepetidos(historico: Compra[]): CompraAgrupada[]` — junta por
  `data + centavos + chaveUnidade(unidade)`, somando `quantidade`. Devolve a
  fonte quando é única e `null` quando são várias. Ordena do mais recente para
  o mais antigo.
- `resumirGrupo` passa a resumir **sobre o histórico já juntado**, de forma que
  `anterior` seja a compra anterior de verdade.

```typescript
export interface CompraAgrupada {
  centavos: number
  quantidade: number      // somada
  unidade: string | null
  data: string            // AAAA-MM-DD
  fonte: Fonte | null     // null = veio de fontes diferentes
  lancamentos: number     // quantas linhas do banco entraram aqui
}
```

`GrupoPreco` não muda de forma: quem monta o grupo continua entregando
`historico: Compra[]`, e a junção é aplicada por quem exibe e por
`resumirGrupo`.

### Servidor — `src/lib/precos-db.ts`

`listarPrecos()` deixa de agrupar por `product_key || laboratory_key` do banco
e passa a agrupar por `chaveProduto(product_name) || chaveLaboratorio(laboratory)`,
calculados na leitura. A consulta SQL não muda (`ORDER BY purchased_at DESC, id DESC`).

`registrarCompra` continua gravando `product_key`/`laboratory_key` como hoje.

### Interface — `src/app/estoque/PrecosTab.tsx`

- O histórico expandido renderiza `juntarRepetidos(g.historico)`.
- O contador do botão mostra o número de linhas **depois** da junção.
- A fonte mostra "vários lançamentos" quando `fonte === null`.
- O resto da aba não muda.

### Testes

- **Puros** (`__tests__/lib/precos.test.ts`): cada linha da tabela de
  consequências da seção 2, com os nomes reais; `juntarRepetidos` com o caso
  das três linhas de 20/30/40, com preço diferente na mesma data, com unidade
  diferente na mesma data, e com fontes misturadas; `resumirGrupo` mostrando
  "primeira compra" quando o histórico inteiro é uma nota repetida, e achando a
  compra anterior certa quando existe uma nota mais antiga.
- **Componente** (`__tests__/components/PrecosTab.test.tsx`): o card mostra a
  linha somada com a quantidade total, o contador do botão, e "vários
  lançamentos".
- **Banco e rotas:** sem harness no projeto. A conferência é um script de
  leitura contra produção comparando o número de grupos e de linhas de
  histórico antes e depois — nenhuma escrita.
