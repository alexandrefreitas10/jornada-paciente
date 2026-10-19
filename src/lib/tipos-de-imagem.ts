// Lista FECHADA dos tipos de imagem da aba Fotos, usada pelo upload e pela rota
// que serve a foto. Mora num arquivo só para as duas não divergirem: se o
// upload aceitasse um formato que a rota de imagem não conhece, a foto entraria
// e depois não abriria.
//
// POR QUE lista fechada, e não `file.type.startsWith('image/')`:
// `image/svg+xml` também começa com `image/`, mas SVG não é foto — é documento,
// e pode conter `<script>`. A rota `[fid]/imagem` serve o arquivo INLINE na
// PRÓPRIA ORIGEM do sistema, então um SVG com script enviado por um login da
// equipe rodaria no navegador de outro login da equipe, na nossa origem, com a
// sessão dele — escalada de um usuário para o dono. NÃO troque isto de volta
// por `startsWith('image/')`.
//
// Os três formatos são o que o dono usa de verdade: as fotos vêm do celular.
const TIPOS_DE_IMAGEM = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type TipoDeImagem = keyof typeof TIPOS_DE_IMAGEM

/** Texto da mensagem de erro, para o usuário saber o que serve. */
export const FORMATOS_ACEITOS = 'JPEG, PNG ou WebP'

/**
 * Valor pronto para o `accept` do `<input type="file">`, derivado da MESMA lista
 * que o servidor usa. É derivado, e não escrito à mão, para os dois lados nunca
 * divergirem: quem acrescentar um formato aqui já muda o seletor de arquivo do
 * navegador junto com a validação do upload.
 *
 * O `accept` é conveniência do seletor, não segurança — o navegador deixa o
 * usuário escolher "todos os arquivos" e o campo pode ser burlado. Quem decide
 * continua sendo a checagem do servidor.
 */
export const ACCEPT_IMAGENS = Object.keys(TIPOS_DE_IMAGEM).join(',')

/** A extensão da chave do S3 vem DAQUI, nunca de `file.name`: o nome do arquivo
 *  é texto do cliente e não tem lugar numa chave do S3. */
export function extensaoDoTipo(tipo: TipoDeImagem): string {
  return TIPOS_DE_IMAGEM[tipo]
}

/** O tipo declarado pelo cliente, se estiver na lista. Content-Type pode vir com
 *  parâmetro (`image/jpeg; charset=...`), então compara só a parte base. */
export function tipoDeImagemDeclarado(tipo: string | null | undefined): TipoDeImagem | null {
  const base = (tipo ?? '').split(';')[0].trim().toLowerCase()
  return base in TIPOS_DE_IMAGEM ? (base as TipoDeImagem) : null
}

/**
 * O tipo que os BYTES dizem ser. `file.type` vem do cliente e pode mentir, logo
 * é a assinatura real do começo do arquivo que decide o que gravamos e o que
 * servimos depois.
 *
 * Não exigimos que a assinatura concorde com o tipo declarado de propósito: foto
 * renomeada (um PNG salvo como `.jpg`) é comum e não é ataque — o que importa é
 * que o conteúdo seja uma das três imagens da lista.
 */
export function tipoDeImagemDosBytes(bytes: Uint8Array): TipoDeImagem | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) {
    return 'image/png'
  }
  // WebP: "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

/**
 * O Content-Type com que a foto pode ser servida inline.
 *
 * Nunca devolvemos o tipo guardado no S3 direto: se por qualquer caminho (nota
 * antiga, importação, erro futuro) houver um objeto com `image/svg+xml` lá, a
 * rota não pode ser o que faz o navegador executá-lo. Fora da lista, cai em
 * `application/octet-stream`, que o navegador baixa em vez de renderizar.
 */
export function contentTypeSeguro(tipo: string | null | undefined): string {
  return tipoDeImagemDeclarado(tipo) ?? 'application/octet-stream'
}

function ascii(bytes: Uint8Array, inicio: number, fim: number): string {
  return String.fromCharCode(...bytes.subarray(inicio, fim))
}
