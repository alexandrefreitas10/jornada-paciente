import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  max: 10,
})

export async function initSchema() {
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

  // Tabela de templates de termos (globais)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS terms (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      file_data BYTEA,
      file_name TEXT,
      file_mime TEXT,
      fields JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT NOT NULL
    )
  `).catch(() => {})
  // Migração: se tiver file_s3_key, remover (vamos usar file_data)
  await sql.unsafe(`ALTER TABLE terms DROP COLUMN IF EXISTS file_s3_key`).catch(() => {})

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

  // Usuário administrador principal
  await sql.unsafe(`UPDATE users SET is_admin = TRUE WHERE username = '038.069.291-06'`).catch(() => {})
}

export default sql
