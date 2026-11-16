import fs from 'fs'
import path from 'path'

/**
 * As telas da AGENDA não alcançam o banco pelos imports.
 *
 * POR QUE: `src/lib/db.ts` chama `postgres(...)` no topo do módulo. A
 * convenção deste projeto, escrita em `src/lib/training/pricing.ts` e em
 * `src/lib/agenda-rotulos.ts`, é que componente de tela importe de módulo
 * puro, e só `import type` do que vive junto do banco. A sub-aba de Relatórios
 * nasceu quebrando essa convenção e este teste é o que impede a volta.
 *
 * **O ESCOPO É DELIBERADAMENTE ESTREITO, e vale explicar por quê.** A primeira
 * versão deste teste varria TODOS os `'use client'` do projeto e acusou oito
 * componentes antigos — `EvolutionTab`, `ExamsTab`, `AuditoriaClient`,
 * `DeletedItemsButton` e outros — que chegam a `lib/db` por `lib/audit` ou
 * `lib/measurements`. Todos esses estão em produção, em uso diário, e o build
 * do Render passa. Ou seja: a previsão de que essa cadeia QUEBRA o build não
 * se sustenta contra a evidência do próprio projeto.
 *
 * Então este teste guarda uma CONVENÇÃO, não uma catástrofe. Alargá-lo para o
 * projeto inteiro exigiria antes decidir o que fazer com aqueles oito, e isso
 * é trabalho à parte — com um build isolado para medir o tamanho real do
 * pacote, não com um palpite.
 *
 * `import type` é seguro (some na compilação), então conta só valor.
 */

const RAIZ = path.join(__dirname, '..', '..', 'src')
const PROIBIDO = 'lib/db'

function arquivosDe(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name)
    if (entrada.isDirectory()) achados.push(...arquivosDe(caminho))
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho)
  }
  return achados
}

const TODOS = arquivosDe(RAIZ)
const conteudo = new Map(TODOS.map((f) => [f, fs.readFileSync(f, 'utf8')]))

/**
 * Tira comentários antes de procurar imports.
 *
 * Sem isto o detector encontra a palavra "import" dentro de um comentário e
 * casa com a primeira string que aparecer depois — foi o que aconteceu na
 * primeira versão deste teste, que acusou `agenda-grade.ts` de importar o
 * banco por causa de um comentário que FALA sobre importar.
 */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Imports de VALOR (`import type` e `import { type X }` não contam). */
function importesDeValor(textoCru: string): string[] {
  const texto = semComentarios(textoCru)
  const achados: string[] = []
  const re = /import\s+(?!type\s)([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const clausula = m[1]
    // `import { type A, type B } from 'x'` é só tipo, apesar de não começar
    // com `type`. Só conta se houver algum nome importado sem o prefixo.
    const chaves = clausula.match(/\{([^}]*)\}/)
    if (chaves) {
      const nomes = chaves[1].split(',').map((n) => n.trim()).filter(Boolean)
      const temValor = nomes.some((n) => !n.startsWith('type '))
      const temAlgoForaDasChaves = clausula.replace(/\{[^}]*\}/, '').replace(/[,\s]/g, '') !== ''
      if (!temValor && !temAlgoForaDasChaves) continue
    }
    achados.push(m[2])
  }
  return achados
}

/** Resolve '@/lib/x' e './x' para o arquivo real, se existir dentro de src. */
function resolver(deOndeVem: string, especificador: string): string | null {
  let base: string
  if (especificador.startsWith('@/')) base = path.join(RAIZ, especificador.slice(2))
  else if (especificador.startsWith('.')) base = path.resolve(path.dirname(deOndeVem), especificador)
  else return null
  for (const tentativa of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (conteudo.has(tentativa)) return tentativa
  }
  return null
}

/** Caminho de imports de valor até `lib/db`, ou null se não houver. */
function caminhoAteOBanco(inicio: string): string[] | null {
  const vistos = new Set<string>()
  const fila: { arquivo: string; trilha: string[] }[] = [{ arquivo: inicio, trilha: [inicio] }]
  while (fila.length) {
    const { arquivo, trilha } = fila.shift()!
    if (vistos.has(arquivo)) continue
    vistos.add(arquivo)
    for (const especificador of importesDeValor(conteudo.get(arquivo) ?? '')) {
      const destino = resolver(arquivo, especificador)
      if (!destino) continue
      const relativo = path.relative(RAIZ, destino).replace(/\\/g, '/')
      if (relativo === PROIBIDO + '.ts' || relativo === PROIBIDO + '.tsx') {
        return [...trilha, destino]
      }
      fila.push({ arquivo: destino, trilha: [...trilha, destino] })
    }
  }
  return null
}

/** As telas e módulos desta entrega. Caminhos relativos a `src/`. */
const DA_AGENDA = [
  'app/relatorios/Agendamentos.tsx',
  'app/agenda/AgendaClient.tsx',
  'lib/agenda-relatorio.ts',
  'lib/agenda-rotulos.ts',
  'lib/agenda-grade.ts',
  'lib/agenda-status.ts',
]

describe('as telas da agenda não alcançam o banco', () => {
  it('o detector enxerga os arquivos que deveria', () => {
    // Sem isto, um erro de caminho faria o teste passar por não achar nada —
    // e um teste que não pode falhar não prova coisa alguma. Foi assim que a
    // primeira versão acusou um comentário como se fosse um import.
    for (const relativo of DA_AGENDA) {
      expect(conteudo.has(path.join(RAIZ, relativo))).toBe(true)
    }
  })

  it('o detector ignora `import type` e comentários', () => {
    const falso = `
      // isto fala de import ... from '@/lib/db' mas é comentário
      /* e isto também: import x from '@/lib/db' */
      import type { Coisa } from '@/lib/db'
      import { type SoTipo } from '@/lib/db'
      import { deVerdade } from '@/lib/feriados'
    `
    expect(importesDeValor(falso)).toEqual(['@/lib/feriados'])
  })

  it.each(DA_AGENDA)('%s não chega em lib/db', (relativo) => {
    const caminho = caminhoAteOBanco(path.join(RAIZ, relativo))
    const trilha = caminho?.map((f) => path.relative(RAIZ, f).replace(/\\/g, '/')).join('\n  → ')
    expect(trilha ?? null).toBeNull()
  })
})
