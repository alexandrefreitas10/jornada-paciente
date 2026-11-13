# Agenda de injetáveis — Entrega 1: a agenda da equipe

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar tarefa por tarefa. Os passos usam caixa (`- [ ]`) para acompanhamento.

**Goal:** A clínica enxerga, marca, remarca, bloqueia e acompanha a agenda de injetáveis pelo sistema interno — sem nenhuma tela do paciente ainda.

**Architecture:** Toda a regra de quando existe vaga vive em libs **puras** (sem banco, sem React), porque é ela que as duas entregas seguintes vão reusar e é ela que precisa de teste pesado. O banco guarda agendamentos e bloqueios; as rotas só traduzem. A tela é um cliente fino sobre essas rotas.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` no lugar de middleware), React 19, TypeScript, Postgres via `postgres.js`, Tailwind v4, Jest.

**Spec:** [`docs/superpowers/specs/2026-11-12-agenda-injetaveis-design.md`](../specs/2026-11-12-agenda-injetaveis-design.md)

## Global Constraints

- **Fatia de 10 minutos.** Um agendamento por fatia (a equipe pode furar; o paciente nunca).
- **Durações válidas: 10 e 40 minutos.** Nada mais.
- **Horário de funcionamento:** Seg 14:00–20:00, Ter 14:00–20:00, Qua 15:00–18:00, Qui 13:00–20:00, Sex 12:00–19:00. Sábado e domingo fechados.
- **Últimos 30 minutos de cada dia:** só 10 minutos.
- **Fuso da clínica:** `America/Sao_Paulo`. Coluna `date` é dia puro e **não** se converte; `timestamptz` é instante e se converte. Usar `src/lib/datas.ts`.
- **Estados:** `agendado`, `atendido`, `faltou`, `remarcou`, `desmarcou`.
- **Feriados:** só nacionais, calculados (os móveis saem da Páscoa).
- **Permissão:** qualquer funcionário logado. Nenhuma permissão nova.
- **Comentário e mensagem de commit em português, explicando o porquê.**
- **Nunca usar nome real de paciente** em teste ou fixture.
- **Não rodar `npm run build` nem `next dev`.** Verificação é `npx tsc --noEmit` e `npx jest`.

## Review Focus

Classes de entrada que a spec implica e que nenhuma tarefa exercitaria por acaso. Cada uma tem seu teste atribuído a uma tarefa abaixo.

1. **Duas pessoas pegando a mesma fatia ao mesmo tempo.** A spec diz que o paciente *nunca* marca em fatia ocupada. Checar na leitura não garante nada sob concorrência — só índice no banco garante. (Tarefa 4)
2. **Agendamento de 40 minutos começando nas últimas 3 fatias.** Precisa ser recusado para o paciente e permitido **com aviso** para a equipe. (Tarefas 3 e 5)
3. **Horário de verão e virada de dia.** Dia de calendário formatado com fuso recua um dia — defeito que já aconteceu três vezes neste projeto. (Tarefa 2)
4. **Bloqueio que pega um agendamento pela metade**: ele começa 17:40 (40 min) e o bloqueio começa 18:00. Tem que cair também. (Tarefa 6)
5. **Feriado móvel dentro da janela.** Carnaval e Corpus Christi mudam de data todo ano; lista fixa falha calada em janeiro. (Tarefa 1)

---

### Task 1: Feriados nacionais calculados

**Files:**
- Create: `src/lib/feriados.ts`
- Test: `__tests__/lib/feriados.test.ts`

**Interfaces:**
- Produces: `ehFeriadoNacional(dia: string): boolean` — `dia` em `AAAA-MM-DD`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('ehFeriadoNacional', () => {
  it('pega os fixos', () => {
    for (const d of ['2027-01-01','2027-04-21','2027-05-01','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-12-25'])
      expect(ehFeriadoNacional(d)).toBe(true)
  })
  it('pega os móveis, que mudam todo ano', () => {
    // Páscoa 2027 = 28/03. Carnaval = -47d, Sexta-feira Santa = -2d, Corpus Christi = +60d.
    expect(ehFeriadoNacional('2027-02-09')).toBe(true)  // Carnaval
    expect(ehFeriadoNacional('2027-03-26')).toBe(true)  // Sexta-feira Santa
    expect(ehFeriadoNacional('2027-05-27')).toBe(true)  // Corpus Christi
  })
  it('os móveis mudam de ano para ano — lista fixa falharia aqui', () => {
    expect(ehFeriadoNacional('2026-02-17')).toBe(true)  // Carnaval 2026
    expect(ehFeriadoNacional('2027-02-17')).toBe(false)
  })
  it('dia comum não é feriado', () => {
    expect(ehFeriadoNacional('2027-03-15')).toBe(false)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar** — `npx jest __tests__/lib/feriados.test.ts`. Esperado: falha por módulo inexistente.
- [ ] **Passo 3: implementar `ehFeriadoNacional(dia: string): boolean` em `src/lib/feriados.ts`.** Fixos numa constante `MM-DD`; móveis a partir da Páscoa pelo algoritmo de Meeus/Butcher, com deslocamentos −47, −2 e +60 dias. Aritmética em UTC para não recuar um dia.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit** — `git add src/lib/feriados.ts __tests__/lib/feriados.test.ts`

---

### Task 2: A grade — quando a clínica atende

**Files:**
- Create: `src/lib/agenda-grade.ts`
- Test: `__tests__/lib/agenda-grade.test.ts`

**Interfaces:**
- Consumes: `ehFeriadoNacional` (Tarefa 1).
- Produces:
  - `DURACOES = [10, 40] as const`, `type Duracao = 10 | 40`
  - `fatiasDoDia(dia: string): string[]` — horários `HH:MM` que o dia oferece; `[]` se fechado.
  - `cabeNoExpediente(dia: string, hora: string, duracao: Duracao): boolean`

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('fatiasDoDia', () => {
  it('segunda tem 36 fatias, das 14:00 às 19:50', () => {
    const f = fatiasDoDia('2026-11-16')           // segunda
    expect(f).toHaveLength(36)
    expect(f[0]).toBe('14:00'); expect(f.at(-1)).toBe('19:50')
  })
  it('quarta é o dia curto: 18 fatias', () => {
    expect(fatiasDoDia('2026-11-18')).toHaveLength(18)
  })
  it('sexta abre mais cedo: começa 12:00', () => {
    expect(fatiasDoDia('2026-11-20')[0]).toBe('12:00')
  })
  it('sábado e domingo não têm fatia', () => {
    expect(fatiasDoDia('2026-11-21')).toEqual([])
    expect(fatiasDoDia('2026-11-22')).toEqual([])
  })
  it('feriado nacional não tem fatia, mesmo caindo em dia útil', () => {
    expect(fatiasDoDia('2026-12-25')).toEqual([])
  })
  // Review Focus 3: dia puro NUNCA pode recuar por fuso.
  it('o dia é o do calendário, não o instante convertido', () => {
    expect(fatiasDoDia('2026-11-16')).not.toEqual([])   // segunda continua segunda
    expect(fatiasDoDia('2026-11-15')).toEqual([])       // domingo continua domingo
  })
})

describe('cabeNoExpediente', () => {
  it('40 min não cabe nas últimas 3 fatias da segunda', () => {
    for (const h of ['19:30','19:40','19:50']) expect(cabeNoExpediente('2026-11-16', h, 40)).toBe(false)
    expect(cabeNoExpediente('2026-11-16', '19:20', 40)).toBe(true)
  })
  it('10 min cabe até a última fatia', () => {
    expect(cabeNoExpediente('2026-11-16', '19:50', 10)).toBe(true)
  })
  it('hora fora do expediente não cabe de jeito nenhum', () => {
    expect(cabeNoExpediente('2026-11-16', '13:50', 10)).toBe(false)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** em `src/lib/agenda-grade.ts`. Tabela `HORARIO` indexada por dia da semana (0=domingo) com `{abre, fecha}` em minutos; dia da semana lido de `AAAA-MM-DD` em **UTC**. `cabeNoExpediente` = a fatia existe **e** `hora + duracao <= fecha`.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

---

### Task 3: As vagas — o que sobra depois da ocupação

**Files:**
- Create: `src/lib/agenda-vagas.ts`
- Test: `__tests__/lib/agenda-vagas.test.ts`

**Interfaces:**
- Consumes: `fatiasDoDia`, `cabeNoExpediente`, `Duracao` (Tarefa 2).
- Produces:
  - `type Ocupacao = { hora: string }` — início de cada agendamento vivo do dia.
  - `type Bloqueio = { de: string; ate: string }` — `HH:MM`, `ate` exclusivo.
  - `vagasDoDia(dia: string, duracao: Duracao, ocupadas: Ocupacao[], bloqueios: Bloqueio[]): string[]`
  - `motivoDeRecusa(dia, hora, duracao, ocupadas, bloqueios): string | null` — por que **aquela** fatia não serve; `null` quando serve.

- [ ] **Passo 1: escrever o teste que falha**

```ts
const SEG = '2026-11-16'

