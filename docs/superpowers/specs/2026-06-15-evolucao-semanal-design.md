# Design: Aba de Evolução Semanal do Paciente

**Data:** 2026-06-15  
**Status:** Aprovado

## Visão geral

Adicionar uma aba "Evolução" na página de detalhes de cada paciente para registrar e visualizar métricas semanais: peso, circunferências e dose de tirzepatida. O registro pode ser feito por upload de foto (extraído por IA) ou manualmente.

## Banco de dados

Nova tabela `weekly_measurements`:

```sql
CREATE TABLE IF NOT EXISTS weekly_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  week INTEGER,
  date TEXT,
  weight NUMERIC,
  abdominal_circumference NUMERIC,
  waist_circumference NUMERIC,
  tirzepatide_dose NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Adicionada ao `initSchema()` em `src/lib/db.ts`.

## Backend

### `src/lib/measurements.ts`
Funções async usando postgres.js:
- `listMeasurements(patientId)` → `Measurement[]` ordenado por semana
- `createMeasurement(patientId, data)` → `Measurement`
- `updateMeasurement(id, data)` → `Measurement`
- `deleteMeasurement(id)` → `void`

Interface `Measurement`: `{ id, patient_id, week, date, weight, abdominal_circumference, waist_circumference, tirzepatide_dose, created_at }`

### API Routes

| Método | Rota | Ação |
|--------|------|------|
| GET | `/api/patients/[id]/measurements` | Lista medições do paciente |
| POST | `/api/patients/[id]/measurements` | Cria medição manual |
| PUT | `/api/patients/[id]/measurements/[mid]` | Atualiza medição |
| DELETE | `/api/patients/[id]/measurements/[mid]` | Remove medição |
| POST | `/api/patients/[id]/measurements/extract` | Extrai dados de foto via Claude e salva |

### Extração via IA (`/extract`)
- Recebe `multipart/form-data` com campo `photo` (arquivo de imagem)
- Converte para base64
- Envia para Claude Haiku (`claude-haiku-4-5-20251001`) com prompt para extrair os campos da tabela como JSON
- Valida e salva no banco via `createMeasurement`
- Retorna o registro criado
- Em caso de falha na extração, retorna erro 422

### Dependências novas
- `@anthropic-ai/sdk` — SDK oficial da Anthropic
- `recharts` — gráficos de linha
- Variável de ambiente: `ANTHROPIC_API_KEY`

## Frontend

### Abas em `PatientDetailClient.tsx`
- Dois botões no topo do conteúdo: **"Tarefas"** e **"Evolução"**
- Estado local `activeTab: 'tasks' | 'evolution'`
- Tab ativo: borda e texto violeta; inativo: cinza

### `src/components/EvolutionTab.tsx` (`'use client'`)
Props: `patientId: number`, `initialMeasurements: Measurement[]`

Estado local:
- `measurements` — lista atual
- `uploading` — boolean para loading do upload
- `editingId` — id da linha em edição inline (ou `null`)

Seções:
1. **Upload de foto** — `<input type="file" accept="image/*">` oculto, botão estilizado "📷 Enviar foto". Ao selecionar: envia para `/extract`, mostra spinner, atualiza lista.
2. **Tabela** — colunas: Semana, Data, Peso (kg), Abdômen (cm), Cintura (cm), Tirzepatida (mg), Ações. Linha em modo de edição mostra `<input>` em cada célula + botão Salvar/Cancelar. Linha normal mostra valor + ícone ✏️. Botão "+ Adicionar manualmente" cria linha em branco em modo de edição.
3. **Gráficos** — 4 `<LineChart>` do recharts, visíveis apenas se `measurements.length > 0`: Peso, Abdômen, Cintura, Tirzepatida. Eixo X = semana, eixo Y = valor com unidade no label.

### `src/app/pacientes/[id]/page.tsx`
Busca medições do paciente com `listMeasurements(id)` e passa para `PatientDetailClient` como `initialMeasurements`.

## Fluxo de uso

```
Enfermeiro abre página do paciente
→ Clica na aba "Evolução"
→ Clica em "Enviar foto"
→ Seleciona foto da tabela preenchida
→ Sistema envia para API → Claude extrai → salva no banco
→ Tabela e gráficos atualizam automaticamente
→ (Opcional) Enfermeiro clica em ✏️ para corrigir um valor
```

## Tratamento de erros

- Foto ilegível ou campos não encontrados: toast de erro "Não foi possível extrair os dados. Tente uma foto mais nítida ou adicione manualmente."
- Falha de rede: mensagem genérica de erro
- Campos numéricos inválidos na edição manual: validação no frontend antes de salvar
