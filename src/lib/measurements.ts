import sql, { initSchema } from './db'

export interface Measurement {
  id: number
  patient_id: number
  week: number | null
  date: string | null
  weight: number | null
  abdominal_circumference: number | null
  waist_circumference: number | null
  tirzepatide_dose: number | null
  created_at: string
}

export interface MeasurementInput {
  week?: number | null
  date?: string | null
  weight?: number | null
  abdominal_circumference?: number | null
  waist_circumference?: number | null
  tirzepatide_dose?: number | null
}

export async function listMeasurements(patientId: number): Promise<Measurement[]> {
  await initSchema()
  const rows = await sql<Measurement[]>`
    SELECT * FROM weekly_measurements
    WHERE patient_id = ${patientId}
    ORDER BY week ASC NULLS LAST, created_at ASC
  `
  return rows
}

export async function createMeasurement(
  patientId: number,
  input: MeasurementInput
): Promise<Measurement> {
  await initSchema()

  // Se tem número de semana, faz upsert para não duplicar
  if (input.week != null) {
    const [row] = await sql<Measurement[]>`
      INSERT INTO weekly_measurements
        (patient_id, week, date, weight, abdominal_circumference, waist_circumference, tirzepatide_dose)
      VALUES
        (${patientId}, ${input.week}, ${input.date ?? null}, ${input.weight ?? null},
         ${input.abdominal_circumference ?? null}, ${input.waist_circumference ?? null},
         ${input.tirzepatide_dose ?? null})
      ON CONFLICT (patient_id, week) WHERE week IS NOT NULL DO UPDATE SET
        date = EXCLUDED.date,
        weight = EXCLUDED.weight,
        abdominal_circumference = EXCLUDED.abdominal_circumference,
        waist_circumference = EXCLUDED.waist_circumference,
        tirzepatide_dose = EXCLUDED.tirzepatide_dose
      RETURNING *
    `
    return row
  }

  // Sem semana definida, insere normalmente
  const [row] = await sql<Measurement[]>`
    INSERT INTO weekly_measurements
      (patient_id, week, date, weight, abdominal_circumference, waist_circumference, tirzepatide_dose)
    VALUES
      (${patientId}, ${null}, ${input.date ?? null}, ${input.weight ?? null},
       ${input.abdominal_circumference ?? null}, ${input.waist_circumference ?? null},
       ${input.tirzepatide_dose ?? null})
    RETURNING *
  `
  return row
}

export async function updateMeasurement(
  id: number,
  input: MeasurementInput
): Promise<Measurement> {
  await initSchema()
  const [row] = await sql<Measurement[]>`
    UPDATE weekly_measurements SET
      week = ${input.week ?? null},
      date = ${input.date ?? null},
      weight = ${input.weight ?? null},
      abdominal_circumference = ${input.abdominal_circumference ?? null},
      waist_circumference = ${input.waist_circumference ?? null},
      tirzepatide_dose = ${input.tirzepatide_dose ?? null}
    WHERE id = ${id}
    RETURNING *
  `
  return row
}

export async function deleteMeasurement(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM weekly_measurements WHERE id = ${id}`
}

export async function deleteAllMeasurements(patientId: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM weekly_measurements WHERE patient_id = ${patientId}`
}
