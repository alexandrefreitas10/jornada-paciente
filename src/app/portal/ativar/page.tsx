'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, serif, shadowCard } from '@/components/portal/theme'
import { IconEye, IconEyeOff } from '@/components/portal/Icons'

const wrap: React.CSSProperties = { minHeight: '100dvh', background: C.sand, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 22px' }
const cardStyle: React.CSSProperties = { background: C.white, borderRadius: 22, boxShadow: shadowCard, padding: 24 }
const card: React.CSSProperties = { background: C.white, borderRadius: 22, boxShadow: shadowCard, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }
const inputStyle: React.CSSProperties = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', fontSize: 14, color: C.graphite, outline: 'none', boxSizing: 'border-box' }
// Campo do código: grande, espaçado e centralizado — é o que a secretária dita
// por telefone e o paciente digita olhando o teclado, muitas vezes sem óculos.
const inputCode: React.CSSProperties = {
  width: '100%', border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 16px',
  fontSize: 30, fontWeight: 700, letterSpacing: 8, textAlign: 'center', textTransform: 'uppercase',
  color: C.graphiteStrong, outline: 'none', boxSizing: 'border-box',
}
const eyeBtn: React.CSSProperties = {
  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: C.sage,
}
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  width: '100%', background: C.gold, color: '#fff', fontWeight: 700, fontSize: 15, padding: 16,
  borderRadius: 14, border: 'none', boxShadow: '0 14px 26px -14px #C4A86A',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
})
const secondaryBtn: React.CSSProperties = {
  width: '100%', background: C.sageBox, color: C.sageText, fontWeight: 700, fontSize: 15, padding: 14,
  borderRadius: 14, border: 'none', cursor: 'pointer',
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: C.soft, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0,
}
const errorText: React.CSSProperties = { fontSize: 13, color: '#c0392b', margin: 0, lineHeight: 1.4 }

type EstadoCodigo = 'valido' | 'invalido' | 'usado' | 'expirado'

// Mensagens exatas exigidas pela tela — cada estado do código tem a sua,
// porque "já usado" (o caso mais comum) precisa de saída, não só de aviso.
const MENSAGEM_ESTADO: Record<Exclude<EstadoCodigo, 'valido'>, string> = {
  usado: 'Este código já foi usado. Entre com seu e-mail e senha.',
  expirado: 'Este código expirou. Peça um novo na clínica.',
  invalido: 'Código não encontrado. Confira as 6 letras e números.',
}

const ERRO_CONEXAO = 'Não foi possível conectar. Verifique sua internet e tente de novo.'

