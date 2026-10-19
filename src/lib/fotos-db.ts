import sql, { initSchema } from './db'
import { ErroDeRegra, chaveDaPasta } from './fotos-regras'
import type { Identidade } from './montagem'

// Acesso ao banco da aba Fotos. Três tabelas: as pastas de quem não tem card,
// as fotos soltas dessas pastas, e as montagens já prontas.
//
// AVISO sobre os campos de data (`created_at`, `data_antes`, `data_depois`):
// eles estão declarados `string` por convenção da casa (`PatientFile` em
// `patient-files.ts` faz igual), mas o postgres.js devolve `Date` nas colunas
// TIMESTAMPTZ. O valor vira string ISO só ao passar por `NextResponse.json`, e
// continua `Date` quando uma página server passa a linha como prop para um
// componente cliente. Por isso quem consome NUNCA deve chamar método de string
// nesses campos (`.slice`, `.startsWith`): use `new Date(valor)`, que funciona
// nos dois casos.

export interface FotoPessoa {
  id: number
  nome: string
  chave_nome: string
  // chega como Date do banco (ver AVISO no topo): use new Date(valor)
  created_at: string
  created_by: string | null
}

export interface PastaComContagem extends FotoPessoa {
  fotos: number
}

export interface FotoAvulsa {
  id: number
  pessoa_id: number
  s3_key: string
  original_name: string
  // chega como Date do banco (ver AVISO no topo): use new Date(valor)
  created_at: string
  created_by: string | null
}

export interface Montagem {
  id: number
  patient_id: number | null
  pessoa_id: number | null
  nome: string
  identidade: Identidade
  s3_key: string
  s3_key_thumb: string
  // as três datas chegam como Date do banco (ver AVISO no topo): use new Date(valor)
  data_antes: string | null
  data_depois: string | null
  created_at: string
  created_by: string | null
}

/**
 * Acha-ou-cria a pasta pela chave normalizada. O `ON CONFLICT` é o que garante
 * a regra sob corrida: dois envios do mesmo nome ao mesmo tempo não podem virar
 * duas pastas. O `DO UPDATE` é um no-op proposital — serve só para o RETURNING
 * devolver a linha existente, e preserva o nome como foi digitado na primeira
 * vez (a pasta não é renomeável nesta versão).
 */
export async function acharOuCriarPessoa(nome: string, createdBy?: string | null): Promise<FotoPessoa> {
  await initSchema()
  const chave = chaveDaPasta(nome)
  const [row] = await sql<FotoPessoa[]>`
    INSERT INTO foto_pessoas (nome, chave_nome, created_by)
    VALUES (${nome.trim()}, ${chave}, ${createdBy ?? null})
    ON CONFLICT (chave_nome) DO UPDATE SET nome = foto_pessoas.nome
    RETURNING *
  `
  return row
}

export async function listarPessoas(): Promise<PastaComContagem[]> {
  await initSchema()
  return sql<PastaComContagem[]>`
    SELECT p.*, COUNT(f.id)::int AS fotos
    FROM foto_pessoas p
    -- O filtro de excluída fica no ON, e não no WHERE, de propósito: no WHERE
    -- ele apagaria da lista a pasta que teve TODAS as fotos excluídas, e ela
    -- tem de continuar aparecendo com 0 fotos.
    LEFT JOIN fotos_avulsas f ON f.pessoa_id = p.id AND f.deleted_at IS NULL
    GROUP BY p.id
    -- Ordena pela chave (minúscula, sem acento) e não pelo nome exibido: por
    -- nome a ordem depende da collation do banco, que joga acento e maiúscula
    -- para o fim e separaria "Ana" de "ana" na mesma tela.
    ORDER BY p.chave_nome
  `
}

/**
 * A pasta existe? A rota pergunta ANTES de subir a foto para o S3: um id bem
 * formado mas inexistente só estouraria no FK do INSERT, depois do upload,
 * deixando arquivo órfão no bucket que ninguém mais referencia.
 */
