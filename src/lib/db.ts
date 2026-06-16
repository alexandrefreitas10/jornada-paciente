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
    -- Remove duplicatas de semana, mantendo o registro mais recente
    DELETE FROM weekly_measurements a
    USING weekly_measurements b
    WHERE a.patient_id = b.patient_id
      AND a.week = b.week
      AND a.week IS NOT NULL
      AND a.id < b.id;
    -- Adiciona constraint única após limpeza
    ALTER TABLE weekly_measurements DROP CONSTRAINT IF EXISTS weekly_measurements_patient_week_unique;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weekly_measurements_patient_week_unique'
      ) THEN
        ALTER TABLE weekly_measurements ADD CONSTRAINT weekly_measurements_patient_week_unique UNIQUE (patient_id, week);
      END IF;
    END $$;
  `)
}

export default sql
