import sql, { initSchema } from './db'

export interface SummaryTopics {
  objetivos_principais: string
  tratamentos_anteriores: string
  queixas_principais: string
  qualidade_sono: string
  intestino: string
  libido: string
  padrao_alimentar: string
  atividade_fisica: string
  doencas_previas_cirurgias: string
  medicacao_suplementos: string
}

export interface EvolutionSummary {
  id: number
  patient_id: number
  audio_s3_key: string | null
  audio_name: string | null
  transcription: string
  summary: SummaryTopics
  created_at: string
}

export async function listEvolutionSummaries(patientId: number): Promise<EvolutionSummary[]> {
  await initSchema()
  return sql<EvolutionSummary[]>`
    SELECT * FROM evolution_summaries
    WHERE patient_id = ${patientId}
    ORDER BY created_at DESC
  `
}

export async function createEvolutionSummary(
  patientId: number,
  transcription: string,
  summary: SummaryTopics,
  audioS3Key?: string | null,
  audioName?: string | null,
): Promise<EvolutionSummary> {
  await initSchema()
  const [row] = await sql<EvolutionSummary[]>`
    INSERT INTO evolution_summaries (patient_id, transcription, summary, audio_s3_key, audio_name)
    VALUES (${patientId}, ${transcription}, ${JSON.stringify(summary)}, ${audioS3Key ?? null}, ${audioName ?? null})
    RETURNING *
  `
  return row
}

export async function deleteEvolutionSummary(id: number): Promise<void> {
  await initSchema()
  const [row] = await sql<{ audio_s3_key: string | null }[]>`
    DELETE FROM evolution_summaries WHERE id = ${id} RETURNING audio_s3_key
  `
  // Retorna a s3_key para que a rota possa deletar do S3 se necessário
  return row?.audio_s3_key ? undefined : undefined
}

export async function getEvolutionSummaryById(id: number): Promise<EvolutionSummary | null> {
  await initSchema()
  const [row] = await sql<EvolutionSummary[]>`SELECT * FROM evolution_summaries WHERE id = ${id}`
  return row ?? null
}

export async function getEvolutionSummaryAudioKey(id: number): Promise<string | null> {
  await initSchema()
  const [row] = await sql<{ audio_s3_key: string | null }[]>`
    SELECT audio_s3_key FROM evolution_summaries WHERE id = ${id}
  `
  return row?.audio_s3_key ?? null
}
