# Portal do Paciente — Design Spec

## Objetivo

Cada paciente terá acesso a um portal exclusivo onde pode visualizar todas as informações do seu próprio card (exceto a aba Tarefas). O acesso é somente leitura — o paciente pode baixar arquivos, fotos e fazer montagens Antes x Depois, mas não pode editar nenhum dado.

## Fluxo Resumido

1. Admin cadastra o e-mail do paciente no card
2. Admin gera link de convite (UUID token) e envia manualmente via WhatsApp ou outro canal
3. Paciente clica no link, define uma senha
4. Paciente acessa `/portal/login` com e-mail + senha em qualquer momento futuro
5. Paciente vê somente o próprio card em modo leitura

---

## Modelo de Dados

### 1. Campo `email` na tabela `patients`

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT;
```

Nullable. Sem e-mail = sem acesso ao portal.

### 2. Nova tabela `patient_users`

```sql
CREATE TABLE IF NOT EXISTS patient_users (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT,                    -- null até o paciente definir senha
  invite_token     UUID UNIQUE,             -- null após uso
  invite_used_at   TIMESTAMPTZ,             -- preenchido quando paciente ativa a conta
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

**Regras:**
- `password_hash` é `null` enquanto o convite ainda não foi usado
- `invite_token` é zerado (null) após o paciente ativar a conta — tokens usados não funcionam mais
- `invite_used_at` registra quando a conta foi ativada
- Deletar o paciente cascateia e remove o acesso

---

## Rotas

| Rota | Descrição |
|------|-----------|
| `/portal/login` | Login do paciente (e-mail + senha) |
| `/portal/ativar/[token]` | Ativação da conta — paciente define senha pela 1ª vez |
| `/portal/paciente` | Card do paciente em modo leitura (rota protegida) |

Todas as rotas `/portal/*` são completamente separadas do sistema interno.

---

## Autenticação

### Arquivo: `src/auth-portal.ts`

Segundo NextAuth independente, exclusivo para pacientes:
- Provider: Credentials com e-mail + senha
- Tabela: `patient_users`
- JWT com payload: `{ patient_id, email }`
- Handler em: `src/app/api/portal/auth/[...nextauth]/route.ts`
- Cookie de sessão com nome diferente do staff (evita colisão)

### Middleware (`src/middleware.ts`)

- `/portal/paciente*` → exige sessão portal válida → redireciona para `/portal/login` se ausente
- Rotas internas (`/pacientes`, `/relatorios`, etc.) → sem mudança, continuam exigindo sessão staff

---

## Bloco "Acesso do Paciente" no Card (Admin)

Adicionado no topo ou em seção própria do `PatientDetailClient`. Exibe estados progressivos:

**Estado 1 — Sem e-mail:**
- Campo de texto para e-mail + botão "Salvar e-mail"

**Estado 2 — E-mail salvo, sem convite gerado:**
- Exibe o e-mail + botão "Gerar link de convite"
- Ao clicar: cria registro em `patient_users`, gera UUID como `invite_token`, exibe link completo para copiar

**Estado 3 — Convite gerado, conta não ativada:**
- Mensagem "Aguardando ativação — [email]"
- Botão "Copiar link novamente"
- Botão "Revogar convite" (zera o token)

**Estado 4 — Conta ativa:**
- Mensagem "✅ Portal ativo — [email]"
- Botão "Revogar acesso" (deleta o `patient_users` ou zera `password_hash` e `invite_token`)

### API endpoints necessários

| Método | Rota | Ação |
|--------|------|------|
| `PATCH` | `/api/patients/[id]` | Salvar e-mail (já existe, adicionar campo `email`) |
| `POST` | `/api/patients/[id]/portal-invite` | Gerar token de convite |
| `DELETE` | `/api/patients/[id]/portal-invite` | Revogar convite ou acesso |
| `GET` | `/api/portal/invite/[token]` | Validar token (verifica se existe e não foi usado) |
| `POST` | `/api/portal/invite/[token]` | Ativar conta (salva senha hasheada, marca `invite_used_at`, zera token) |

---

## Página de Ativação `/portal/ativar/[token]`

1. Ao carregar: valida o token via `GET /api/portal/invite/[token]`
   - Token inválido ou já usado → exibe erro "Este link não é válido ou já foi utilizado"
2. Exibe formulário: campo "Criar senha" + "Confirmar senha" (mín. 6 caracteres)
3. Submit → `POST /api/portal/invite/[token]`
4. Sucesso → faz login automático e redireciona para `/portal/paciente`

---

## Página do Portal `/portal/paciente`

- Busca dados do paciente usando `patient_id` da sessão JWT
- Renderiza `PatientDetailClient` com duas diferenças:
  - Prop `readOnly={true}`
  - Aba "Tarefas" removida da lista de abas
- Header simplificado: nome do paciente + botão Sair
- Sem barra de navegação interna do sistema (sem acesso a outras páginas)

---

## Modo Leitura nos Componentes (`readOnly` prop)

A prop `readOnly: boolean` é adicionada a `PatientDetailClient` e repassada para cada aba.

### O que é ocultado com `readOnly={true}`

| Componente | Ocultado |
|-----------|---------|
| `EvolucaoTab` | Botão "Adicionar medição", edição de notas |
| `FilesTab` (Fotos, Exames, Dietas, Bioimpedância) | Upload, botão excluir; download mantido |
| `EsteticaTab` | Criar/editar sessões, adicionar fotos; lightbox, download e montagem Antes x Depois mantidos |
| `TermosTab` | Criar novos termos, enviar para assinatura; visualização de termos existentes mantida |
| `MedicaçõesTab` | Adicionar/editar medicações |
| `NotesSection` | Edição de notas (somente leitura) |
| Header do card | Botões Editar, Arquivar, Excluir paciente |

### Padrão de implementação

```tsx
// Antes
{<button onClick={handleAdd}>+ Adicionar</button>}

// Depois
{!readOnly && <button onClick={handleAdd}>+ Adicionar</button>}
```

Nenhum componente é duplicado. Apenas condicionais são adicionadas nos pontos de escrita.

---

## Segurança

- O `patient_id` na sessão JWT é a única fonte de verdade para qual paciente o usuário pode ver
- Todos os endpoints do portal validam que o `patient_id` da sessão corresponde ao recurso solicitado
- Tokens de convite são UUIDs v4 (128 bits de entropia), invalidados após uso único
- Acesso pode ser revogado a qualquer momento pelo admin
- Sessões portal não têm acesso a nenhuma rota do sistema interno

---

## Arquivos Novos

```
src/auth-portal.ts
src/app/portal/login/page.tsx
src/app/portal/login/PortalLoginForm.tsx
src/app/portal/ativar/[token]/page.tsx
src/app/portal/paciente/page.tsx
src/app/api/portal/auth/[...nextauth]/route.ts
src/app/api/portal/invite/[token]/route.ts
src/app/api/patients/[id]/portal-invite/route.ts
src/lib/patient-portal.ts
```

## Arquivos Modificados

```
src/middleware.ts           — proteger rotas /portal/paciente*
src/lib/db.ts              — schema: email em patients, tabela patient_users
src/components/PatientDetailClient.tsx  — prop readOnly, bloco "Acesso do Paciente"
src/components/EvolucaoTab.tsx          — readOnly
src/components/FilesTab.tsx             — readOnly
src/components/EsteticaTab.tsx          — readOnly
src/components/TermosTab.tsx            — readOnly
src/components/MedicaçõesTab.tsx        — readOnly
src/components/NotesSection.tsx         — readOnly
```
