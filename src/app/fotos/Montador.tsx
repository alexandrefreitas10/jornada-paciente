'use client'

import { useEffect, useRef, useState } from 'react'
import { CropEditor, FULL_CROP, type CropRect } from '@/components/CropEditor'
import { chaveNome } from '@/lib/implantes'
import { ACCEPT_IMAGENS } from '@/lib/tipos-de-imagem'
import { baixarBlob, gerarMontagem, salvarMontagem } from '@/lib/montagem-canvas'
import type { FotoAvulsa, FotoPessoa, Montagem } from '@/lib/fotos-db'
// As funções de data vêm da tela (e não copiadas para cá) para a aba inteira
// formatar data do mesmo jeito, com o fuso de Brasília explícito. `MontadorProps`
// é só tipo, apagado na compilação.
import { fmtDataHora, isoDaData, type MontadorProps } from './compartilhado'

/**
 * Uma foto que pode entrar na montagem, já normalizada. As duas origens têm
 * rotas e campos diferentes (card do paciente × pasta de quem não tem card) e o
 * resto do montador não precisa saber de qual delas a foto veio.
 */
interface FotoEscolhivel {
  id: number
  /**
   * Rota da PRÓPRIA ORIGEM, usada na miniatura, no enquadramento e no canvas.
   * Nunca a `url` assinada do S3 que o GET do paciente devolve junto: ela expira
   * em 15 minutos e, por ser de outro domínio, suja o canvas e faz o `toBlob`
   * lançar erro de segurança no fim do processo (ver `@/lib/montagem-canvas`).
   */
  url: string
  /** `created_at` da foto. Chega string pelo `fetch`, mas pode ser `Date` — por
   *  isso nunca método de string aqui, só `new Date(valor)`. */
  data: string | Date
  nome: string
}

type Origem =
  | { tipo: 'paciente'; id: number; nome: string }
  | { tipo: 'pessoa'; id: number; nome: string }

type Passo = 1 | 2 | 3 | 4

const TITULOS: Record<Passo, string> = {
  1: 'De quem é?',
  2: 'As duas fotos',
  3: 'Enquadrar',
  4: 'Resultado',
}

/** Milissegundos da data, com data impossível caindo em 0 em vez de `NaN` — que
 *  no `sort` embaralharia a lista inteira em vez de jogar a linha para o fim. */
function emMs(valor: string | Date): number {
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function maisRecentePrimeiro(lista: FotoEscolhivel[]): FotoEscolhivel[] {
  return [...lista].sort((a, b) => emMs(b.data) - emMs(a.data))
}

async function listaDaRota(url: string): Promise<unknown[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Rota devolveu erro')
  const dados = await res.json()
  // Rota com erro responde `{ error }`, não lista: sem esta guarda o `.map`
  // abaixo estouraria com um TypeError sem mensagem para o usuário.
  return Array.isArray(dados) ? dados : []
}

/**
 * As fotos que já estão no card do paciente: as duas abas que guardam foto
 * (`photo`, do acompanhamento, e `estetica`) juntas numa lista só, mais recente
 * primeiro. O dono escolhe o antes numa e o depois na outra sem pensar em aba.
 */
async function fotosDoPaciente(patientId: number): Promise<FotoEscolhivel[]> {
  const deUmTipo = async (tipo: 'photo' | 'estetica') => {
    const linhas = await listaDaRota(`/api/patients/${patientId}/files?type=${tipo}`)
    return (linhas as { id: number; created_at: string; original_name?: string }[]).map(f => ({
      id: f.id,
      url: `/api/patients/${patientId}/files/${f.id}/download?proxy=1`,
      data: f.created_at,
      nome: f.original_name ?? 'foto',
    }))
  }
  const [photo, estetica] = await Promise.all([deUmTipo('photo'), deUmTipo('estetica')])
  return maisRecentePrimeiro([...photo, ...estetica])
}

/** As fotos soltas da pasta de quem não tem card. */
async function fotosDaPasta(pessoaId: number): Promise<FotoEscolhivel[]> {
  const linhas = (await listaDaRota(`/api/fotos/pessoas/${pessoaId}/fotos`)) as FotoAvulsa[]
  return maisRecentePrimeiro(linhas.map(f => paraEscolhivel(pessoaId, f)))
}

function paraEscolhivel(pessoaId: number, f: FotoAvulsa): FotoEscolhivel {
  return {
    id: f.id,
    url: `/api/fotos/pessoas/${pessoaId}/fotos/${f.id}/imagem`,
    data: f.created_at,
    nome: f.original_name,
  }
}

/**
 * Carrega a imagem pela nossa rota e só resolve no `onload`. O `fetch` + blob
 * local é o mesmo caminho do card (`FilesTab`): garante que a imagem chegou
 * inteira antes de o canvas tentar desenhá-la.
 */
function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Imagem não veio')
        return res.blob()
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => { resolve(img); URL.revokeObjectURL(blobUrl) }
        img.onerror = () => { reject(new Error('Imagem não carregou')); URL.revokeObjectURL(blobUrl) }
        img.src = blobUrl
      })
      .catch(reject)
  })
}