export default function AtivarComCodigoPage() {
  const router = useRouter()

  const [step, setStep] = useState<'codigo' | 'senha' | 'sucesso'>('codigo')

  // Passo 1 — código
  const [codigo, setCodigo] = useState('')
  const [checando, setChecando] = useState(false)
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  const [mostrarBotaoLogin, setMostrarBotaoLogin] = useState(false)
  const [patientName, setPatientName] = useState('')

  // Passo 2 — e-mail e senha
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivar, setErroAtivar] = useState<string | null>(null)

  async function handleVerificar(e: React.FormEvent) {
    e.preventDefault()
    setErroCodigo(null)
    setMostrarBotaoLogin(false)
    setChecando(true)
    try {
      const res = await fetch('/api/portal/codigo/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codigo }),
      })
      const data = await res.json()

      if (res.status === 429) {
        setErroCodigo(data.error || 'Muitas tentativas. Aguarde alguns minutos e tente de novo.')
        return
      }

      const estado: EstadoCodigo = data.estado
      if (estado === 'valido') {
        setPatientName(data.patientName ?? '')
        setStep('senha')
        return
      }
      setErroCodigo(MENSAGEM_ESTADO[estado] ?? MENSAGEM_ESTADO.invalido)
      if (estado === 'usado') setMostrarBotaoLogin(true)
    } catch {
      setErroCodigo(ERRO_CONEXAO)
    } finally {
      setChecando(false)
    }
  }

  function voltarParaCodigo() {
    setStep('codigo')
    setErroCodigo(null)
    setMostrarBotaoLogin(false)
    setErroAtivar(null)
  }

  async function handleAtivar(e: React.FormEvent) {
    e.preventDefault()
    setErroAtivar(null)

    if (senha.length < 6) {
      setErroAtivar('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmSenha) {
      setErroAtivar('As senhas não coincidem.')
      return
    }

    setAtivando(true)
    try {
      const res = await fetch('/api/portal/codigo/ativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codigo, email, password: senha }),
      })
      const data = await res.json()

      if (!res.ok) {
        // Não limpa o que o paciente já digitou — errar o e-mail não pode
        // custar reescrever a senha inteira de novo.
        setErroAtivar(data.error || 'Não foi possível ativar. Tente de novo.')
        return
      }

      setStep('sucesso')
      setTimeout(() => router.push('/portal/login'), 2000)
    } catch {
      setErroAtivar(ERRO_CONEXAO)
    } finally {
      setAtivando(false)
    }
  }

  if (step === 'sucesso') {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.graphiteStrong }}>Conta criada!</div>
          <p style={{ fontSize: 14, color: C.soft, marginTop: 8, lineHeight: 1.5 }}>
            Entre com <strong style={{ color: C.graphite }}>{email}</strong> e a senha que você escolheu.
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>Levando você para o login…</p>
        </div>
      </div>
    )
  }

  if (step === 'senha') {
    return (
      <div style={wrap}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontFamily: serif, fontSize: 26, color: C.graphiteStrong }}>
              Olá, {patientName}!
            </div>
            <p style={{ fontSize: 14, color: C.soft, marginTop: 8, lineHeight: 1.5 }}>
              Agora escolha o e-mail e a senha que você vai usar para entrar.
            </p>
          </div>
          <div style={cardStyle}>
            <form onSubmit={handleAtivar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seu@email.com"
                style={inputStyle}
              />
              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Criar senha (mín. 6 caracteres)"
                  style={{ ...inputStyle, paddingRight: 46 }}
                />
                <button type="button" onClick={() => setMostrarSenha(s => !s)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} style={eyeBtn}>
                  {mostrarSenha ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={confirmSenha}
                  onChange={e => setConfirmSenha(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Confirmar senha"
                  style={{ ...inputStyle, paddingRight: 46 }}
                />
                <button type="button" onClick={() => setMostrarSenha(s => !s)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} style={eyeBtn}>
                  {mostrarSenha ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                </button>
              </div>
              {erroAtivar && <p style={errorText}>{erroAtivar}</p>}
              <button type="submit" disabled={ativando} style={primaryBtn(ativando)}>
                {ativando ? 'Ativando…' : 'Criar minha conta'}
              </button>
              <button type="button" onClick={voltarParaCodigo} style={linkBtn}>
                ← Digitei o código errado
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.graphiteStrong }}>Acessar o portal</div>
          <p style={{ fontSize: 14, color: C.soft, marginTop: 8, lineHeight: 1.5 }}>
            Digite o código de 6 letras e números que a clínica te passou.
          </p>
        </div>
        <div style={cardStyle}>
          <form onSubmit={handleVerificar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              value={codigo}
              // Só maiusculiza — hífen, espaço e ponto colados pelo paciente
              // seguem para o servidor, que normaliza. Barrar aqui seria
              // atrapalhar quem colou a mensagem do WhatsApp direto.
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={16}
              placeholder="K7P2M9"
              aria-label="Código de acesso"
              style={inputCode}
            />
            {erroCodigo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={errorText}>{erroCodigo}</p>
                {mostrarBotaoLogin && (
                  <button type="button" onClick={() => router.push('/portal/login')} style={secondaryBtn}>
                    Entrar com e-mail e senha
                  </button>
                )}
              </div>
            )}
            <button type="submit" disabled={checando || codigo.trim().length === 0} style={primaryBtn(checando)}>
              {checando ? 'Verificando…' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
