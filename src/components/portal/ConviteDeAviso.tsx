'use client'

import React from 'react'
import { C, shadowCard } from './theme'
import { usarAvisosPush } from './usarAvisosPush'

// O convite para ligar os avisos no celular, mostrado logo DEPOIS de o
// paciente marcar a aplicação.
//
// POR QUE AQUI, E NÃO NO PERFIL: no Perfil o botão existia e ninguém via —
// paciente não abre Perfil. O resultado era a recepcionista pedindo um a um
// pelo WhatsApp, que é justamente o trabalho que o portal existe para tirar.
// Depois de marcar é o momento em que o aviso se explica sozinho: a pessoa
// acabou de demonstrar que liga para aquele horário.
//
// POR QUE O CONVITE É NOSSO, E NÃO A CAIXA DO NAVEGADOR DIRETO: a caixa só
// pode ser aberta por um toque, e o "não" dela é DEFINITIVO — nem nós nem
// ninguém consegue perguntar de novo, só os Ajustes do aparelho desfazem.
// Cada paciente dá uma resposta na vida. Recusar este cartão não gasta nada;
// o navegador só é chamado quando a pessoa toca em "Quero ser avisado".

export function ConviteDeAviso() {
  const { estado, ocupado, ligar } = usarAvisosPush()
  const [dispensado, setDispensado] = React.useState(false)

  // Some para quem já ligou (nada a pedir), para quem já recusou no navegador
  // (insistir é inútil e irritante) e enquanto ainda não se sabe o estado.
  if (dispensado) return null
  if (estado === 'ligado' || estado === 'negado' || estado === 'sem_suporte' || estado === 'carregando') {
    return null
  }

  // iPhone fora da tela de início: o push nem existe ali. Explicar o caminho é
  // útil; oferecer o botão seria prometer o que não dá.
  if (estado === 'precisa_instalar') {
    return (
      <div style={caixa}>
        <div style={titulo}>Quer ser avisado da sua aplicação?</div>
        <div style={texto}>
          No iPhone, os avisos só funcionam com o portal na <strong>tela de início</strong>.
          Toque em compartilhar e depois em &quot;Adicionar à Tela de Início&quot; — depois disso
          a gente te oferece os avisos aqui.
        </div>
      </div>
    )
  }

  return (
    <div style={caixa}>
      <div style={titulo}>Quer ser avisado da sua aplicação?</div>
      <div style={texto}>
        A gente te lembra no celular quando o dia estiver chegando. Sem precisar
        perguntar no grupo.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
        <button
          onClick={() => { if (!ocupado) ligar() }}
          disabled={ocupado}
          style={{
            flex: 1, background: C.sageText, color: '#fff', border: 'none',
            borderRadius: 11, padding: 11, fontSize: 13, fontWeight: 700,
            opacity: ocupado ? 0.6 : 1,
          }}
        >
          {ocupado ? 'Um instante...' : 'Quero ser avisado'}
        </button>
        <button
          onClick={() => setDispensado(true)}
          style={{
            border: '1px solid rgba(0,0,0,.16)', background: C.white,
            borderRadius: 11, padding: '11px 15px', fontSize: 13, fontWeight: 600, color: C.soft,
          }}
        >
          Agora não
        </button>
      </div>
      {estado === 'erro' && (
        <div role="alert" style={{ ...texto, marginTop: 10, color: '#9c2d24' }}>
          Não deu certo. Pode tentar de novo.
        </div>
      )}
    </div>
  )
}

const caixa: React.CSSProperties = {
  background: C.white, borderRadius: 16, padding: '16px 15px',
  boxShadow: shadowCard, marginTop: 14,
}
const titulo: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 5 }
const texto: React.CSSProperties = { fontSize: 12, opacity: 0.7, lineHeight: 1.5 }
