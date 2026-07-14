import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  max: 10,
})

// Memoiza a migração: roda UMA vez por processo, não em toda request.
// Em falha, zera o cache para tentar de novo na próxima chamada.
let schemaReady: Promise<void> | null = null
export function initSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runMigrations().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

async function runMigrations() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS task_completions (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, task_key)
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS patient_files (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      file_type TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE patient_files ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE patient_files ADD COLUMN IF NOT EXISTS created_by TEXT;
    ALTER TABLE patient_files ADD COLUMN IF NOT EXISTS summary_status TEXT;
    ALTER TABLE patient_files ADD COLUMN IF NOT EXISTS summary_error TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by TEXT;
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
  `)

  // Remove duplicatas de semana mantendo o registro de maior id (mais recente)
  await sql.unsafe(`
    DELETE FROM weekly_measurements
    WHERE week IS NOT NULL
      AND id NOT IN (
        SELECT MAX(id)
        FROM weekly_measurements
        WHERE week IS NOT NULL
        GROUP BY patient_id, week
      );
  `).catch(() => {})

  // Cria índice único por paciente+semana (ignora se já existe)
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS weekly_measurements_patient_week_idx
    ON weekly_measurements (patient_id, week)
    WHERE week IS NOT NULL;
  `).catch(() => {})

  // Tabela de resumos de consulta com IA
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS evolution_summaries (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      audio_s3_key TEXT,
      audio_name TEXT,
      transcription TEXT NOT NULL,
      summary JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(() => {})

  // Adiciona coluna is_admin aos usuários
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`).catch(() => {})
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS can_estoque BOOLEAN DEFAULT FALSE`).catch(() => {})

  // Tabela de templates de termos (globais)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS terms (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      file_s3_key TEXT,
      file_name TEXT,
      file_mime TEXT,
      fields JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT NOT NULL
    )
  `).catch(() => {})
  // Migração: remover file_data antigo e garantir file_s3_key
  await sql.unsafe(`ALTER TABLE terms DROP COLUMN IF EXISTS file_data`).catch(() => {})
  await sql.unsafe(`ALTER TABLE terms ADD COLUMN IF NOT EXISTS file_s3_key TEXT`).catch(() => {})

  // Tabela de termos para assinatura
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_terms (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      file_s3_key TEXT,
      file_name TEXT,
      file_mime TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      signer_name TEXT,
      signature_data TEXT,
      sign_token TEXT UNIQUE
    )
  `).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS file_data BYTEA`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS file_name TEXT`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS file_mime TEXT`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS original_s3_key TEXT`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS filled_fields JSONB DEFAULT '{}'`).catch(() => {})
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS signed_file_s3_key TEXT`).catch(() => {})
  // Hash de integridade do arquivo assinado (detecta troca do PDF no S3)
  await sql.unsafe(`ALTER TABLE patient_terms ADD COLUMN IF NOT EXISTS signed_file_sha256 TEXT`).catch(() => {})

  // Tabela de observações por aba
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_tab_notes (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      tab TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Soft delete em pacientes
  await sql.unsafe(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {})
  // Arquivamento de pacientes (saíram do tratamento mas dados preservados)
  await sql.unsafe(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`).catch(() => {})

  // Registro de auditoria de exclusões
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      patient_id INTEGER,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Coluna de dados apagados no audit_log (para restauração)
  await sql.unsafe(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS deleted_data JSONB`).catch(() => {})

  // Soft-delete em arquivos de pacientes (mantém S3 para restauração)
  await sql.unsafe(`ALTER TABLE patient_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {})

  await sql.unsafe(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_by TEXT`).catch(() => {})

  // Usuário administrador principal
  await sql.unsafe(`UPDATE users SET is_admin = TRUE WHERE username = '038.069.291-06'`).catch(() => {})

  // Estoque: itens (catálogo de medicações)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'un',
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Estoque: movimentações (entradas e saídas)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      lot TEXT,
      expiry_date TEXT,
      patient_id INTEGER,
      patient_name TEXT,
      observation TEXT,
      nf_s3_key TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await sql.unsafe(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS patient_id INTEGER`).catch(() => {})
  await sql.unsafe(`ALTER TABLE stock_movements ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric`).catch(() => {})
  await sql.unsafe(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS measurement_id INTEGER`).catch(() => {})
  // Idempotência: evita movimento duplicado por duplo clique / retry
  await sql.unsafe(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS idempotency_key UUID`).catch(() => {})
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idem_idx ON stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL`).catch(() => {})
  // Índices de performance para o cálculo de saldo e listagens
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON stock_movements(item_id)`).catch(() => {})
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS stock_movements_patient_idx ON stock_movements(patient_id)`).catch(() => {})

  // Log de entradas de estoque (NF, importação, manual)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS stock_entry_logs (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      original_filename TEXT,
      s3_key TEXT,
      item_count INT DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Implantes hormonais
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS implants (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      patient_name TEXT NOT NULL,
      last_implant_date DATE NOT NULL,
      notes TEXT,
      items_used JSONB DEFAULT '[]',
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Adicionar coluna items_used se não existir (para tabelas já criadas)
  await sql.unsafe(`
    ALTER TABLE implants ADD COLUMN IF NOT EXISTS items_used JSONB DEFAULT '[]'
  `).catch(() => {})

  // Estética: procedimentos estéticos
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS aesthetic_sessions (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      procedure_name TEXT NOT NULL,
      total_sessions INTEGER NOT NULL DEFAULT 1,
      sessions_per_week INTEGER NOT NULL DEFAULT 1,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      region TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Estética: sessões concluídas
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS aesthetic_session_completions (
      id SERIAL PRIMARY KEY,
      aesthetic_session_id INTEGER NOT NULL REFERENCES aesthetic_sessions(id) ON DELETE CASCADE,
      session_number INTEGER NOT NULL,
      observation TEXT,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(aesthetic_session_id, session_number)
    )
  `).catch(() => {})
  await sql.unsafe(`ALTER TABLE aesthetic_session_completions ADD COLUMN IF NOT EXISTS observation TEXT`).catch(() => {})

  // Arquivamento de implantes (pacientes antigos)
  await sql.unsafe(`ALTER TABLE implants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`).catch(() => {})

  // Medidas dos procedimentos estéticos
  await sql.unsafe(`ALTER TABLE aesthetic_sessions ADD COLUMN IF NOT EXISTS initial_measurements JSONB DEFAULT '[]'`).catch(() => {})
  await sql.unsafe(`ALTER TABLE aesthetic_session_completions ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '[]'`).catch(() => {})

  // Portal do paciente
  await sql.unsafe(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT`).catch(() => {})
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_users (
      id               SERIAL PRIMARY KEY,
      patient_id       INTEGER UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      email            TEXT UNIQUE NOT NULL,
      password_hash    TEXT,
      invite_token     UUID UNIQUE,
      invite_used_at   TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // NPS e ouvidoria do portal do paciente
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_nps (
      id          SERIAL PRIMARY KEY,
      patient_id  INTEGER UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
      comment     TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_feedback (
      id          SERIAL PRIMARY KEY,
      patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  // Rate-limiting de login (multi-instância): contador + lockout por (scope, identifier)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      scope         TEXT NOT NULL,
      identifier    TEXT NOT NULL,
      fail_count    INTEGER NOT NULL DEFAULT 0,
      first_fail_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_fail_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_until  TIMESTAMPTZ,
      PRIMARY KEY (scope, identifier)
    )
  `).catch(() => {})
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS login_attempts_last_fail_idx ON login_attempts(last_fail_at)`).catch(() => {})
  // Retenção: lockouts duram 15 min, então linhas com >1 dia são lixo
  await sql.unsafe(`DELETE FROM login_attempts WHERE last_fail_at < NOW() - INTERVAL '1 day'`).catch(() => {})

  // Observabilidade: falhas silenciosas relevantes (resumo IA, S3 órfão, auditoria)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS system_errors (
      id         SERIAL PRIMARY KEY,
      source     TEXT NOT NULL,
      message    TEXT NOT NULL,
      context    JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS system_errors_created_idx ON system_errors(created_at DESC)`).catch(() => {})
  // Retenção: mantém ~90 dias de erros do sistema (roda 1x por boot do processo)
  await sql.unsafe(`DELETE FROM system_errors WHERE created_at < NOW() - INTERVAL '90 days'`).catch(() => {})

  // FKs faltantes em stock_movements (ON DELETE SET NULL — preserva o histórico
  // e o patient_name denormalizado; patients é soft-delete, CASCADE não cabe).
  // Limpa órfãos ANTES e guarda contra recriação da constraint (pg_constraint).
  await sql.unsafe(`
    DO $$
    BEGIN
      UPDATE stock_movements SET patient_id = NULL
        WHERE patient_id IS NOT NULL AND patient_id NOT IN (SELECT id FROM patients);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_movements_patient') THEN
        ALTER TABLE stock_movements
          ADD CONSTRAINT fk_stock_movements_patient
          FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {})
  await sql.unsafe(`
    DO $$
    BEGIN
      UPDATE stock_movements SET measurement_id = NULL
        WHERE measurement_id IS NOT NULL AND measurement_id NOT IN (SELECT id FROM weekly_measurements);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_movements_measurement') THEN
        ALTER TABLE stock_movements
          ADD CONSTRAINT fk_stock_movements_measurement
          FOREIGN KEY (measurement_id) REFERENCES weekly_measurements(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {})
}

export default sql
