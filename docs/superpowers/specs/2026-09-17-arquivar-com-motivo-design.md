# Arquivar paciente com motivo + mensagem recolhida

**Data:** 2026-09-17
**Status:** aguardando revisão do dono

## Problema

1. Na aba **Relatórios › Em tratamento**, quem não vem há semanas e não finalizou a
   prescrição continua na lista para sempre, mesmo quando a equipe já sabe que o
   paciente decidiu parar. Falta um jeito de tirá-lo dali registrando **por quê**.
2. O arquivamento que já existe (botão 📦 no card do paciente → "Pacientes
   Antigos") não guarda motivo, nem quem arquivou.
3. A mensagem "Em dia" agora tem ~25 linhas; com 39 pacientes a lista fica longa
   demais.

## Contexto do código hoje

- Arquivar = `patients.archived_at = NOW()` (`archivePatient` em `src/lib/patients.ts`),
  via `POST /api/patients/[id]/archive`. Reativar = `archived_at = NULL` via
  `POST /api/patients/[id]/unarchive`. Nenhum dos dois registra auditoria.
- A aba Em tratamento **já exclui** pacientes arquivados.
- Hoje não há nenhum paciente arquivado (conferido em 17/09), então a reativação
  automática abaixo não afeta ninguém no momento da virada.
- Toda saída de estoque passa por `createMovement` em `src/lib/stock.ts`, dentro
  de uma transação.

## Comportamento

### 1. Mensagem recolhida

Em cada card da aba Em tratamento, a mensagem longa aparece **recolhida em 3 linhas**
(3, e não 2: a 2ª linha da mensagem "Em dia" é em branco),
com o botão **"▼ Ver mensagem completa"**; aberta, o botão vira **"▲ Recolher"**.
Cada card abre e fecha sozinho. Mensagem curta (até 3 linhas e 180 caracteres)
não tem o botão. **Copiar mensagem** copia sempre o texto inteiro.

### 2. Mover para Pacientes Antigos (aba Em tratamento)

- Os cards 🟡 **Faltou** e 🔴 **Crítico** ganham o botão
  **"📦 Mover para Pacientes Antigos"**. Cards 🟢 não têm o botão.
- Ao clicar, abre **dentro do card** um campo **Observações** com **Confirmar** e
  **Cancelar**.
- A observação é **obrigatória**: de 3 a 500 caracteres depois de tirar os
  espaços das pontas. Sem isso, Confirmar fica desabilitado.
- Confirmado, o paciente é arquivado e o card **sai da lista na hora**; as
  contagens das sub-abas e o contador de enviadas se atualizam.
- Falha ao arquivar → aviso vermelho dentro do card; o card fica.

### 3. Botão 📦 do card do paciente (página principal)

Continua existindo, mas em vez da confirmação simples abre uma janela com o mesmo
campo **Observações** obrigatório. Assim o motivo nunca fica em branco, venha de
onde vier o arquivamento.

### 4. Pacientes Antigos mostra o motivo

No card de cada paciente arquivado, abaixo do nome:

> 📝 *motivo* — *quem arquivou*, *dd/mm/aaaa*

Paciente arquivado antes desta mudança (sem registro) não mostra a linha.

### 5. Reativação automática por nova aplicação

- Uma **saída de estoque** vinculada a um paciente arquivado o **reativa**
  (`archived_at = NULL`) na mesma transação que grava a saída. Ele volta para a
  página principal e, pela regra existente, para Em tratamento.
- **Implante não reativa** — a mesma regra de exclusão da aba Em tratamento:
  observação `Implante hormonal` **ou** item com "implante" no nome. Quem parou o
  tratamento semanal mas mantém o implante semestral continua arquivado.
- Paciente **excluído** (`deleted_at`) nunca é reativado por aqui.

### 6. Reativação manual

O botão **"↩ Reativar"** de Pacientes Antigos continua igual para quem usa (sem
pedir motivo), mas passa a registrar histórico e auditoria.

### 7. Histórico e auditoria

Tabela nova com um registro por arquivamento/reativação, para que o motivo antigo
não se perca se o paciente for e voltar mais de uma vez:

```sql
CREATE TABLE IF NOT EXISTS patient_archive_events (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('arquivado', 'reativado')),
  reason TEXT,
  source TEXT NOT NULL CHECK (source IN ('em_tratamento', 'card_paciente', 'pacientes_antigos', 'nova_aplicacao')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patient_archive_events_patient_idx
  ON patient_archive_events (patient_id, created_at DESC);
```

- `reason` é obrigatório em `arquivado` (validado na API) e vazio em `reativado`.
- Toda ação também vai para `logAudit`:
  `paciente_arquivado` (com o motivo), `paciente_reativado`, e
  `paciente_reativado_automaticamente` (com o id da saída).

Quem pode arquivar e reativar: qualquer pessoa da equipe logada, como hoje.

## Arquitetura

### Regra pura compartilhada — `src/lib/em-tratamento.ts`

- `ehSaidaDeImplante(nomeItem, observacao)` → `boolean`. Usada pela reativação
  automática. O SQL de `listarEmTratamento` aplica a mesma regra; um teste fixa
  os mesmos casos nos dois lados (nome com "IMPLANTE" em qualquer caixa,
  observação exata `Implante hormonal`, nulos).

### Regras puras de arquivamento — `src/lib/arquivo-paciente.ts` (novo)

- `validarMotivo(texto)` → `string | null` (texto limpo, ou `null` se inválido).
  Usada pela API e pelos dois formulários.
- `idPacienteValido(valor)` → `number | null` (inteiro de 1 até o máximo do
  INTEGER do Postgres).

### Banco — `src/lib/patient-archive.ts` (novo, só servidor)

- `arquivarPaciente(id, motivo, por, origem)` → `boolean` (falso se o paciente
  não existe, já está arquivado ou foi excluído). Atualiza `archived_at` e grava
  o evento numa transação.
- `reativarPaciente(id, por, origem)` → `boolean`, mesma ideia.
- `archivePatient`/`unarchivePatient` em `src/lib/patients.ts` deixam de ser
  usados pelas rotas e são removidos, se nada mais os chamar.
- `listArchivedPatients` passa a trazer, do último evento `arquivado`,
  `archive_reason`, `archived_by` e `archive_event_at`, num tipo novo
  `ArchivedPatientItem` que estende `PatientListItem`.

### Reativação automática — `createMovement` em `src/lib/stock.ts`

Dentro da transação, depois de gravar uma saída com `patient_id`, se não for
implante:

```sql
UPDATE patients SET archived_at = NULL
WHERE id = $patient_id AND archived_at IS NOT NULL AND deleted_at IS NULL
RETURNING id
```

Se reativou, grava o evento `reativado` / `nova_aplicacao` na mesma transação e,
depois do commit, chama `logAudit`. A saída **nunca** falha por causa da
reativação (a transação é a mesma, então só falha junto se o banco falhar).

### API

- `POST /api/patients/[id]/archive` passa a exigir `{ motivo, origem }`
  (`origem` ∈ `em_tratamento` | `card_paciente`); 400 se o motivo for inválido,
  404 se o paciente não puder ser arquivado; audita.
- `POST /api/patients/[id]/unarchive` grava evento (`pacientes_antigos`) e audita.
- As duas conferem a sessão da equipe e validam o id como as rotas da aba
  Em tratamento.

### Interface

- `src/app/relatorios/EmTratamento.tsx`: mensagem recolhida; botão e formulário
  de arquivamento nos cards 🟡/🔴; remove o card da lista ao arquivar.
- `src/components/ArchivePatientButton.tsx`: janela com Observações. O botão já
  fica fora do `<Link>` do card (`PatientCard.tsx`), então a janela é um overlay
  comum; mesmo assim ela interrompe a propagação de cliques por segurança.
- `src/components/ArchivedPatientsList.tsx`: linha 📝 com motivo, quem e quando.

### Testes

- Puros: `ehSaidaDeImplante`, `validarMotivo`, `idPacienteValido`.
- Componentes: EmTratamento (recolher/expandir; botão só em 🟡/🔴; Confirmar
  desabilitado sem motivo; card some ao arquivar; erro fica no card);
  ArchivePatientButton (janela, motivo obrigatório, não navega ao digitar);
  ArchivedPatientsList (mostra motivo quando existe).
- `PatientCard.test.tsx` já falha antes deste trabalho — não é critério.
- Banco e `createMovement`: sem harness de banco no projeto; verificação por
  leitura do código e revisão.

## Fora do escopo

- Pedir motivo ao reativar manualmente.
- Tela de histórico completo de arquivamentos (os dados ficam guardados).
- Editar o motivo depois de arquivado.
- Arquivar em lote.
