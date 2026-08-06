# Treinador de Atendimento — Design Spec

## Objetivo

Um módulo de treinamento onde a IA simula pacientes reais da clínica no WhatsApp para a
secretária responder. Ao final, a IA entrega uma avaliação estruturada com nota por
critério, pontos fortes, erros com a frase citada literalmente e uma dica prática com
frase pronta.

A referência é um agente pronto de mercado ("Treinador de Atendimento do Acelerador
Médico"), do qual foram analisadas 5 conversas reais. O que este design faz de diferente
está em [Por que não usar o agente pronto](#por-que-não-usar-o-agente-pronto).

## Fluxo resumido

1. Admin preenche a **base de conhecimento** uma vez (médicos, preços, protocolos, linhas vermelhas)
2. Secretária entra em `/treinamento`, escolhe **nível (1-5)** e **cenário**
3. O paciente simulado já manda a primeira mensagem — sem formulário, sem preâmbulo
4. Ela responde no chat; o paciente reage conforme o nível
5. A conversa termina quando o paciente decide (agendou, desistiu, sumiu) ou ela clica em **Encerrar e avaliar**
6. A IA-avaliadora devolve o relatório; a sessão fica salva no histórico

---

## Por que não usar o agente pronto

Cinco conversas reais foram analisadas. Os problemas encontrados, e o que este design faz:

| Problema observado | Evidência | Solução aqui |
|---|---|---|
| A IA não sabe o que é verdade na clínica | Numa conversa a secretária disse que a Dra. tem **5 anos** de experiência; noutra, **mais de 10**. A IA elogiou as duas. | Base de conhecimento = gabarito. Critério **Precisão** cobra a informação correta. |
| Erro grave tratado como erro cosmético | Secretária afirmou que **"quase 99% dos pacientes mantêm o peso"** — número inventado e promessa de resultado. Virou o 2º bullet de "⚠️ MELHORAR", empatado com "evite textos longos". | Critério **Risco**, que **veta** a aprovação. Alerta vermelho no topo do relatório. |
| Risco clínico invisível | Na mesma mensagem: *"com as aplicações, com os injetáveis"* — secretária falando de medicação. Zero menção na avaliação. | Linha vermelha explícita no cadastro. |
| O paciente não escreve como gente | Parágrafos organizados, "Me explica melhor, por favor", despedida formal. | Balões curtos, erro de digitação, áudio transcrito, atraso de digitação. |
| A IA quebra o personagem | *"Mas sinceramente, **Lúcia ainda está na dúvida**"* — falou de si em 3ª pessoa. | Detecção e descarte da resposta; nova geração. |
| Nível 3 dobra fácil demais | Nas duas conversas de Nível 3, a paciente disse "preciso falar com meu marido, te retorno amanhã" e agendou na mesma sessão. | `SUMIU` é desfecho real a partir do Nível 3. |
| Punição indevida por não fechar | Nível 5 xingou, chamou a clínica de ladra e ameaçou Reclame Aqui. A IA deu **Fechamento 2/10** por "não oferecer horários". | Desfecho `DISPENSOU BEM`: encerrar um abusivo com firmeza é acerto. |
| A IA inventa política da clínica | *"Em no-show, o protocolo é sempre tentar remarcar"* — isso é decisão da clínica, não regra universal. | Política de no-show e remarcação vem do cadastro. |
| Nota presa num print | Texto solto, sem histórico. | JSON estruturado → painel, média por pessoa, evolução no tempo. |

---

## Escopo

### Fase 1 (esta spec)

Base de conhecimento + chat + avaliação + histórico pessoal. É o suficiente para o admin
testar sozinho e medir o custo real antes de liberar para a equipe.

### Fase 2 (fora desta spec)

Painel admin com todas as sessões, média por pessoa, evolução no tempo e ranking dos
critérios mais fracos do time.

### Fora de escopo (decisão explícita)

- **Áudio real** — a secretária responde por texto. As respostas longas transcritas de
  áudio observadas nas conversas reais são cobradas no critério de clareza, mas a
  gravação em si fica para depois.
- **Cenário "primeiro contato por telefone"** — o agente original tinha, mas a diferença
  de mídia não muda nada no treino por texto. Removido.
- **Limite de sessões por usuário** — sem trava na Fase 1, já que só o admin usa.
  Reavaliar antes da Fase 2.

---

## Telas

### `/treinamento` — sala de treino

Acesso: qualquer usuário de staff autenticado.

- Seleção de **nível (1-5)** e **cenário (A-J)**, mais um botão "Deixa a IA escolher"
- Histórico pessoal: últimas sessões com data, nível, cenário, desfecho e nota

### `/treinamento/[id]` — o chat

Visual de WhatsApp. O paciente abre a conversa. Botão **"Encerrar e avaliar"** no topo.
Ao encerrar (por decisão do paciente ou dela), o relatório aparece na mesma tela.

### `/admin/treinamento` — base de conhecimento

Acesso: `is_admin` apenas. Formulário da base de conhecimento.

---

## Níveis

| Nível | Comportamento |
|---|---|
| 1 | Já decidiu. Só quer horário. Testa se ela não atrapalha. |
| 2 | Quer muito, mas o preço aperta. Pergunta parcelamento e desconto. |
| 3 | Indeciso. Compara com outros, pede prova, **e some**. Pode voltar ou não. |
| 4 | Resistente. Desconfiado, ríspido, questiona a competência da médica. |
| 5 | Boss final. Já foi mal atendido, ameaça reclamar publicamente, quer garantia por escrito, cita o concorrente mais barato o tempo todo. |

Nos níveis 4 e 5, parte das personas é **irrecuperável de propósito**: o gabarito é
encerrar bem, não agendar.

## Cenários

| | Cenário |
|---|---|
| A | Primeiro contato no WhatsApp (lead de Instagram/Google) |
| B | Pedindo preço de cara, sem mais nada |
| C | Quer convênio ou nota para reembolso |
| D | Confirmação de consulta |
| E | Quer desmarcar ou remarcar em cima da hora |
| F | Faltou e sumiu (no-show) |
| G | Consultou e não fechou o protocolo |
| H | Perguntando sobre canetas de emagrecimento (Mounjaro/Ozempic) |
| I | Só quer o procedimento estético, sem passar por consulta |
| J | Paciente insatisfeito — "estou há 2 meses e não emagreci nada" |

H, I e J são específicos de nutrologia/emagrecimento/estética e são onde uma secretária
despreparada cria problema, inclusive jurídico.

## Desfechos

| Desfecho | Quando |
|---|---|
| `AGENDOU` | Consulta marcada com dia e horário |
| `NAO_AGENDOU` | Conversa terminou sem agendamento, sem ruptura |
| `SUMIU` | O paciente parou de responder (níveis 3+) |
| `PERDEU_O_PACIENTE` | Ruptura: o paciente foi embora irritado, ou ela desistiu cedo / julgou o paciente |
| `DISPENSOU_BEM` | Paciente abusivo ou inviável, encerrado com firmeza e educação **após sustentar a conversa** |

`DISPENSOU_BEM` exige que ela tenha sustentado a conversa e encerrado sem julgamento.
Desistir na segunda objeção com frase seca é `PERDEU_O_PACIENTE`.

---

## Base de conhecimento

Preenchida uma vez pelo admin. É injetada nos dois prompts: no do paciente (para ele
poder rebater com informação da própria clínica) e no do avaliador (como gabarito).

| Grupo | Campos |
|---|---|
| **Médicos** | Nome completo, como é chamada no WhatsApp, especialidade, **anos de experiência**, formação, focos de atuação |
| **Consulta** | Valor, duração, **o que inclui** (bioimpedância, avaliação de exames, planejamento, acompanhamento, retorno em N semanas, planejamento alimentar), prazo do retorno |
| **Dinheiro** | Formas de pagamento, parcelamento (quantas vezes, com/sem juros), **política de desconto**: existe, quem autoriza |
| **Convênio** | Atende ou não; emite nota para reembolso ou não |
| **Procedimentos** | Lista de procedimentos estéticos com preço |
| **Canetas** | O que a secretária pode responder sobre Mounjaro/Ozempic |
| **No-show e remarcação** | Cobra taxa; quantas tentativas de recuperação; prioridade no encaixe |
| **Links oficiais** | Site, Instagram, Google |
| **🚩 Linhas vermelhas** | O que ela nunca pode dizer |
| **💬 Respostas-modelo** | Frases que o admin quer que sejam usadas |

### Linhas vermelhas iniciais

Extraídas das conversas reais analisadas:

- Prometer quantidade de peso ou prazo ("você vai perder X kg em Y meses")
- Citar estatística de sucesso inventada
- Falar de medicação, injetável ou aplicação
- Dar desconto por conta própria
- Falar mal de concorrente

---

## O motor: duas IAs

O agente original faz tudo num prompt só, e por isso vaza personagem e é frouxo consigo
mesmo. Aqui são dois papéis separados.

### IA-paciente

Roda a cada turno do chat. Modelo rápido e barato (Haiku).

Recebe: persona sorteada + nível + cenário + base de conhecimento + histórico da conversa.

Regras: nunca avalia, nunca dá dica, nunca sai do personagem, nunca fala de si em 3ª
pessoa. Escreve como gente no WhatsApp — balões curtos, erro de digitação, e ocasionalmente
`[áudio de 0:14 — transcrição: "..."]`.

Decide o desfecho da conversa. Quando encerra, sinaliza para o sistema.

### IA-avaliadora

Roda uma vez, no fim. Modelo forte (Sonnet). O id exato de cada modelo é confirmado na
implementação, não fixado aqui.

Recebe: conversa completa + base de conhecimento + rubrica.

Devolve **JSON estruturado** (não texto solto) — é isso que permite o painel e o gráfico
de evolução da Fase 2.

---

## Rubrica

| # | Critério | Cobre |
|---|---|---|
| 1 | **Acolhimento e clareza** | Tom, uso do nome, empatia, **tamanho da mensagem e erro de digitação** |
| 2 | **Qualificação** | Perguntou o nome, a origem do lead, o objetivo, o que deu errado antes |
| 3 | **Argumentos e valor** | Usou os diferenciais reais da clínica para justificar o preço |
| 4 | **Objeções** | Preço, comparação, experiência ruim, desconfiança |
| 5 | **Fechamento** | Ofereceu horário concreto, criou próximo passo com data |
| 6 | **Precisão** | Preço, prazo, experiência e protocolo conforme o cadastro |
| 7 | **Risco** | Cruzou alguma linha vermelha |

Notas de 0 a 10, com uma casa decimal.

### Cálculo

- **Média** = média dos critérios 1 a 6. **Risco não entra na média.**
- **Risco veta**: qualquer linha vermelha cruzada → `REPROVADA`, independente da média.
- Em desfecho `DISPENSOU_BEM`, o critério **Fechamento** é avaliado como "encerrou bem",
  não como "não agendou".

### Status

| Status | Regra |
|---|---|
| `APROVADA` | Média ≥ 7,0 e sem alerta vermelho |
| `APROVADA_COM_RESSALVA` | Média entre 5,0 e 6,9 e sem alerta vermelho |
| `REPROVADA` | Média < 5,0 **ou** qualquer alerta vermelho |

---

## Relatório

Ordem de exibição:

1. **🚨 Alerta vermelho** (se houver) — a frase exata que ela escreveu, qual linha vermelha
   cruzou e por que é grave
2. **Desfecho**
3. **As 7 notas** com justificativa de uma linha cada
4. **Média e status**
5. **Pontos fortes**
6. **A melhorar** — cada item **citando a frase literal** da conversa. Não "evite textos
   longos", e sim "você escreveu tal coisa — o problema é este"
7. **Dica prática** — frase pronta para usar na próxima vez
8. **Próximo treino sugerido** — baseado no critério mais fraco, não subindo de nível
   cegamente

---

## Modelo de dados

Criação via `initSchema()`, seguindo o padrão do projeto.

### `training_kb`

Base de conhecimento. Uma linha ativa, com histórico de alterações.

```sql
CREATE TABLE IF NOT EXISTS training_kb (
  id          SERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

`data` em JSONB porque os campos vão evoluir com o uso; o formato é validado em
TypeScript na leitura e na escrita. Linhas antigas ficam como histórico; a leitura pega
a mais recente.

### `training_sessions`

```sql
CREATE TABLE IF NOT EXISTS training_sessions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  level          SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  scenario       CHAR(1) NOT NULL,
  persona        JSONB NOT NULL,        -- nome, idade, história, objeções
  kb_snapshot    JSONB NOT NULL,        -- base vigente no início da sessão
  status         TEXT NOT NULL,         -- em_andamento | encerrada | avaliada
  outcome        TEXT,                  -- AGENDOU | NAO_AGENDOU | SUMIU | ...
  scores         JSONB,                 -- as 7 notas
  average        NUMERIC(3,1),
  has_red_flag   BOOLEAN DEFAULT FALSE,
  verdict        TEXT,                  -- APROVADA | APROVADA_COM_RESSALVA | REPROVADA
  report         JSONB,                 -- relatório completo
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  ended_at       TIMESTAMPTZ
);
```

`kb_snapshot` guarda a base vigente no início da sessão. Sem isso, editar o preço da
consulta mudaria retroativamente o julgamento de sessões antigas.

### `training_messages`

```sql
CREATE TABLE IF NOT EXISTS training_messages (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,          -- paciente | secretaria
  content     TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS training_messages_session_idx
  ON training_messages (session_id, position);
```

---

## Rotas

| Rota | Método | O quê | Autorização |
|---|---|---|---|
| `/api/treinamento/sessions` | `POST` | Cria a sessão e devolve a 1ª mensagem do paciente | Staff |
| `/api/treinamento/sessions` | `GET` | Histórico. Próprio por padrão; tudo se `is_admin` | Staff |
| `/api/treinamento/sessions/[id]` | `GET` | Sessão + mensagens + relatório | Dono ou `is_admin` |
| `/api/treinamento/sessions/[id]/messages` | `POST` | Envia a resposta dela, devolve os balões do paciente | Dono |
| `/api/treinamento/sessions/[id]/finish` | `POST` | Encerra e avalia | Dono |
| `/api/admin/treinamento/kb` | `GET`/`PUT` | Base de conhecimento | `is_admin` |

Autorização por `src/lib/authz.ts`, seguindo o padrão existente. Sessão pertence a um
`user_id`; acesso de terceiro só com `is_admin` (defesa contra IDOR, igual ao que já é
feito nos recursos de paciente).

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/training/kb.ts` | Ler, validar e gravar a base de conhecimento |
| `src/lib/training/personas.ts` | Catálogo de personas por nível e cenário; sorteio |
| `src/lib/training/patient.ts` | Prompt e chamada da IA-paciente; detecção de quebra de personagem |
| `src/lib/training/evaluator.ts` | Prompt e chamada da IA-avaliadora; validação do JSON |
| `src/lib/training/scoring.ts` | Média, veto do critério de Risco, status |
| `src/lib/training/sessions.ts` | Acesso ao banco (sessões e mensagens) |

Cada arquivo com um propósito único e testável sem rede — as chamadas de IA ficam
isoladas em `patient.ts` e `evaluator.ts`, e o resto é lógica pura.

---

## Erros e casos de borda

| Situação | Comportamento |
|---|---|
| **Crédito da Anthropic acabou** | Mensagem explícita na tela ("os créditos da IA acabaram"), não erro de JSON. A conversa **fica salva** e pode ser avaliada depois. |
| **A IA quebra o personagem** | Resposta descartada e regerada. Detecção: menção a nota, avaliação, "simulação", ou o nome da persona em 3ª pessoa. |
| **JSON da avaliação malformado** | Nova tentativa antes de exibir. Nunca mostrar avaliação parcial. |
| **Base de conhecimento vazia** | `/treinamento` bloqueia o início e aponta para `/admin/treinamento`. Sem gabarito não há critério de Precisão. |
| **Conversa longa demais** | Teto de 30 mensagens da secretária. Ao atingir, encerra e avalia. |
| **Sessão abandonada** | Fica `em_andamento` e reaparece no histórico com opção de retomar ou encerrar e avaliar. |
| **Base editada no meio da sessão** | Irrelevante: a sessão usa `kb_snapshot`. |

---

## Testes

Jest, que o projeto já usa. Chamadas de IA mockadas.

- `scoring.ts`: média ignora o critério de Risco; linha vermelha reprova mesmo com média
  alta; as três faixas de status nos limites (4,9 / 5,0 / 6,9 / 7,0)
- `patient.ts`: respostas que quebram o personagem são detectadas e descartadas
- `evaluator.ts`: JSON fora do formato dispara nova tentativa; JSON válido é aceito
- `kb.ts`: base incompleta é rejeitada na escrita
- Autorização: usuário não-admin não lê sessão de outro; não-admin não edita a base
- Fluxo: criar sessão → responder → encerrar → relatório gravado com desfecho e notas

---

## Custo

Uma sessão de ~20 mensagens: a IA-paciente roda a cada turno (modelo barato), a
avaliadora roda uma vez (modelo forte). Estimativa de centavos por sessão.

As quatro funções de IA que já existem no projeto dividem o mesmo saldo da Anthropic.
Este módulo entra no mesmo bolo — daí a decisão de medir o custo real com uso do admin
antes de liberar para a equipe.
