# Intervalo entre sessões de estética

**Data:** 27/10/2026

**Pedido do dono:** "Nessa parte para lançar os procedimentos estéticos, só tem opção por semana da sessão, mas a depilação a laser por exemplo é 1x por mês, pode ser que tenha outros aparelhos futuros que vai ser a cada 60 dias 1 sessão."

---

## 1. O que existe

`aesthetic_sessions.sessions_per_week INTEGER NOT NULL DEFAULT 1`, e a data final sai de `semanas = ceil(total ÷ sessões por semana)`, `fim = início + semanas×7 − 1 dia`. A semana está embutida na conta, então cadência mensal não tem como ser escrita, e a cada 60 dias muito menos.

Na produção: **26** procedimentos com 1 por semana, **5** com 2, **1** com 4, **1** com 6.

---

## 2. Decisões do dono

1. O campo passa a ser **"a cada [N] [dias / semanas / meses]"**.
2. **Nada do que já está gravado muda.** Os 7 procedimentos com 2, 4 ou 6 sessões por semana continuam exibindo `2×/semana` como hoje; só os novos usam o formato novo.

---

## 3. Como fica

**No formulário**, o campo "Sessões por semana" vira "A cada", com um número e uma unidade. Padrão: **1 semana**, que é o que 26 dos 33 procedimentos usam hoje — quem só faz semanal não muda nada na rotina.

**Na lista**, cada procedimento mostra a sua cadência em português: `a cada 1 mês`, `a cada 60 dias`, `a cada 2 semanas`. Procedimento gravado antes desta mudança continua mostrando `2×/semana`, porque é o único dado que ele tem.

**A data final deixa de ser só leitura e passa a ser editável** (pedido do dono). Ela é **pré-preenchida** pela frequência e continua se atualizando sozinha enquanto ninguém a toca. **A partir do momento em que o dono digita uma data, ela é dele**: mudar a quantidade de sessões ou o intervalo não sobrescreve mais o que ele escreveu — perder a data digitada por causa de um ajuste em outro campo seria o pior comportamento possível aqui. Ao lado do campo fica um **"recalcular"**, que devolve o valor automático quando ele quiser voltar atrás.

O valor pré-preenchido passa a ser **o dia da última sessão**: `início + (total − 1) × intervalo`. Hoje ele é o fim do último bloco de semana (10 sessões semanais a partir de 27/10 dão 04/01/2027, que é um domingo em que nada acontece); com a conta nova dá 29/12/2026, que é o dia da décima sessão. **Isto muda o número que aparece para procedimentos novos** — é mais honesto, e foi decidido junto com o campo.

Mês é somado como **mês de calendário**, não como 30 dias: 31/01 + 1 mês é 28/02, não 03/03. Somar 30 dias faria a data escorregar ao longo do ano.

---

## 4. Onde fica guardado

Duas colunas novas, **anuláveis**, em `aesthetic_sessions`:

```sql
ALTER TABLE aesthetic_sessions ADD COLUMN IF NOT EXISTS intervalo_valor INTEGER;
ALTER TABLE aesthetic_sessions ADD COLUMN IF NOT EXISTS intervalo_unidade TEXT;
```

Anuláveis de propósito: **nulo quer dizer "procedimento antigo, leia `sessions_per_week`"**. É isso que cumpre a decisão 2 sem reescrever dado que ninguém conferiu.

`sessions_per_week` continua existindo e continua `NOT NULL`. Procedimento novo grava `1` ali, valor que é ignorado quando o intervalo está preenchido. Alterar a coluna para anulável mexeria numa tabela em uso para ganhar nada.

---

## 5. O que não entra

- Nenhuma reescrita dos 33 registros existentes.
- Nenhuma mudança na data final já gravada de procedimento antigo.
- Nenhuma agenda ou lembrete por sessão: a data final continua sendo uma estimativa exibida, não um compromisso marcado.
- Nenhuma mudança no relatório de Estética (ele não usa cadência).

---

## 6. Testes

Puros (projeto `lib`):

1. `a cada 1 semana`, 10 sessões, início 27/10/2026 → última em 29/12/2026.
2. `a cada 1 mês`, 6 sessões, início 31/01/2026 → soma de mês de calendário, com o dia encolhido em fevereiro.
3. `a cada 60 dias`, 3 sessões → início + 120 dias.
4. 1 sessão só → a data final é o próprio início.
5. O texto sai em português correto no singular e no plural (`a cada 1 mês`, `a cada 2 meses`).
6. Procedimento sem intervalo gravado cai no texto antigo (`2×/semana`); com intervalo, usa o novo.
