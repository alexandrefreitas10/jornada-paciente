# Em tratamento: intervalo por paciente + "Aguardando nova prescrição"

**Data:** 2026-09-18
**Status:** aguardando revisão do dono

## Problema

1. A aba **Relatórios › Em tratamento** trata todo mundo como semanal: quem não
   aplicou em 7 dias vira 🟡 "Faltou". Mas, dos 52 pacientes com 4+ aplicações nos
   últimos 120 dias, só 26 são semanais — 10 aplicam a cada ~10 dias, 10 a cada
   ~14–15 e 6 a cada ~21. Metade dos regulares aparece como "faltou" sem ter
   faltado, e a equipe corre o risco de mandar a mensagem errada.
2. Quem teve a **folha de prescrição finalizada** enviada depois da última
   aplicação sai da aba (regra atual) e some de vista. Essas pessoas normalmente
   voltam para uma consulta e recebem nova prescrição — hoje são 39 — e a clínica
   quer acompanhá-las numa lista própria.

## Comportamento

### 1. Intervalo de aplicação por paciente (manual)

- Cada paciente tem um **intervalo de aplicação**: 7, 10, 14, 15, 21 ou 28 dias.
  Padrão **7** para todos (inclusive quem já existe).
- É ajustado **no card da aba Em tratamento**: "Aplicação a cada [7 dias ▾]". A
  mudança salva na hora, a etiqueta do card se recalcula e a troca vai para o log
  de auditoria. Falha ao salvar → aviso vermelho no card e o seletor volta ao valor
  anterior.
- O seletor aparece em todos os cards da aba, inclusive nos de "Aguardando" (o
  intervalo vale para o próximo ciclo).

### 2. Etiquetas pelo intervalo

`N` = intervalo do paciente; dias contados como hoje (calendário de Brasília,
desde a última aplicação):

| Etiqueta | Regra |
|---|---|
| 🟢 Em dia | até `N` dias |
| 🟡 Faltou | de `N + 1` até o limite crítico |
| 🔴 Crítico | acima do limite crítico |

**Limite crítico** = 28 dias; para intervalos de 15 dias ou mais, `2 × N`.

| N | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| 7 | até 7 | 8–28 | 29+ |
| 10 | até 10 | 11–28 | 29+ |
| 14 | até 14 | 15–28 | 29+ |
| 15 | até 15 | 16–30 | 31+ |
| 21 | até 21 | 22–42 | 43+ |
| 28 | até 28 | 29–56 | 57+ |

Com N = 7 o comportamento é idêntico ao de hoje.

- As sub-abas **Veio** (🟢) e **Não veio** (🟡 + 🔴) seguem a etiqueta, portanto o
  intervalo. **Todos** continua sendo quem está em tratamento (🟢 🟡 🔴).
- No card, junto da última aplicação: "a cada N dias".
- A legenda do topo passa a ser: "🟢 dentro do intervalo · 🟡 passou do intervalo ·
  🔴 mais de 28 dias (ou 2 intervalos, para quem aplica a cada 15+ dias) ·
  🔵 prescrição finalizada".

### 3. Sub-aba "Aguardando nova prescrição"

- **Quem entra:** paciente com aplicação registrada (mesmo filtro de hoje: sem
  implante, não arquivado, não excluído) cuja **última folha finalizada é
  posterior ou igual à última aplicação**. Ou seja: exatamente quem hoje sai da
  aba por ter finalizado.
- **Quarta sub-aba**: "Aguardando nova prescrição (N)". Não entra em "Todos".
- **Card:** etiqueta 🔵 **Aguardando**; "Prescrição finalizada em dd/mm · há N
  dias"; última aplicação; seletor de intervalo; mensagem pronta (recolhível, como
  as outras) com **Copiar** e **Marcar como enviada**; botão
  **📦 Mover para Pacientes Antigos** (mesmo fluxo de hoje, origem `em_tratamento`).
- **Ordem:** quem espera há mais tempo primeiro (folha mais antiga no topo).
- **Saída:** automática quando recebe nova aplicação (volta a 🟢 em Em tratamento)
  ou quando é movido para Pacientes Antigos. Sem prazo.
- **Mensagem** (texto aprovado pelo dono):

  > Oi, {nome}! Tudo bem? 😊 Sua prescrição chegou ao fim — parabéns por concluir
  > essa etapa! Para seguirmos com o seu acompanhamento, vamos agendar sua consulta
  > de reavaliação? Qual o melhor dia para você?

