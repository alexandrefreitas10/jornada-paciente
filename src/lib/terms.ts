import sql, { initSchema } from './db'

export interface Term {
  id: number
  title: string
  content: string
  file_data: Buffer | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  created_at: string
  created_by: string
}

export interface TermInput {
  title: string
  content?: string
  fileData?: Buffer
  fileName?: string
  fileMime?: string
  fields?: string[]
  createdBy: string
}

export async function listTerms(): Promise<Term[]> {
  await initSchema()
  const rows = await sql<any[]>`
    SELECT
      id, title, content, file_data, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb) AS fields,
      created_at, created_by
    FROM terms
    ORDER BY created_at DESC
  `
  return rows.map(r => ({
    ...r,
    fields: Array.isArray(r.fields) ? r.fields : (typeof r.fields === 'string' ? JSON.parse(r.fields) : []),
  }))
}

export async function getTerm(id: number): Promise<Term | null> {
  await initSchema()
  const [row] = await sql<any[]>`
    SELECT
      id, title, content, file_data, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb) AS fields,
      created_at, created_by
    FROM terms
    WHERE id = ${id}
  `
  if (!row) return null
  return {
    ...row,
    fields: Array.isArray(row.fields) ? row.fields : (typeof row.fields === 'string' ? JSON.parse(row.fields) : []),
  }
}

export async function createTerm(input: TermInput): Promise<Term> {
  await initSchema()
  const [row] = await sql<any>`
    INSERT INTO terms (title, content, file_data, file_name, file_mime, fields, created_by)
    VALUES (
      ${input.title},
      ${input.content ?? ''},
      ${input.fileData ?? null},
      ${input.fileName ?? null},
      ${input.fileMime ?? null},
      ${sql.json((input.fields ?? []) as never)},
      ${input.createdBy}
    )
    RETURNING
      id, title, content, file_data, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb) AS fields,
      created_at, created_by
  `
  return {
    ...row,
    fields: Array.isArray(row.fields) ? row.fields : (typeof row.fields === 'string' ? JSON.parse(row.fields) : []),
  }
}

export async function deleteTerm(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM terms WHERE id = ${id}`
}
