# Relatórios › Estética, por procedimento

**Data:** 23/10/2026

**Pedido do dono:** "Quero criar uma aba para os pacientes que estão com sessões na estética... eu entro em relatórios, clico na parte da estética e aí eu teria sub-abas com os procedimentos (t-sculptor, depilação a laser, criolipólise, etc) e nessa aba apareceria todos os nomes dos pacientes que têm sessões em aberto e os que já finalizaram. Se um dia ela criar um procedimento novo dentro do card na aba estética do paciente, esse procedimento já iria para a aba relatórios também."

---

## 1. O que existe, medido na produção

A aba Estética do card grava em `aesthetic_sessions`: `patient_id`, `procedure_name` (**texto livre, digitado**), `total_sessions`, `start_date`, `region`. Cada sessão realizada vira uma linha em `aesthetic_session_completions` (`session_number`, `completed_at`).

Hoje: **31 procedimentos de 22 pacientes, 100 sessões realizadas**.

O campo ser digitado à mão tem consequência direta no pedido: são **15 grafias distintas** para cerca de 9 procedimentos.

| Grafias gravadas | Sessões |
|---|---|
| `Blindagem Capilar`, `Blindagem Capilar `, `Blindagem capilar ` | 9 + 2 + 1 |
| `T-SCULPTOR`, `T-sculptor`, `T- SCULPTOR`, `T-SCULPTOR ` | 6 + 1 + 1 + 1 |
| `Fortalize`, `Fortalize ` | 2 + 2 |
| `Criolipolise `, `Criolipólise de Placas`, `Criolipolise Dinâmica ` | 1 + 1 + 1 |
| `Protocolo Blindagem `, `Radiofrequência `, `DEPILAÇÃO A LASER` | 1 cada |

Sem agrupar, a aba Estética nasceria com quatro sub-abas de T-Sculptor.

---

## 2. Decisões do dono

1. **Agrupar pela mesma regra que já vale nos implantes e nas pastas de foto:** nome idêntico ignorando maiúscula, acento e espaço = mesmo procedimento. Palavras diferentes continuam separadas.
2. **As três criolipólises são procedimentos diferentes de verdade** (confirmado por ele), e a regra acima já as mantém separadas — não há agrupamento manual nesta entrega.
3. Resolver na raiz (escolher o procedimento de uma lista em vez de digitar) fica para **outra conversa**.

---

## 3. A chave do procedimento

Normalização: tira acento, passa a minúsculo e **descarta tudo que não é letra ou número**.

`T- SCULPTOR` → `tsculptor`; `T-SCULPTOR ` → `tsculptor`; `T-sculptor` → `tsculptor`.

**Por que não reusar `chaveNome` de `implantes.ts`,** que o resto do sistema usa para "é a mesma pessoa?": ela preserva a pontuação e só colapsa espaço. Com ela, `T- SCULPTOR` e `T-SCULPTOR` viram chaves diferentes — exatamente o caso real que esta tela precisa juntar. Nome de pessoa e nome de procedimento são problemas diferentes: em pessoa, a pontuação quase nunca varia e um hífen pode distinguir sobrenomes; em procedimento digitado às pressas entre atendimentos, a pontuação é ruído.

Aplicada aos 15 nomes de hoje, a regra produz **9 procedimentos**.

**Nome exibido:** a grafia **mais frequente** entre as variantes do grupo (empate: a primeira em ordem alfabética). Então aparece `T-SCULPTOR`, que é como está em 6 dos 9 registros. O sistema não inventa uma grafia que ninguém digitou.

---

## 4. A tela

Aba **"✨ Estética"** na barra do Relatórios.

**Sub-abas = os procedimentos**, derivadas dos dados a cada carregamento — nada fixo no código. Procedimento novo digitado no card aparece aqui sozinho, que é o pedido. Ordem **alfabética** pelo nome exibido (ordem estável: por volume, as abas mudariam de lugar conforme o movimento). Cada rótulo leva a contagem de pacientes: `T-SCULPTOR (5)`.

**Dentro do procedimento, dois blocos:**

- **Em aberto** — ainda há sessão a fazer.
- **Finalizados** — todas as sessões feitas.

Cada linha: nome do paciente (link para o card, como no "Em tratamento"), progresso `3 de 6`, data de início e data da última sessão realizada (ou "nenhuma ainda").

Dentro de cada bloco, os pacientes vêm em ordem alfabética.

**Vazio:** sem nenhum procedimento cadastrado, a aba diz isso em vez de mostrar sub-abas vazias.

---

## 5. O que é "finalizado"

Sessões realizadas **≥** total contratado. Não existe no sistema um botão de encerrar um procedimento, então quem decide é a contagem.

**Consequência conhecida, registrada de propósito:** se a Fran interrompe um protocolo no meio e o considera encerrado, ele aparece como "em aberto" para sempre. Isso foi dito ao dono. Resolver exige um estado de "encerrado" na tabela e um botão no card — fora desta entrega.

Um procedimento com `total_sessions` zerado ou ausente conta como em aberto (não se finaliza o que não tem meta), e nunca divide por zero na barra de progresso.

---

## 6. Onde o código fica

Espelha o "Em tratamento", que é a aba irmã:

| Arquivo | Papel |
|---|---|
| `src/lib/estetica-relatorio.ts` | **puro**: chave, agrupamento, nome exibido, aberto × finalizado |
| `src/lib/estetica-relatorio-db.ts` | a consulta |
| `src/app/api/reports/estetica/route.ts` | GET com sessão de equipe |
| `src/app/relatorios/Estetica.tsx` | a aba e as sub-abas |
| `src/app/relatorios/RelatoriosClient.tsx` | registra a aba |

A consulta traz as sessões com o nome do paciente e a contagem de realizadas, numa ida só ao banco — agrupar por procedimento é trabalho da função pura, não do SQL, porque é ali que a regra pode ser testada sem banco.

---

## 7. Observação fora do escopo

A página de Relatórios diz "Área restrita ao administrador", mas **não verifica nada**: não há checagem de admin em `src/app/relatorios/page.tsx`, e o link aparece no menu para toda a equipe. A aba nova não acrescenta exposição (é a mesma base de pacientes das outras abas), mas a frase não corresponde ao que o sistema faz. Fica registrado; corrigir é decisão do dono.

---

## 8. O que não entra

- Nenhum botão de encerrar procedimento (§5).
- Nenhuma mudança na aba Estética do card.
- Nenhum agrupamento manual de grafias diferentes (§2).
- Nenhuma lista fechada de procedimentos (§2, decisão 3).
- Nada de dinheiro: a aba mostra sessões, não valores.

---

## 9. Testes

Puros (projeto `lib`), com nomes de procedimento reais — eles não são dado de paciente — e **nomes de paciente inventados**:

1. A chave junta as variantes que hoje existem (`T-SCULPTOR`, `T-sculptor`, `T- SCULPTOR`, `T-SCULPTOR `) e **não** junta `Criolipólise de Placas` com `Criolipolise Dinâmica`.
2. O nome exibido é a grafia mais frequente; no empate, a primeira em ordem alfabética.
3. Os 15 nomes reais de hoje produzem 9 procedimentos.
4. Aberto × finalizado: `3 de 6` é aberto; `6 de 6` é finalizado; `7 de 6` (sessão a mais registrada) é finalizado; total ausente ou zero é aberto.
5. As sub-abas saem em ordem alfabética e os pacientes dentro de cada bloco também.

As 4 suítes que já falhavam antes desta branch continuam falhando e não são escopo.