- "Marcar como enviada" funciona como nas outras sub-abas (vale para a semana
  seg–dom). O contador do topo ("X de Y mensagens enviadas nesta semana") conta a
  sub-aba aberta, como hoje.

### Fora do escopo

- Reescrever os textos 🟢/🟡 para intervalos não semanais ("acompanhamento
  semanal", "não veio nesta semana") — decisão do dono, depois.
- Calcular o intervalo automaticamente pelo histórico.
- Ajustar o intervalo em outras telas (card do paciente, cadastro).
- Frequência de envio da mensagem 🟢 por intervalo (hoje a marcação é semanal para
  todos).

## Arquitetura

### Regras puras — `src/lib/em-tratamento.ts`

- `ETIQUETAS` ganha `'aguardando'` (e `MENSAGENS.aguardando`).
- `INTERVALOS = [7, 10, 14, 15, 21, 28] as const`, `INTERVALO_PADRAO = 7`,
  `ehIntervaloValido(valor): valor is Intervalo`.
- `limiteCritico(intervalo)` → `intervalo >= 15 ? 2 * intervalo : 28`.
- `classificar(ultimaSaida, ultimaFolha, agora, intervalo = 7)` → `null` sem
  aplicação; senão `{ etiqueta, diasSemVir, diasAguardando }`:
  - folha ≥ última aplicação → `'aguardando'`, `diasAguardando` = dias desde a
    folha;
  - caso contrário 🟢/🟡/🔴 pelo intervalo, `diasAguardando = null`.
- `PacienteEmTratamento` ganha `intervalo: number`, `ultimaFolha: string | null`,
  `diasAguardando: number | null`.
- `SubAba` ganha `'aguardando'`; `listarSubAba`: `todos`/`nao_veio`/`veio`
  ignoram 🔵; `aguardando` só 🔵, ordenado por `diasAguardando` desc, depois nome.
- `DIAS_VERDE`/`DIAS_AMARELA` deixam de ser usados pela regra (a UI da legenda
  passa a descrever a regra por intervalo); removidos se nada mais os usar.

### Banco — `src/lib/db.ts` (`runMigrations`)

```sql
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS application_interval_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE treatment_messages DROP CONSTRAINT IF EXISTS treatment_messages_template_check;
ALTER TABLE treatment_messages ADD CONSTRAINT treatment_messages_template_check
  CHECK (template IN ('verde', 'amarela', 'vermelha', 'aguardando'));
```

O nome real da constraint de `template` em produção precisa ser confirmado (leitura
só) antes de escrever a migração. A validação do intervalo (lista fechada) fica na
API, não em CHECK, para mudar a lista sem migração.

### Consulta — `src/lib/em-tratamento-db.ts`

`listarEmTratamento` passa a trazer `p.application_interval_days` e a data da
última folha, e a incluir os 🔵 (hoje descartados porque `classificar` devolve
`null`). Nova `definirIntervalo(patientId, intervalo)` → `boolean` (falso se o
paciente não existe/excluído).

### API

- `PATCH /api/reports/em-tratamento/intervalo` `{ patient_id, intervalo }` —
  sessão da equipe; `idPacienteValido`; `ehIntervaloValido`; 404 se não existe;
  audita `intervalo_aplicacao_alterado` com "de X para Y dias".
- `POST .../enviada` aceita `template: 'aguardando'` (vem de `ETIQUETAS`).

### Interface — `src/app/relatorios/EmTratamento.tsx`

- 4ª sub-aba com contagem.
- Card: etiqueta 🔵; linha "Prescrição finalizada em … · há N dias" nos 🔵; "a cada
  N dias"; seletor de intervalo (`<select aria-label="Intervalo de aplicação">`)
  com salvamento otimista e reversão em erro.
- 📦 também nos 🔵.
- Legenda nova.

### Testes

- Puros: `limiteCritico`; `classificar` com intervalos 7/10/15/21 nas fronteiras
  (N, N+1, limite, limite+1); `'aguardando'` quando folha ≥ saída (incluindo mesmo
  instante) e `diasAguardando`; `listarSubAba` com 🔵 (fora de Todos/Não veio/Veio,
  ordem da sub-aba Aguardando); `ehIntervaloValido`; mensagem 🔵 com o primeiro
  nome.
- Componente: 4ª sub-aba e contagem; card 🔵 (texto, sem "dias sem vir", com 📦);
  seletor de intervalo (PATCH com o corpo certo, etiqueta atualiza, reversão em
  falha).
- Banco e rota: sem harness; revisão + build.
