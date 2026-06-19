import sql, { initSchema } from './db'

export interface TabNote {
  id: number
  patient_id: number
  tab: string
  content: string
  created_by: string
  created_at: string
}

export async function listTabNotes(patientId: number, tab: string): Promise<TabNote[]> {
  await initSchema()
  return sql<TabNote[]>`
    SELECT * FROM patient_tab_notes
    WHERE patient_id = ${patientId} AND tab = ${tab}
    ORDER BY created_at ASC
  `
}

export async function createTabNote(patientId: number, tab: string, content: string, createdBy: string): Promise<TabNote> {
  await initSchema()
  const [row] = await sql<TabNote[]>`
    INSERT INTO patient_tab_notes (patient_id, tab, content, created_by)
    VALUES (${patientId}, ${tab}, ${content}, ${createdBy})
    RETURNING *
  `
  return row
}

export async function deleteTabNote(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM patient_tab_notes WHERE id = ${id}`
}