/** A prévia com o recorte aplicado, igual à do card: mesma conta de porcentagem
 *  sobre a imagem inteira, para o dono ver antes de baixar o que vai sair. */
function PreviaRecortada({ url, recorte, alt }: { url: string; recorte: CropRect; alt: string }) {
  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden"
      style={{ position: 'relative', paddingBottom: `${(recorte.h / recorte.w) * 100}%` }}
    >
      <img
        src={url}
        alt={alt}
        draggable={false}
        style={{
          position: 'absolute',
          left: `${(-recorte.x / recorte.w) * 100}%`,
          top: `${(-recorte.y / recorte.h) * 100}%`,
          width: `${100 / recorte.w}%`,
        }}
      />
    </div>
  )
}

export default function Montador({ pacientes, pessoas, pessoaInicial, onPronto, onFechar }: MontadorProps) {
  // Abriu de dentro de uma pasta ("Montar antes e depois"): o passo 1 já está
  // respondido, começa escolhendo as fotos.
  const pastaInicial = pessoaInicial != null ? pessoas.find(p => p.id === pessoaInicial) : undefined

  const [passo, setPasso] = useState<Passo>(pastaInicial ? 2 : 1)
  const [origem, setOrigem] = useState<Origem | null>(
    pastaInicial ? { tipo: 'pessoa', id: pastaInicial.id, nome: pastaInicial.nome } : null,
  )

  // Passo 1
  const [buscaPaciente, setBuscaPaciente] = useState('')
  const [nomeNovo, setNomeNovo] = useState('')
  const [criandoPasta, setCriandoPasta] = useState(false)

  // Passo 2
  const [fotos, setFotos] = useState<FotoEscolhivel[]>([])
  const [carregando, setCarregando] = useState(false)
  const [selecionadas, setSelecionadas] = useState<number[]>([])
  const [enviando, setEnviando] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  // Passos 3 e 4 — as duas fotos ficam congeladas aqui, e não lidas da grade:
  // enviar uma foto nova no meio do caminho não pode trocar o que está sendo
  // enquadrado.
  const [escolhidas, setEscolhidas] = useState<FotoEscolhivel[]>([])
  const [recortes, setRecortes] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])
  const [recortesFinais, setRecortesFinais] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])

  const [erro, setErro] = useState<string | null>(null)

  // Montagem guardada. Enquanto `montagemId` for null o próximo clique grava;
  // depois disso o clique só baixa de novo, porque é a MESMA montagem e não uma
  // nova. Voltar para o enquadramento zera o id (ver `zerarMontagem`).
  const [montagemId, setMontagemId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroMontagem, setErroMontagem] = useState<string | null>(null)
  // O PNG já gerado fica aqui para o "tentar de novo" repetir SÓ o POST: ele não
  // deve desenhar nem baixar outra vez, o dono já está com o arquivo na mão.
  const montagemPendente = useRef<{ png: Blob; thumb: Blob; dataAntes: string; dataDepois: string } | null>(null)

  // Carrega as fotos da origem escolhida. `cancelado` descarta a resposta de uma
  // origem que o dono já trocou — senão a lista antiga chega depois e aparece
  // debaixo do nome novo.
  useEffect(() => {
    if (!origem) return
    let cancelado = false
    setCarregando(true)
    setErro(null)
    setFotos([])
    setSelecionadas([])
    const buscar = origem.tipo === 'paciente' ? fotosDoPaciente(origem.id) : fotosDaPasta(origem.id)
    buscar
      .then(lista => { if (!cancelado) setFotos(lista) })
      .catch(() => { if (!cancelado) setErro('Não foi possível carregar as fotos. Tente de novo.') })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [origem])

  function zerarMontagem() {
    setMontagemId(null)
    setErroMontagem(null)
    montagemPendente.current = null
  }

  // ── Passo 1 ────────────────────────────────────────────────────────────────

  const chaveBusca = chaveNome(buscaPaciente)
  const pacientesFiltrados = (chaveBusca
    ? pacientes.filter(p => chaveNome(p.name).includes(chaveBusca))
    : pacientes
  ).slice(0, 50)

  function escolherPaciente(id: number, nome: string) {
    setOrigem({ tipo: 'paciente', id, nome })
    setPasso(2)
  }

  async function usarNome() {
    const nome = nomeNovo.trim()
    if (!nome) return
    setCriandoPasta(true)
    setErro(null)
    try {
      const res = await fetch('/api/fotos/pessoas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof dados?.error === 'string' ? dados.error : 'Não foi possível usar este nome')
      }
      // A rota acha-ou-cria: nome 100% idêntico cai na pasta que já existe, e é
      // isso que o dono pediu. O nome exibido é o da pasta, não o digitado.
      const pasta = dados as FotoPessoa
      setOrigem({ tipo: 'pessoa', id: pasta.id, nome: pasta.nome })
      setPasso(2)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível usar este nome')
    } finally {
      setCriandoPasta(false)
    }
  }

  // ── Passo 2 ────────────────────────────────────────────────────────────────

  function alternar(id: number) {
    setSelecionadas(anteriores =>
      anteriores.includes(id)
        ? anteriores.filter(x => x !== id)
        : anteriores.length < 2 ? [...anteriores, id] : anteriores,
    )
  }

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois de um erro
    if (!arquivo || origem?.tipo !== 'pessoa') return

    setEnviando(true)
    setErro(null)
    try {
      const corpo = new FormData()
      corpo.append('file', arquivo)
      const res = await fetch(`/api/fotos/pessoas/${origem.id}/fotos`, { method: 'POST', body: corpo })
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof dados?.error === 'string' ? dados.error : 'Não foi possível enviar a foto')
      }
      setFotos(anteriores => maisRecentePrimeiro([paraEscolhivel(origem.id, dados as FotoAvulsa), ...anteriores]))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar a foto')
    } finally {
      setEnviando(false)
    }
  }

  function irParaEnquadrar() {
    // A ordem é a da seleção, não a da grade: a PRIMEIRA escolhida é o "antes".
    const duas = selecionadas.map(id => fotos.find(f => f.id === id)).filter((f): f is FotoEscolhivel => !!f)
    if (duas.length !== 2) return
    setEscolhidas(duas)
    setRecortes([{ ...FULL_CROP }, { ...FULL_CROP }])
    zerarMontagem()
    setPasso(3)
  }

  // ── Passo 4 ────────────────────────────────────────────────────────────────

  /** Só o POST. Separado do clique porque o "tentar de novo" repete apenas esta
   *  parte: a imagem já foi desenhada e já foi baixada. */
  async function guardarEmFotos(dados: NonNullable<typeof montagemPendente.current>) {
    if (!origem) return
    setSalvando(true)
    setErroMontagem(null)
    try {
      const id = await salvarMontagem({
        png: dados.png,
        thumb: dados.thumb,
        identidade: 'fotos',
        patientId: origem.tipo === 'paciente' ? origem.id : null,
        pessoaId: origem.tipo === 'pessoa' ? origem.id : null,
        dataAntes: dados.dataAntes,
        dataDepois: dados.dataDepois,
      })
      setMontagemId(id)
      montagemPendente.current = null
      onPronto(await lerMontagem(id, dados))
    } catch (err) {
      montagemPendente.current = dados
      setErroMontagem(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * `salvarMontagem` devolve só o id, e o cartão da galeria mostra também quem
   * montou — nome que sai da sessão, no servidor, e que o navegador não conhece.
   * Por isso relemos a linha gravada pela rota de lista.
   *
   * Se essa leitura falhar, a montagem JÁ está guardada: em vez de o item sumir
   * da tela até alguém recarregar, ele entra com o que o montador sabe. As
   * chaves do S3 ficam vazias de propósito — a galeria mostra a imagem pela rota
   * `/imagem`, que recebe só o id.
   */
  async function lerMontagem(
    id: number,
    dados: { dataAntes: string; dataDepois: string },
  ): Promise<Montagem> {
    const local: Montagem = {
      id,
      patient_id: origem?.tipo === 'paciente' ? origem.id : null,
      pessoa_id: origem?.tipo === 'pessoa' ? origem.id : null,
      nome: origem?.nome ?? '',
      identidade: 'fotos',
      s3_key: '',
      s3_key_thumb: '',
      data_antes: dados.dataAntes,
      data_depois: dados.dataDepois,
      created_at: new Date().toISOString(),
      created_by: null,
    }
    try {
      const linhas = (await listaDaRota('/api/fotos/montagens')) as Montagem[]
      return linhas.find(m => m.id === id) ?? local
    } catch {
      return local
    }
  }

  async function baixarESalvar() {
    const [a, b] = escolhidas
    const [recorteA, recorteB] = recortesFinais
    if (!a || !b) return

    setErro(null)
    try {
      const [imgA, imgB] = await Promise.all([carregarImagem(a.url), carregarImagem(b.url)])

      // `gerarMontagem` não confere se a imagem carregou: altura zero divide por
      // zero e sai como Infinity, falhando lá dentro, longe daqui. A garantia é
      // de quem chama.
      if (!imgA.naturalWidth || !imgA.naturalHeight || !imgB.naturalWidth || !imgB.naturalHeight) {
        throw new Error('Imagem não carregou')
      }

      const dataAntes = isoDaData(a.data) ?? ''
      const dataDepois = isoDaData(b.data) ?? ''

      const { png, thumb } = await gerarMontagem({
        identidade: 'fotos', // a identidade do Instituto só sai de dentro do card de Estética
        antes: { img: imgA, recorte: recorteA, data: dataAntes },
        depois: { img: imgB, recorte: recorteB, data: dataDepois },
      })

      // Baixa PRIMEIRO. Se o POST falhar depois, o dono já está com a imagem na
      // mão, que é o que ele precisa no momento.
      baixarBlob(png, 'comparacao-antes-depois.png')

      if (montagemId === null) {
        await guardarEmFotos({ png, thumb, dataAntes, dataDepois })
      }
    } catch {
      setErro('Não foi possível gerar a imagem. Tente de novo.')
    }
  }

  // ── Navegação ──────────────────────────────────────────────────────────────

  function voltar() {
    setErro(null)
    if (passo === 1) { onFechar(); return }
    if (passo === 2) {
      // Volta a perguntar de quem é. A pasta aberta pelo botão "Montar antes e
      // depois" também pode ser trocada por aqui.
      setOrigem(null)
      setFotos([])
      setSelecionadas([])
      setPasso(1)
      return
    }
    if (passo === 3) { setPasso(2); zerarMontagem(); return }
    // Do resultado para o enquadramento: recorte diferente é outra montagem, e
    // não uma segunda cópia da mesma.
    setRecortes(recortesFinais)
    zerarMontagem()
    setPasso(3)
  }

  // ── Tela ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700">Novo antes e depois</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Passo {passo} de 4 — {TITULOS[passo]}
            {origem && passo > 1 && <> · <span className="text-gray-600 font-medium">{origem.nome}</span></>}
          </p>
        </div>
        <button
          onClick={onFechar}
          className="shrink-0 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          Fechar
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {erro}
        </div>
      )}

      {/* ── Passo 1: de quem é? ───────────────────────────────────────────── */}
      {passo === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Paciente do sistema</h3>
            <input
              type="text"
              value={buscaPaciente}
              onChange={e => setBuscaPaciente(e.target.value)}
              placeholder="Buscar paciente..."
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {pacientes.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">Nenhum paciente cadastrado.</p>
              ) : pacientesFiltrados.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">Nenhum paciente com esse nome.</p>
              ) : (
                pacientesFiltrados.map(p => (
                  <button
                    key={p.id}
                    onClick={() => escolherPaciente(p.id, p.name)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              Usa as fotos que já estão no card dele, das abas Fotos e Estética.
            </p>
          </div>

          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pessoa sem card</h3>
            <input
              type="text"
              value={nomeNovo}
              onChange={e => setNomeNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') usarNome() }}
              placeholder="Nome da pessoa"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              onClick={usarNome}
              disabled={!nomeNovo.trim() || criandoPasta}
              className="w-full px-3 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {criandoPasta ? 'Abrindo...' : 'Usar este nome'}
            </button>
            <p className="text-[11px] text-gray-400">
              Nome escrito igual a uma pasta que já existe cai na mesma pasta.
            </p>

            {pessoas.length > 0 && (
              <div className="pt-1 space-y-1">
                <p className="text-[11px] font-medium text-gray-500">Pastas que já existem</p>
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
                  {pessoas.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setOrigem({ tipo: 'pessoa', id: p.id, nome: p.nome }); setPasso(2) }}
                      className="px-2.5 py-1 border border-violet-200 text-violet-700 text-xs rounded-full hover:bg-violet-50 transition-colors"
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Passo 2: as duas fotos ────────────────────────────────────────── */}
      {passo === 2 && origem && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-gray-600">
              {selecionadas.length === 0 && 'Escolha 2 fotos. A primeira que você escolher é o antes.'}
              {selecionadas.length === 1 && 'Escolha mais 1 foto — ela será o depois.'}
              {selecionadas.length === 2 && '2 fotos escolhidas.'}
            </p>
            {origem.tipo === 'pessoa' && (
              <>
                {/* `accept` derivado da MESMA lista fechada que o servidor valida
                    (ver `@/lib/tipos-de-imagem`), nunca escrito à mão aqui. */}
                <input
                  ref={inputArquivo}
                  type="file"
                  accept={ACCEPT_IMAGENS}
                  className="hidden"
                  onChange={enviarFoto}
                />
                <button
                  onClick={() => inputArquivo.current?.click()}
                  disabled={enviando}
                  className="px-3 py-1.5 border border-violet-300 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-colors"
                >
                  {enviando ? 'Enviando...' : 'Enviar foto'}
                </button>
              </>
            )}
          </div>

          {carregando ? (
            <p className="text-sm text-gray-400 py-8 text-center animate-pulse">Carregando...</p>
          ) : fotos.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              {origem.tipo === 'pessoa'
                ? 'Nenhuma foto nesta pasta. Envie a primeira aqui mesmo.'
                : 'Este paciente não tem foto no card. Envie as fotos pelo card dele, nas abas Fotos ou Estética.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {fotos.map(f => {
                  const posicao = selecionadas.indexOf(f.id)
                  const escolhida = posicao >= 0
                  return (
                    <div
                      key={f.id}
                      onClick={() => alternar(f.id)}
                      className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-colors ${
                        escolhida ? 'border-violet-500' : 'border-gray-200 hover:border-violet-300'
                      }`}
                    >
                      <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        escolhida ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-400 border border-gray-300'
                      }`}>
                        {escolhida ? posicao + 1 : ''}
                      </div>
                      {/* Rota da própria origem, nunca URL assinada do S3. */}
                      <img
                        src={f.url}
                        alt={f.nome}
                        loading="lazy"
                        className={`w-full h-32 object-cover bg-gray-50 transition-opacity ${escolhida ? 'opacity-100' : 'opacity-75'}`}
                      />
                      <div className="p-2 bg-white">
                        <p className="text-[11px] text-gray-500 truncate">{fmtDataHora(f.data)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={irParaEnquadrar}
                disabled={selecionadas.length !== 2}
                className="w-full sm:w-auto px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Enquadrar as duas
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Passo 3: enquadrar ────────────────────────────────────────────── */}
      {passo === 3 && escolhidas.length === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Arraste e redimensione a caixa para definir o recorte de cada foto.
          </p>
          {/* Duas colunas também no celular, como no card: lado a lado é o que
              deixa o dono comparar o enquadramento das duas. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {escolhidas.map((f, i) => (
              <CropEditor
                key={f.id}
                url={f.url}
                label={i === 0 ? 'Antes' : 'Depois'}
                crop={recortes[i]}
                onChange={r => setRecortes(anteriores => {
                  const proximos: [CropRect, CropRect] = [...anteriores] as [CropRect, CropRect]
                  proximos[i] = r
                  return proximos
                })}
              />
            ))}
          </div>
          <button
            onClick={() => { setRecortesFinais(recortes); zerarMontagem(); setPasso(4) }}
            className="w-full sm:w-auto px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Confirmar enquadramento
          </button>
        </div>
      )}

      {/* ── Passo 4: resultado ────────────────────────────────────────────── */}
      {passo === 4 && escolhidas.length === 2 && (
        <div className="space-y-3">
          {montagemId !== null && !erroMontagem && (
            <p className="text-xs text-green-700">Guardado na aba Fotos.</p>
          )}

          {erroMontagem && (
            <div className="flex items-center gap-3 flex-wrap p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                Baixado, mas não foi guardado na aba Fotos: {erroMontagem}
              </p>
              <button
                onClick={() => { if (montagemPendente.current) guardarEmFotos(montagemPendente.current) }}
                disabled={salvando}
                className="px-3 py-1.5 border border-amber-300 text-amber-900 text-sm font-medium rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
              >
                Tentar de novo
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {escolhidas.map((f, i) => (
              <div key={f.id} className="space-y-1">
                <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">
                  {i === 0 ? 'Antes' : 'Depois'}
                </p>
                <PreviaRecortada url={f.url} recorte={recortesFinais[i]} alt={f.nome} />
                <p className="text-xs text-center text-gray-400">{fmtDataHora(f.data)}</p>
              </div>
            ))}
          </div>

          <button
            onClick={baixarESalvar}
            disabled={salvando}
            className="w-full sm:w-auto px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {salvando ? 'Salvando...' : 'Baixar e salvar em Fotos'}
          </button>
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={voltar}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
        >
          ← Voltar
        </button>
      </div>
    </div>
  )
}
