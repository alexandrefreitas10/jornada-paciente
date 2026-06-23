import sql, { initSchema } from './db'

export interface Term {
  id: number
  title: string
  content: string
  file_s3_key: string | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  created_at: string
  created_by: string
}

export interface TermInput {
  title: string
  content?: string
  fileS3Key?: string
  fileName?: string
  fileMime?: string
  fields?: string[]
  createdBy: string
}

export async function listTerms(): Promise<Term[]> {
  await initSchema()
  return sql<Term[]>`
    SELECT
      id, title, content, file_s3_key, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb)::text[]::jsonb AS fields,
      created_at, created_by
    FROM terms
    ORDER BY created_at DESC
  `
}

export async function getTerm(id: number): Promise<Term | null> {
  await initSchema()
  const [row] = await sql<Term[]>`
    SELECT
      id, title, content, file_s3_key, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb)::text[]::jsonb AS fields,
      created_at, created_by
    FROM terms
    WHERE id = ${id}
  `
  return row ?? null
}

export async function createTerm(input: TermInput): Promise<Term> {
  await initSchema()
  const [row] = await sql<Term[]>`
    INSERT INTO terms (title, content, file_s3_key, file_name, file_mime, fields, created_by)
    VALUES (
      ${input.title},
      ${input.content ?? ''},
      ${input.fileS3Key ?? null},
      ${input.fileName ?? null},
      ${input.fileMime ?? null},
      ${sql.json((input.fields ?? []) as never)},
      ${input.createdBy}
    )
    RETURNING
      id, title, content, file_s3_key, file_name, file_mime,
      COALESCE(fields, '[]'::jsonb)::text[]::jsonb AS fields,
      created_at, created_by
  `
  return row
}

export async function deleteTerm(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM terms WHERE id = ${id}`
}
