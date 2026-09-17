# Relatórios › Em tratamento

**Data:** 2026-09-17
**Status:** aguardando revisão do dono

## Problema

A clínica quer um contato semanal com cada paciente em tratamento. Hoje não há
como saber, de forma rápida, quem está em tratamento nem quem faltou na semana.
A mensagem semanal tem dois modelos: um para quem veio ("como você passou após
as aplicações?") e outro para quem não veio ("é importante manter as aplicações
semanais").

## O que os dados mostram (17/09/2026)

- De 84 pacientes com saída nas últimas 8 semanas, só 1 veio nas 8. A maioria
  veio em 1 a 4 delas. Por semana vêm de 33 a 41 pacientes.
- A folha de prescrição da aba Evolução (`patient_files.file_type = 'prescription'`)
  só é enviada quando o paciente **termina** a prescrição (confirmado pelo dono).
  A foto semanal da tabela da Tirzepatida é outro tipo de arquivo e não conta.
- Vários pacientes voltaram a receber aplicação depois da folha finalizada
  (paciente 65: 25 aplicações depois) — é um novo ciclo.
- Só 3 dos 83 pacientes em tratamento têm telefone no cadastro. Por isso o envio
  é por cópia da mensagem, não por link de WhatsApp.

Com as regras abaixo, hoje seriam 74 pacientes em tratamento: 39 verdes,
20 amarelos e 15 vermelhos.

## Regras

### Quem está em tratamento

Um paciente está em tratamento quando:

1. tem ao menos uma **saída de estoque** vinculada a ele (`stock_movements.type = 'saida'`
   com `patient_id`), e
2. a **última saída é mais recente que a última folha de prescrição finalizada**
   da aba Evolução — ou ele nunca teve folha.

Consequências:

- Entra sozinho na primeira aplicação.
- Sai quando o Carlos envia a folha finalizada depois da última aplicação.
- Volta sozinho se receber nova aplicação depois da folha.

Ficam de fora:

- saídas de **implante** — observação `Implante hormonal` (gravada pela tela de
  Implantes) **ou** item cujo nome contém "implante" (cobre a saída lançada pela
  tela de estoque, que não grava essa observação). O implante é semestral e tem
  módulo próprio; sem essa exclusão, esses pacientes cairiam em "não veio" toda
  semana.
- pacientes **arquivados** ou **excluídos**.

### Situação de cada paciente (etiqueta)

A referência é **meia-noite de hoje (horário de Brasília)**, e "dias sem vir"
conta a partir da data da última aplicação.

| Etiqueta | Regra | Sub-aba |
|---|---|---|
| 🟢 **Verde — em dia** | última aplicação a partir da meia-noite de 7 dias atrás | Veio |
| 🟡 **Amarela — faltou** | última aplicação entre 8 e 28 dias atrás | Não veio |
| 🔴 **Vermelha — crítico** | última aplicação há mais de 28 dias | Não veio |

"Últimos 7 dias", e não "semana de segunda a domingo": numa quinta-feira a
janela começa na quinta anterior. Assim o resultado não depende do dia em que a
equipe manda as mensagens, e quem vem toda sexta continua verde na quinta.

## Tela

Nova aba **Em tratamento** em Relatórios (`/relatorios`), ao lado das atuais.
Acesso igual ao das outras abas: qualquer pessoa da equipe logada.

### Sub-abas

- **Todos** — os três grupos juntos, com a etiqueta de cada um.
- **Não veio** — amarelos e vermelhos.
- **Veio** — verdes.

Cada sub-aba mostra a quantidade no rótulo, por exemplo `Não veio (35)`.

### Ordem

- **Não veio** e **Todos**: por urgência — quem está há mais dias sem vir
  primeiro. Os vermelhos ficam no topo.
- **Veio**: por nome.

### Cada paciente mostra

- nome (link para o card do paciente);
- etiqueta colorida;
- data da última aplicação e, se não veio, "há N dias sem vir";
- a mensagem pronta, já com o primeiro nome do paciente;
- botão **Copiar mensagem**;
- botão **Marcar como enviada** / estado "✓ Enviada por Fulano, qua 17/09 14:32",
  com opção de desfazer.

No topo de cada sub-aba, um contador: **"12 de 39 mensagens enviadas nesta semana"**.

### Mensagens

O primeiro nome vem do cadastro, com a caixa ajustada ("ANA CAROLINE" → "Ana").

**Verde (veio):**
> Oi, {nome}! Tudo bem? 😊 Como você passou depois das suas aplicações? Está se sentindo bem? Qualquer dúvida, estamos por aqui.

**Amarela (faltou):**
> Oi, {nome}! Tudo bem? Percebemos que você não veio nesta semana. É muito importante manter suas aplicações semanais para o tratamento continuar dando resultado. Podemos agendar seu próximo horário?

**Vermelha (crítico)** — *proposta, aguardando aprovação*:
> Oi, {nome}! Tudo bem? Sentimos sua falta — já faz algumas semanas que você não vem às suas aplicações. Para o tratamento dar resultado, é muito importante retomar. Podemos agendar seu horário para esta semana?

O texto amarelo fala em "nesta semana", o que soa estranho para quem sumiu há
dois meses; por isso o vermelho tem texto próprio.

Os textos ficam fixos no código. Mudar um texto é uma alteração simples, sem tela
de edição (fora do escopo, a pedido).

### "Mensagem enviada"

- Vale para a **semana de segunda a domingo** (horário de Brasília) em que foi
  marcada. Na segunda seguinte todos voltam a "não enviada".
- Registra quem marcou, quando e **qual modelo** foi enviado (verde, amarelo ou
  vermelho).
- Pode ser desfeita (marcou por engano).
- Se o paciente mudar de grupo durante a semana (faltou, recebeu mensagem,
  depois veio), a marcação continua valendo e mostra o modelo enviado.

## Arquitetura

### `src/lib/em-tratamento.ts` — regras puras (sem banco)

- `dataBrasilia(instante)`, `diasEntre(anterior, agora)` e
  `inicioDaSemanaBrasilia(agora)` (segunda-feira).
- `classificar(ultimaSaida, ultimaFolha, agora)` → `null` (fora do
  tratamento) ou `{ etiqueta: 'verde' | 'amarela' | 'vermelha', diasSemVir }`.
- `primeiroNome(nome)`.
- `mensagemPara(etiqueta, nome)`.
- `listarSubAba(lista, subAba)`.

Todos testados em `__tests__/lib/em-tratamento.test.ts`, incluindo as fronteiras
(exatamente 7, 8, 28 e 29 dias), a virada de dia em Brasília (meia-noite de
Brasília = 03h UTC), folha no mesmo dia da última aplicação (antes e depois
dela) e o paciente que voltou depois da folha.

### Banco

Tabela nova, criada de forma idempotente em `runMigrations()`:

```sql
CREATE TABLE IF NOT EXISTS treatment_messages (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,          -- segunda-feira, horário de Brasília
  template TEXT NOT NULL,            -- 'verde' | 'amarela' | 'vermelha'
  sent_by TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, week_start)
)
```

Nenhuma tabela existente muda.

### Consulta

Uma consulta por paciente com a última saída (excluindo implante hormonal), a
última folha finalizada e a marcação da semana atual. A classificação acontece
em `em-tratamento.ts`, não no SQL, para ser testável.

### API

- `GET /api/reports/em-tratamento` → lista classificada + marcações da semana.
- `POST /api/reports/em-tratamento/enviada` `{ patient_id, template }` → marca.
- `DELETE /api/reports/em-tratamento/enviada?patient_id=` → desfaz.

As três exigem sessão de equipe (o `proxy.ts` já barra quem não está logado) e
registram a marcação em `logAudit`.

### Interface

`src/app/relatorios/EmTratamento.tsx`, montado como nova aba em
`RelatoriosClient.tsx`.

## Fora do escopo

- Enviar a mensagem automaticamente pelo WhatsApp.
- Botão "abrir no WhatsApp" (telefones quase todos vazios).
- Tela para editar os textos.
- Histórico de semanas anteriores das marcações (os dados ficam guardados, mas
  não há tela para eles).
- Corrigir o aviso "Área restrita ao administrador" da página de Relatórios, que
  não corresponde ao menu (Relatórios aparece para toda a equipe).
