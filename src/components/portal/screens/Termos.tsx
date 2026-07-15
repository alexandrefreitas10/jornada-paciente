'use client'

import React from 'react'
import { C, serif, shadowCard, shortDate } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconCheckCircle, IconPen, IconDownload } from '../Icons'
import type { PortalData, PortalTerm } from '../types'

export function Termos({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const items = (data.terms || []).filter(
    (t) => t.status === 'signed' || (t.status === 'sent' && t.sign_token)
  )

  return (
    <div className="pt-view">
      <ScreenHeader title="Termos" subtitle="Consentimentos e autorizações" onBack={onBack} />

      {items.length === 0 ? (
        <EmptyState>Nenhum termo disponível ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 20px' }}>
          {items.map((t) =>
            t.status === 'signed' ? <SignedCard key={t.id} t={t} data={data} /> : <PendingCard key={t.id} t={t} />
          )}
        </div>
      )}
    </div>
  )
}

function SignedCard({ t, data }: { t: PortalTerm; data: PortalData }) {
  return (
    <div style={{
      background: C.white, borderRadius: 18, padding: 16, boxShadow: shadowCard,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <IconBox tone="sage"><IconCheckCircle color={C.sageText} /></IconBox>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: serif, fontSize: 14, fontWeight: 700, color: C.graphiteStrong }}>{t.title}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sage, marginTop: 3 }}>Assinado · {shortDate(t.signed_at)}</div>
      </div>
      {t.hasSignedFile && (
        <a href={`/api/patients/${data.patientId}/terms/${t.id}/download`} target="_blank" rel="noreferrer"
          aria-label="Baixar termo assinado"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconDownload color={C.sage} />
        </a>
      )}
    </div>
  )
}

function PendingCard({ t }: { t: PortalTerm }) {
  return (
    <div style={{
      background: C.white, borderRadius: 18, padding: 16, border: '1.5px solid #f0e3c8',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <IconBox tone="gold"><IconPen color={C.pending} /></IconBox>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: serif, fontSize: 14, fontWeight: 700, color: C.graphiteStrong }}>{t.title}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.pending, marginTop: 3 }}>Pendente de assinatura</div>
      </div>
      <a href={`/termos/assinar/${t.sign_token}`}
        style={{
          flexShrink: 0, background: C.gold, color: C.white, fontSize: 13, fontWeight: 700,
          padding: '9px 18px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>Assinar</a>
    </div>
  )
}