describe('vagasDoDia', () => {
  it('sem nada marcado, 10 min oferece todas as 36 fatias', () => {
    expect(vagasDoDia(SEG, 10, [], [])).toHaveLength(36)
  })
  // Review Focus 2
  it('40 min não oferece as últimas 3 fatias', () => {
    const v = vagasDoDia(SEG, 40, [], [])
    expect(v).toHaveLength(33)
    expect(v).not.toContain('19:30')
  })
  it('fatia ocupada sai da lista', () => {
    expect(vagasDoDia(SEG, 10, [{ hora: '15:10' }], [])).not.toContain('15:10')
  })
  it('só a fatia de INÍCIO é ocupada — soro de 40 min não bloqueia as 3 seguintes', () => {
    // As 4 cadeiras se protegem pela aritmética (40 min = 4 fatias = 4 cadeiras);
    // reservar as 4 fatias cortaria a capacidade da sala em 4x, sem motivo.
    const v = vagasDoDia(SEG, 10, [{ hora: '15:00' }], [])
    expect(v).toContain('15:10'); expect(v).toContain('15:20'); expect(v).toContain('15:30')
  })
  it('bloqueio tira a faixa inteira', () => {
    const v = vagasDoDia(SEG, 10, [], [{ de: '15:00', ate: '16:00' }])
    expect(v).not.toContain('15:00'); expect(v).not.toContain('15:50')
    expect(v).toContain('16:00')
  })
  it('dia fechado não tem vaga', () => {
    expect(vagasDoDia('2026-11-22', 10, [], [])).toEqual([])
  })
})