export async function acharPessoa(id: number): Promise<FotoPessoa | null> {
  await initSchema()
  const [row] = await sql<FotoPessoa[]>`SELECT * FROM foto_pessoas WHERE id = ${id}`
  return row ?? null
}

export async function criarFotoAvulsa(entrada: {
  pessoaId: number
  s3Key: string
  originalName: string
  createdBy?: string | null
}): Promise<FotoAvulsa> {
  await initSchema()
  const [row] = await sql<FotoAvulsa[]>`
    INSERT INTO fotos_avulsas (pessoa_id, s3_key, original_name, created_by)
    VALUES (${entrada.pessoaId}, ${entrada.s3Key}, ${entrada.originalName}, ${entrada.createdBy ?? null})
    RETURNING *
  `
  return row
}

export async function listarFotosAvulsas(pessoaId: number): Promise<FotoAvulsa[]> {
  await initSchema()
  return sql<FotoAvulsa[]>`
    SELECT * FROM fotos_avulsas
    WHERE pessoa_id = ${pessoaId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `
}

/** Nunca devolve foto excluída: um "excluído" não pode ser servido nem baixado
 *  (mesma regra de `getFileById` em `patient-files.ts`). */
export async function acharFotoAvulsa(id: number): Promise<FotoAvulsa | null> {
  await initSchema()
  const [row] = await sql<FotoAvulsa[]>`
    SELECT * FROM fotos_avulsas WHERE id = ${id} AND deleted_at IS NULL
  `
  return row ?? null
}

export async function softDeleteFotoAvulsa(id: number): Promise<boolean> {
  await initSchema()
  const linhas = await sql`
    UPDATE fotos_avulsas SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `
  return linhas.length > 0
}

/**
 * Grava a montagem. O `nome` é CÓPIA do nome na hora, resolvida aqui no
 * servidor: a galeria tem de continuar legível se o card do paciente for
 * arquivado, e os componentes do card recebem só o id do paciente, nunca o
 * nome. Pessoa que não existe é erro alto, não um "Sem nome" silencioso.
 */
export async function criarMontagem(entrada: {
  patientId: number | null
  pessoaId: number | null
  identidade: Identidade
  s3Key: string
  s3KeyThumb: string
  dataAntes: string | null
  dataDepois: string | null
  createdBy?: string | null
}): Promise<Montagem> {
  await initSchema()
  const nome = entrada.patientId != null
    ? (await sql<{ name: string }[]>`SELECT name FROM patients WHERE id = ${entrada.patientId}`)[0]?.name
    : (await sql<{ nome: string }[]>`SELECT nome FROM foto_pessoas WHERE id = ${entrada.pessoaId}`)[0]?.nome
  if (!nome) throw new ErroDeRegra('Pessoa da montagem não encontrada')

  const [row] = await sql<Montagem[]>`
    INSERT INTO antes_depois
      (patient_id, pessoa_id, nome, identidade, s3_key, s3_key_thumb, data_antes, data_depois, created_by)
    VALUES (
      ${entrada.patientId}, ${entrada.pessoaId}, ${nome}, ${entrada.identidade},
      ${entrada.s3Key}, ${entrada.s3KeyThumb}, ${entrada.dataAntes}, ${entrada.dataDepois},
      ${entrada.createdBy ?? null}
    )
    RETURNING *
  `
  return row
}

export async function listarMontagens(): Promise<Montagem[]> {
  await initSchema()
  return sql<Montagem[]>`
    SELECT * FROM antes_depois WHERE deleted_at IS NULL ORDER BY created_at DESC
  `
}

export async function acharMontagem(id: number): Promise<Montagem | null> {
  await initSchema()
  const [row] = await sql<Montagem[]>`
    SELECT * FROM antes_depois WHERE id = ${id} AND deleted_at IS NULL
  `
  return row ?? null
}

export async function softDeleteMontagem(id: number): Promise<boolean> {
  await initSchema()
  const linhas = await sql`
    UPDATE antes_depois SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `
  return linhas.length > 0
}
