# Design — Interface Jornada do Paciente

**Data:** 2026-06-09  
**Status:** Aprovado

---

## Visão Geral

Interface web de uso interno para uma funcionária acompanhar a jornada de pacientes em tratamento médico. Cada paciente tem um cartão com dados básicos e uma lista de 18 tarefas pré-definidas, agrupadas por fase, que a funcionária marca conforme o andamento.

---

## Tecnologia

| Camada | Tecnologia |
|--------|-----------|
| Frontend + API | Next.js (App Router) |
| Banco de dados | SQLite via `better-sqlite3` |
| Estilização | Tailwind CSS |
| Runtime | Node.js (roda localmente no PC) |

O banco de dados fica em um arquivo `.db` na pasta do projeto — fácil de fazer backup copiando o arquivo.

---

## Telas

### 1. Tela Principal (`/`)

Lista todos os pacientes cadastrados. Para cada paciente exibe:
- Avatar circular com a inicial do nome (cor gerada automaticamente)
- Nome completo
- Data de início do tratamento
- Duração do tratamento
- Barra de progresso visual com contagem `X/18 tarefas`

Ações disponíveis:
- Botão **"+ Novo Paciente"** abre modal de criação
- Clicar no cartão navega para a tela de detalhe

---

### 2. Tela de Detalhe (`/pacientes/[id]`)

Exibe o acompanhamento completo de um paciente.

**Cabeçalho:**
- Avatar, nome, data de início, duração, observações
- Botão **Editar** abre modal de edição
- Botão **Excluir** com confirmação

**Progresso geral:**
- Barra de progresso + contagem `X/18 tarefas concluídas`

**Tarefas agrupadas por fase:**

| # | Fase | Ícone | Tarefas |
|---|------|-------|---------|
| 1 | Pré-consulta | 📋 | Consulta agendada, Informações da bioimpedância, Questionário pré consulta, Exames / prontuário |
| 2 | Comercial | 💰 | Orçamento enviado, Orçamento fechado |
| 3 | Onboarding | 💬 | Criação do grupo, Envio de fotos no grupo, Envio da bioimpedância no grupo, Termos assinados |
| 4 | Procedimento | 🏥 | Procedimento agendado, Estoque conferido |
| 5 | Nutrição | 🥗 | Enviado para nutri, Agendado com a nutri, Dieta recebida |
| 6 | Tratamento | 💊 | Formulações feitas, Iniciou medicação, Retorno agendado |

Ao marcar ou desmarcar uma tarefa, o estado é salvo automaticamente no banco (sem botão de salvar).

---

## Modelo de Dados

### Tabela `patients`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK | Identificador único |
| `name` | TEXT NOT NULL | Nome do paciente |
| `start_date` | TEXT | Data de início (ISO 8601) |
| `duration` | TEXT | Duração do tratamento (ex: "3 meses") |
| `notes` | TEXT | Observações livres |
| `created_at` | TEXT | Timestamp de criação |

### Tabela `task_completions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK | Identificador único |
| `patient_id` | INTEGER FK | Referência ao paciente |
| `task_key` | TEXT NOT NULL | Identificador da tarefa (ex: `consulta_agendada`) |
| `completed_at` | TEXT | Timestamp de conclusão |

As 18 tarefas são definidas em código (não no banco) — isso permite que você altere nomes ou adicione tarefas no futuro sem migração de dados. O banco armazena apenas quais foram concluídas.

---

## API Routes (Next.js)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/patients` | Lista todos os pacientes |
| POST | `/api/patients` | Cria novo paciente |
| GET | `/api/patients/[id]` | Retorna dados de um paciente |
| PUT | `/api/patients/[id]` | Atualiza dados do paciente |
| DELETE | `/api/patients/[id]` | Remove paciente e suas tarefas |
| POST | `/api/patients/[id]/tasks/[key]` | Marca tarefa como concluída |
| DELETE | `/api/patients/[id]/tasks/[key]` | Desmarca tarefa |

---

## Definição das Tarefas (em código)

```ts
export const TASK_PHASES = [
  {
    key: "pre_consulta",
    label: "Pré-consulta",
    icon: "📋",
    tasks: [
      { key: "consulta_agendada", label: "Consulta agendada" },
      { key: "bioimpedancia_info", label: "Informações da bioimpedância" },
      { key: "questionario_pre", label: "Questionário pré consulta" },
      { key: "exames_prontuario", label: "Exames / prontuário" },
    ],
  },
  {
    key: "comercial",
    label: "Comercial",
    icon: "💰",
    tasks: [
      { key: "orcamento_enviado", label: "Orçamento enviado" },
      { key: "orcamento_fechado", label: "Orçamento fechado" },
    ],
  },
  {
    key: "onboarding",
    label: "Onboarding",
    icon: "💬",
    tasks: [
      { key: "grupo_criado", label: "Criação do grupo" },
      { key: "fotos_grupo", label: "Envio de fotos no grupo" },
      { key: "bioimpedancia_grupo", label: "Envio da bioimpedância no grupo" },
      { key: "termos_assinados", label: "Termos assinados" },
    ],
  },
  {
    key: "procedimento",
    label: "Procedimento",
    icon: "🏥",
    tasks: [
      { key: "procedimento_agendado", label: "Procedimento agendado" },
      { key: "estoque_conferido", label: "Estoque conferido" },
    ],
  },
  {
    key: "nutricao",
    label: "Nutrição",
    icon: "🥗",
    tasks: [
      { key: "enviado_nutri", label: "Enviado para nutri" },
      { key: "agendado_nutri", label: "Agendado com a nutri" },
      { key: "dieta_recebida", label: "Dieta recebida" },
    ],
  },
  {
    key: "tratamento",
    label: "Tratamento",
    icon: "💊",
    tasks: [
      { key: "formulacoes_feitas", label: "Formulações feitas" },
      { key: "iniciou_medicacao", label: "Iniciou medicação" },
      { key: "retorno_agendado", label: "Retorno agendado" },
    ],
  },
];
```

---

## Comportamento

- **Salvamento automático:** marcar/desmarcar tarefa chama a API imediatamente, sem botão de salvar
- **Exclusão segura:** excluir paciente exige confirmação e remove também todas as `task_completions` associadas (CASCADE)
- **Sem autenticação:** uso interno de uma pessoa, sem login necessário
- **Sem multi-tenancy:** banco local, uma instância por máquina

---

## Fora de Escopo

- Login / autenticação
- Múltiplos usuários simultâneos
- Notificações ou lembretes
- Relatórios ou exportação
- Aplicativo mobile
