# Repor Estoque por ativo — Design Spec

## Objetivo

No relatório **Repor Estoque**, agrupar os lotes de um mesmo ativo numa linha só e
aplicar limite de **30 unidades** a uma lista de 20 ativos escolhidos pela clínica. O
resto do estoque continua com o limite atual de 5.

A aba **Estoque Atual não muda.** Os registros separados são lotes distintos e a clínica
precisa deles separados no dia a dia; o agrupamento existe só no relatório de reposição.

## O problema, medido

O estoque tem **136 registros** para bem menos ativos, porque cada lote entra como um
registro novo — comportamento desejado. Mas o relatório de reposição olha registro a
registro, e isso faz ele mentir:

```
  0 un  HMB
  0 un  HMB
 21 UN  HIDROXIMETILBUTIRATO 2,5% 2ML
```

Hoje o relatório pede reposição de HMB **duas vezes**, alegando estoque zero, com 21
unidades na prateleira. O mesmo acontece com Coenzima Q10 (5 registros, três zerados,
10 no total), Curcumina (4 registros, dois zerados, 21 no total) e Metilcobalamina
(2 registros, um zerado, 25 no total).

Some-se a isso o limite fixo de 5 unidades, baixo demais para os ativos de uso contínuo.

## Decisões tomadas e por quê

**Agrupar só no relatório.** Decisão explícita do dono: os registros separados são lotes
e precisam continuar separados no Estoque Atual. Unificar os registros no banco foi
avaliado e recusado — mexeria em dado histórico e quebraria o controle por lote.

**Lista de sinônimos no código.** Nome não basta para agrupar: `HMB` e
`HIDROXIMETILBUTIRATO` não têm uma letra em comum, nem `NAC` e `N-Acetilcisteína`.
Normalização automática (tirar mg, mL, %, pontuação) resolveria os casos fáceis e
falharia justamente nos que motivaram o pedido. As alternativas — campo "ativo" no
cadastro de cada item, ou uma tela de ativos editável — foram avaliadas e recusadas por
exigirem revisar 136 registros ou construir tela nova. Consequência aceita: **um lote com
grafia inédita não é agrupado até alguém acrescentar a grafia à lista.**

**Concentrações diferentes não se juntam automaticamente.** Decisão do dono, caso a caso:
`Vitamina C 440 mg` e `Vitamina C 20% (1 g/5 mL)` são ativos distintos; `Magnésio 400 mg`
e `Sulfato de Magnésio` também. Já `METILCOBALAMINA 2500MCG` e `Metilcobalamina 500 mcg`
são o mesmo ativo. Não existe regra geral — a lista de sinônimos é que decide.

## Os 20 ativos com limite de 30

Cada linha lista as grafias que existem hoje no estoque e contam como aquele ativo.

| Ativo | Grafias que contam |
|---|---|
| L-carnitina | `L-Carnitina` (3 registros) |
| Pool de Aminoácidos | `Pool de Aminoácidos`, `POOL DE AMINOACIDOS 5ML`, `Pool de Aminoácidos Essenciais` |
| Pool de Minerais | `Pool de Minerais`, `POOL MINERAIS 2ML` |
| HMB | `HMB` (2), `HIDROXIMETILBUTIRATO 2,5% 2ML` |
| Complexo B com B1 | `COMPLEXO B (COM B1) 1ML` |
| Complexo B sem B1 | `Complexo B sem B1` (3) |
| NAC | `NAC (N-acetilcisteína)`, `N-Acetilcisteína` |
| Vitamina C 440 mg | `Vitamina C 440 mg` |
| Vitamina C 20% | `Vitamina C 20% (1 g/5 mL)` |
| Magnésio 400 mg | `Magnésio 400 mg` |
| Sulfato de Magnésio | `Sulfato de Magnésio`, `Sulfato de Magnésio 10% (5 mL)` |
| Vitamina D 600 UI | `Vitamina D 600 UI` (2) |
| Vitamina D 600 UI + K2 | `Vitamina D 600 UI + K2` (2) |
| Vitamina D 600 ADEK | `Vitamina D 600 ADEK` |
| Coenzima Q10 | `Coenzima Q10` (3), `COENZIMA Q10 100MG/1ML` (2) |
| Curcumina | `Curcumina` (4) |
| Pill Food | `Pill food` (2) |
| Resveratrol | `Resveratrol 100 mg` |
| Pool Coenzimático | `Pool Coenzimático` (3) |
| L-baiba | `L-BAIBA 150MG 2ML`, `L-BAIBA 150MG - 2ML` |
| Pool Cognição | `POOL COGNICAO 2ML`, `POOL COGNICAO - 2ML` |
| Metilcobalamina | `METILCOBALAMINA 2500MCG/1ML`, `Metilcobalamina 500 mcg` |

