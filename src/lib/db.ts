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

  // Usuário administrador principal
  await sql.unsafe(`UPDATE users SET is_admin = TRUE WHERE username = '038.069.291-06'`).catch(() => {})
}

export default sql