describe('motivoDeRecusa', () => {
  it('diz quando a fatia já tem gente', () => {
    expect(motivoDeRecusa(SEG, '15:10', 10, [{ hora: '15:10' }], [])).toMatch(/ocupad/i)
  })
  it('diz quando passa do fim do expediente', () => {
    expect(motivoDeRecusa(SEG, '19:40', 40, [], [])).toMatch(/fecha/i)
  })
  it('devolve null quando a fatia serve', () => {
    expect(motivoDeRecusa(SEG, '15:10', 40, [], [])).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** em `src/lib/agenda-vagas.ts`. `vagasDoDia` = `fatiasDoDia` filtrado por `cabeNoExpediente`, menos as ocupadas, menos as cobertas por bloqueio. `motivoDeRecusa` devolve a primeira razão, em português, pronta para aparecer na tela.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

---

### Task 4: Tabelas e camada de banco

**Files:**
- Modify: `src/lib/db.ts` (acrescentar migrações ao final de `runMigrations`)
- Create: `src/lib/agenda-db.ts`
- Test: `__tests__/lib/agenda-db.test.ts`

**Interfaces:**
- Produces: `criarAgendamento`, `agendamentosDoPeriodo(de, ate)`, `mudarStatus(id, status, por)`, `mudarDuracao(id, duracao)`, `criarBloqueio`, `bloqueiosDoPeriodo`.
- `type StatusAgendamento = 'agendado' | 'atendido' | 'faltou' | 'remarcou' | 'desmarcou'`

**Esquema** (aditivo, `CREATE TABLE IF NOT EXISTS`, no padrão do arquivo):

```sql
CREATE TABLE IF NOT EXISTS agendamentos (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  dia         DATE NOT NULL,          -- dia puro: nunca converter por fuso
  hora        TIME NOT NULL,
  duracao     SMALLINT NOT NULL,      -- 10 ou 40
  status      TEXT NOT NULL DEFAULT 'agendado',
  encaixe     BOOLEAN NOT NULL DEFAULT false,
  criado_por  TEXT,                   -- nome do funcionário, ou null quando o paciente marcou
  desmarcado_por TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Review Focus 1: a trava contra duas pessoas na mesma fatia é AQUI, não na leitura.
-- Checar antes de gravar não resolve concorrência: dois pacientes tocando o
-- mesmo horário no mesmo segundo passam os dois pela checagem.
--
-- Parcial em DOIS eixos, cada um por um motivo:
--   `status IN ('agendado','atendido')` — só agendamento VIVO segura a fatia;
--   remarcado e desmarcado ficam na tabela para o relatório e soltam o horário.
--   `AND NOT encaixe` — o encaixe da equipe é, por decisão do dono, a exceção
--   que pode dobrar a fatia. Sem este recorte o índice proibiria justamente o
--   que a spec autoriza. Então: no máximo UM agendamento normal por fatia,
--   e quantos encaixes a equipe precisar.
CREATE UNIQUE INDEX IF NOT EXISTS agendamento_fatia_viva
  ON agendamentos (dia, hora) WHERE status IN ('agendado','atendido') AND NOT encaixe;

CREATE TABLE IF NOT EXISTS agenda_bloqueios (
  id SERIAL PRIMARY KEY,
  dia DATE NOT NULL, de TIME NOT NULL, ate TIME NOT NULL,
  motivo TEXT, criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Passo 1: escrever o teste que falha.** Testa só o que é puro nesta camada — a suíte `lib` não abre banco. Teste: `duracaoValida(n)` aceita 10 e 40 e recusa 0, 20 e 50; `ehStatusAgendamento` aceita os cinco e recusa `'cancelado'`.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** as migrações em `src/lib/db.ts` e as funções em `src/lib/agenda-db.ts`, exportando também `duracaoValida` e `ehStatusAgendamento`. Toda função começa com `await initSchema()`, como as vizinhas.
- [ ] **Passo 4: rodar e ver passar + `npx tsc --noEmit`.**
- [ ] **Passo 5: commit.**

> ⚠️ **Migração nova toca produção?** Ver `docs` e a memória do projeto: historicamente `npm run build` local aplicava migração no Postgres de produção. Estas são aditivas (`IF NOT EXISTS`) e seguras de rodar antes do código novo subir.

---

### Task 5: Rotas da agenda

**Files:**
- Create: `src/app/api/agenda/route.ts` (GET período, POST criar)
- Create: `src/app/api/agenda/[id]/route.ts` (PATCH status/duração, DELETE desmarcar)
- Test: `__tests__/lib/agenda-permissao.test.ts`

**Interfaces:**
- Consumes: `agenda-db` (Tarefa 4), `motivoDeRecusa` (Tarefa 3).
- Produces: contrato `GET /api/agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD` → `{ agendamentos, bloqueios }`.

**Regra que esta tarefa carrega:** `POST` aceita `forcado: boolean`.

- `forcado: false` → recusa com 409 e o texto de `motivoDeRecusa`. É o caminho de todo mundo, e é o que a Entrega 2 vai usar para o paciente.
- `forcado: true` → grava com **`encaixe = true`** e devolve `aviso` com o mesmo texto. É assim que o encaixe da equipe convive com o índice único da Tarefa 4: ele fica fora do recorte do índice, então a fatia aceita quantos encaixes forem necessários enquanto continua aceitando **um só** agendamento normal.

O aviso nunca é engolido: a equipe fura a regra sabendo que furou. Furar sem perceber é diferente de furar de propósito.

- [ ] **Passo 1: escrever o teste que falha.** `__tests__/lib/agenda-permissao.test.ts` cobre a função pura `decidirGravacao({ motivo, forcado })` → `{ grava: boolean; status: 403|409|201; aviso: string | null }`: sem motivo grava limpo; com motivo e `forcado=false` recusa; com motivo e `forcado=true` grava **com aviso**. (Review Focus 2)
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** `decidirGravacao` em `src/lib/agenda-vagas.ts` e as rotas. Toda rota: `const session = await auth()`, 401 sem sessão. `params` é **Promise** (Next 16).
- [ ] **Passo 4: rodar e ver passar + `npx tsc --noEmit`.**
- [ ] **Passo 5: commit.**

---

### Task 6: Bloquear, derrubando quem estava marcado

**Files:**
- Create: `src/app/api/agenda/bloqueios/route.ts`
- Modify: `src/lib/agenda-vagas.ts`
- Test: `__tests__/lib/agenda-bloqueio.test.ts`

**Interfaces:**
- Produces: `atingidosPeloBloqueio(bloqueio: Bloqueio & { dia: string }, agendamentos: { id: number; hora: string; duracao: Duracao }[]): number[]`

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('atingidosPeloBloqueio', () => {
  it('pega quem começa dentro do bloqueio', () => {
    const r = atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 1, hora: '18:10', duracao: 10 }])
    expect(r).toEqual([1])
  })
  // Review Focus 4
  it('pega quem começa ANTES e termina dentro', () => {
    const r = atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 2, hora: '17:40', duracao: 40 }])   // 17:40–18:20, invade
    expect(r).toEqual([2])
  })
  it('não pega quem termina antes de começar o bloqueio', () => {
    expect(atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 3, hora: '17:10', duracao: 40 }])).toEqual([])   // 17:10–17:50
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** a função (sobreposição de intervalos: `inicio < ate && fim > de`) e a rota `POST`, que grava o bloqueio, marca os atingidos como `desmarcou` com `desmarcado_por = 'clínica'` e **devolve a lista de nome e horário** — é ela que a tela mostra para a equipe saber quem avisar no grupo.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

---

### Task 7: A tela da equipe

**Files:**
- Create: `src/app/agenda/page.tsx` (servidor: `auth()`, redireciona para `/login` sem sessão)
- Create: `src/app/agenda/AgendaClient.tsx`
- Modify: `src/components/NavMenu.tsx:17-31` (item `{ href: '/agenda', label: 'Agenda' }`, sem condição de permissão)
- Test: `__tests__/components/AgendaClient.test.tsx`

**Interfaces:** Consome as rotas das Tarefas 5 e 6.

- [ ] **Passo 1: escrever o teste que falha.** Com `global.fetch` mockado devolvendo um dia com um `agendado` às 15:10 e um `atendido` às 14:00:
  - mostra as fatias do dia e o nome em cada agendamento;
  - o nome é um link para `/pacientes/{id}`;
  - o `atendido` mostra o atalho "registrar saída dos ativos", apontando para `/estoque/saida` com o paciente já escolhido, e o `agendado` **não** mostra o atalho;
  - alternar para Semana troca a chamada da API para um período de 7 dias.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** a tela: alternador Dia/Semana, grade de fatias, chip de status, botão "Encaixar alguém" (que manda `forcado: true` e mostra o `aviso` devolvido), botão "Bloquear" (que mostra a lista de atingidos devolvida antes de confirmar), troca de status e de duração. Estilo Tailwind no padrão das telas existentes.
- [ ] **Passo 4: rodar e ver passar + `npx tsc --noEmit` + `npx jest`.**
- [ ] **Passo 5: commit.**

---

## As outras entregas

Cada uma ganha seu próprio plano, escrito depois que esta estiver no ar e testada pela equipe:

- **Entrega 2 — a aba Agenda no portal.** Reusa inteiras as Tarefas 1 a 4. Acrescenta: aba só para quem tem arquivo em Prescrições, um agendamento por vez liberado pelo relógio, janela de 4 semanas, trava de 1 hora com o recado do grupo, e a escolha por tempo (10/40 min).
- **Entrega 3 — Relatórios › Agendamentos.** Mês inteiro, filtro por período e status, histórico por paciente.

A ordem importa: a Entrega 1 deixa a equipe exercitar a regra das fatias com gente de verdade **antes** de qualquer paciente tocar nela. Se a aritmética das cadeiras não corresponder à rotina da sala, é muito mais barato descobrir com o Carlos do que com 50 pacientes marcando sozinhos.

---

# O que ficou para depois (Entrega 1 concluída em 13/11/2026)

Entrega 1 pronta: 21 commits, 975 testes, type-check limpo, revisão de conjunto aprovada.

## ⚠️ Obrigatório ANTES da Entrega 2 — antes de qualquer paciente marcar sozinho

1. **Afirmar na subida que o índice único existe.** `CREATE UNIQUE INDEX` usa o `.catch(() => {})` da casa. Se ele falhar por timeout, a aplicação sobe **sem a única trava real** contra duas pessoas no mesmo horário, e nada avisa. Hoje é aceitável porque só a equipe marca; com paciente marcando sozinho, não é. Conferir `pg_indexes` na subida e reportar por `logSystemError`.
2. **Limitar o intervalo do `GET /api/agenda` no servidor.** A janela de quatro semanas do paciente precisa ser imposta no servidor, não no cliente.

## Revisitar quando o volume crescer

- Índice em `agendamentos(dia)` e em `patient_id` — hoje ~9 mil linhas/ano, varredura é mais barata. Rever na Entrega 3, que varre anos.
- `GET /api/patients` devolve a tabela inteira para a busca de paciente do encaixe. Um endpoint `?q=` é o conserto certo, em mudança própria.

## Adiados com justificativa (não são defeitos conhecidos)

- `CHECK (ate > de)` em `agenda_bloqueios` — a rota já recusa e é a única escritora.
- Alinhamento de `hora` — `horaValida` garante segundos zerados; desalinhamento só por encaixe deliberado, e aparece como linha própria.
- Listas de status/duração duplicadas entre TS e SQL — acrescentar status é ato deliberado que tocaria os dois.
- `INDICE_FATIA` e o nome do índice são duas cópias — se divergirem, colisão vira 500 em vez de 409: feio e barulhento, não silencioso.
- PATCH com dois campos são dois UPDATEs — a tela manda um campo por vez.
- DELETE sobrescreve `desmarcado_por` — inalcançável pela tela hoje; acrescentar `AND status <> 'desmarcou'` quando o paciente ganhar botão de desmarcar.
- Reviver para `agendado` não reconfere — o índice ainda pega colisão, e a confirmação na tela declara que bloqueio não é reconferido.
- Contagem do rodapé enumera status por fora; `vivo(status: string)` alargou o tipo; `page.tsx` reescreve `is_admin || can_estoque`.
- `aviso` da troca de duração não é limpo; links de paciente usam `<a href>`.
- Fatia só com `faltou` fora da grade imprime a frase de recusa sob o card.

## Limites conhecidos, por decisão

- **Bloquear não é à prova de corrida.** Trava de linha não é trava de predicado: marcação cuja leitura de bloqueios aconteceu antes do commit ainda pode cair dentro. Mitigado por varredura pós-commit (janela de milissegundos, lista da equipe completa) e registro na tela de Erros. Rever na Entrega 2.
- **As quatro cadeiras são garantidas por aritmética, não por restrição.** Cai se um soro passar de 40 min ou o número de cadeiras mudar.
- **20 de novembro fecha uma sexta que a clínica atende.** Feriado nacional desde a Lei 14.759/2023. O dono foi perguntado e ainda não respondeu; o teste em `agenda-grade.test.ts` falha de propósito se removerem `11-20`.

---

# Atualização — rodada de pendências (13/11/2026, mesma sessão)

**Os dois obrigatórios antes da Entrega 2 estão FEITOS** (`63d2a87`):

1. ✅ A aplicação reclama na tela de Erros se o índice único não existir.
2. ✅ Teto de 62 dias no `GET /api/agenda`, imposto no servidor.

**Também fechados:**

- `CHECK (ate > de)` em `agenda_bloqueios`.
- **Teste que amarra o SQL ao TypeScript** (`__tests__/lib/agenda-sql-bate-com-ts.test.ts`): nome do índice, lista de status, lista de durações e o recorte parcial do índice. Lê o SQL como texto — não é elegante, e é de propósito: a alternativa era não ter ligação nenhuma. Provado quebrando.
- Desmarcar o que já estava desmarcado não sobrescreve mais a autoria original.
- Contagem do rodapé derivada em vez de reenumerada; `vivo()` exaustivo no tipo; `aviso` limpo a cada ação.
- `semAcento` virou módulo próprio com teste. O escape unicode se perdia em toda ferramenta do caminho e voltava a virar caractere invisível — a faixa agora é montada por número.
- `podeEstoque` saiu para `src/lib/permissoes.ts`, puro e testável. Em `authz.ts` era intestável: aquele arquivo importa `@/auth` e a suíte morre no carregamento.

**Estado: 72 suítes, 993 testes, type-check limpo. Nada mesclado, nada publicado.**

## Ainda em aberto

- Índice em `agendamentos(dia)` e `patient_id` — rever na Entrega 3, que varre anos.
- `GET /api/patients` devolve a tabela inteira para a busca do encaixe; um `?q=` é o conserto, em mudança própria.
- PATCH com status e duração são dois UPDATEs (a tela manda um por vez).
- Reviver para `agendado` não reconfere — declarado na confirmação da tela.
- Falta teste do caminho `?paciente` + `?item` sem pré-seleção.
- Links de paciente usam `<a href>` (padrão do projeto).
- **20 de novembro: o dono ainda não respondeu se fecham.**

## Limite novo, aberto nesta rodada

**Reviver um agendamento apaga que ele já esteve desmarcado.** A autoria agora acompanha o estado: ao sair de `desmarcou`, `desmarcado_por` é limpo. É o comportamento certo para "quem desmarcou **esta** linha", mas significa que a linha não guarda ter sido cancelada antes.

O conserto de verdade é **histórico append-only de mudança de status** — uma linha por transição, em vez de um campo sobrescrito. Não cabia nesta entrega e vale avaliar na Entrega 3, que é quem precisa do histórico para o relatório.