São 22 linhas para os 20 itens pedidos, porque Vitamina C e Magnésio viraram dois ativos
cada por decisão do dono.

**`Vitamina D 300 UI` fica de fora** — não está na lista, e não é a mesma coisa que a
de 600 UI.

## Como o agrupamento decide

Cada ativo tem uma lista de padrões. Um registro pertence ao ativo cujo padrão casar com
o nome, comparado sobre o nome **normalizado**: minúsculas, sem acento, sem pontuação e
com espaços colapsados. Assim `POOL COGNICAO - 2ML` e `Pool Cognição 2ml` caem no mesmo
lugar sem precisar de duas entradas para cada variação de acento e hífen.

**Um registro pertence a no máximo um ativo.** A ordem de avaliação importa: os padrões
mais específicos são testados antes dos mais gerais, senão `Vitamina D 600 UI + K2` seria
capturado pelo padrão de `Vitamina D 600 UI`. Um teste garante essa precedência.

Registro que não casa com ativo nenhum entra no relatório sozinho, com o limite de 5 —
comportamento de hoje, preservado.

## O que o relatório passa a mostrar

Rodando a régua nova contra o estoque atual, **19 dos 22 ativos** entram na lista de
reposição:

L-carnitina (0) · Magnésio 400 mg (0) · Pool de Aminoácidos (2) · Sulfato de Magnésio (6) ·
Pill Food (7) · Resveratrol (7) · Pool Coenzimático (9) · Coenzima Q10 (10) ·
Vitamina C 440 mg (13) · Vitamina D ADEK (13) · L-baiba (13) · Pool de Minerais (14) ·
Vitamina C 20% (15) · Pool Cognição (16) · HMB (21) · Curcumina (21) ·
Complexo B sem B1 (25) · Metilcobalamina (25) · Complexo B com B1 (26)

Ficam de fora: NAC (43), Vitamina D 600 UI (35) e Vitamina D 600 UI + K2 (34).

O texto copiável do relatório passa a dizer o limite de cada linha, já que agora há dois
("abaixo de 30" e "abaixo de 5") — sem isso, o número solto não se explica.

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/stock-actives.ts` | **Novo.** Catálogo dos ativos, seus padrões e seu limite. Normalização e agrupamento. Puro, sem banco nem React — é o que os testes cobrem. |
| `src/app/estoque/RelatoriosTab.tsx` | Passa a agrupar antes de filtrar, e a exibir o limite de cada linha. |

`src/app/estoque/EstoqueClient.tsx` **não é tocado** — a aba Estoque Atual fica como está.

## Testes

Jest na lógica pura, como o resto do projeto (não há teste de banco nem de componente).

- normalização: `POOL COGNICAO - 2ML`, `Pool Cognição 2ml` e `pool cognicao 2 ml` colapsam no mesmo texto
- `HMB` e `HIDROXIMETILBUTIRATO 2,5% 2ML` caem no mesmo ativo
- **precedência:** `Vitamina D 600 UI + K2` vai para o ativo com K2, nunca para o de 600 UI puro
- `Vitamina C 440 mg` e `Vitamina C 20% (1 g/5 mL)` caem em ativos **diferentes**
- `Vitamina D 300 UI` não casa com nenhum ativo da lista
- soma: três registros de `L-Carnitina` com 0 viram uma linha com total 0
- item fora do catálogo mantém o limite de 5
- nenhum registro é contado em dois ativos ao mesmo tempo

## Fora de escopo

- **Unificar os registros no banco.** Avaliado e recusado: os lotes precisam continuar separados.
- **Mexer na aba Estoque Atual.** A régua de 5 por lote continua lá.
- **Tela para editar ativos e limites.** Se a lista passar a mudar com frequência, vale reabrir — hoje seria construir tela para um dado que muda raramente.
