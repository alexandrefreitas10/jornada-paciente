'use client'

import React from 'react'
import { C, longDate, shadowCard } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import { IconDownload } from '../Icons'
import type { PortalData, PortalFile } from '../types'

// A tabela de papel do Instituto, fotografada pela clínica na aba Evolução do
// card. Tela própria, alcançada por um bloco na Início que só existe para quem
// tem tabela — como o bloco de Estética.

// Rota de mesma origem que assina na hora. `f.url` é assinada no carregamento
// da página e vence em 15 minutos; o portal fica aberto mais que isso, então
// esta serve de reserva quando a imagem falha.
const proxySrc = (patientId: number, fileId: number) =>
  `/api/patients/${patientId}/files/${fileId}/download?proxy=1`
const downloadHref = (patientId: number, fileId: number) =>
  `/api/patients/${patientId}/files/${fileId}/download`

export function Tabela({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [aberta, setAberta] = React.useState<PortalFile | null>(null)

  return (
    <div className="pt-view">
      <ScreenHeader title="Minha tabela" subtitle="Seu acompanhamento semana a semana" onBack={onBack} />

      {data.tabelas.length === 0 ? (
        <EmptyState>Nenhuma tabela enviada ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 20px 20px' }}>
          {/* A ordem vem do servidor (mais recente primeiro) e não é refeita
              aqui: duas ordens para a mesma lista divergem no dia em que uma
              delas mudar. */}
          {data.tabelas.map((f) => (
            <div key={f.id}>
              <button onClick={() => setAberta(f)} className="pt-press" style={{
                cursor: 'pointer', padding: 0, border: 'none', background: C.white, width: '100%',
                borderRadius: 14, overflow: 'hidden', boxShadow: shadowCard, display: 'block',
              }}>
                {/* Inteira, nunca cortada em quadrado: é papel com número
                    pequeno, e o recorte esconderia justamente as últimas linhas
                    preenchidas — que são as que ele quer ver. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={`Tabela de ${longDate(f.created_at)}`}
                  onError={e => {
                    const u = proxySrc(data.patientId, f.id)
                    if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u
                  }}
                  style={{ width: '100%', display: 'block' }}
                />
              </button>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6, textAlign: 'center' }}>
                {longDate(f.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {aberta && (
        <div onClick={() => setAberta(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={aberta.url}
            alt={`Tabela de ${longDate(aberta.created_at)}`}
            onClick={(e) => e.stopPropagation()}
            onError={e => {
              const u = proxySrc(data.patientId, aberta.id)
              if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u
            }}
            style={{ maxWidth: '100%', maxHeight: '78%', objectFit: 'contain', borderRadius: 12 }}
          />
          <a href={downloadHref(data.patientId, aberta.id)} onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer" style={{ marginTop: 18, background: C.gold, color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 20px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <IconDownload size={17} color="#fff" sw={1.7} /> Baixar
          </a>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 12 }}>Toque fora para fechar</span>
        </div>
      )}
    </div>
  )
}
