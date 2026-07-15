'use client'

import React from 'react'
import Image from 'next/image'
import { C, serif, shadowCard } from '../theme'
import { firstName, initial } from '../theme'
import { IconBox } from '../ui'
import { IconBell, IconCamera, IconFlask, IconBars, IconLeaf, IconCapsule, IconSparkle, IconDoc } from '../Icons'
import type { PortalData, Screen } from '../types'

function QA({ label, tone, icon, onClick }: { label: string; tone: 'gold' | 'sage'; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pt-press" style={{
      cursor: 'pointer', background: C.white, borderRadius: 20, padding: '15px 8px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', boxShadow: shadowCard, border: 'none',
    }}>
      <IconBox tone={tone}>{icon}</IconBox>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#4a4843', lineHeight: 1.15 }}>{label}</span>
    </button>
  )
}

export function Home({ data, go }: { data: PortalData; go: (s: Screen) => void }) {
  return (
    <div className="pt-view">
      {/* Marca co-branded (igual ao login) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px 22px 6px' }}>
        <Image src="/portal/logo-torres.png" alt="Instituto Torres" width={78} height={92} style={{ width: 78, height: 'auto', objectFit: 'contain' }} />
        <div style={{ width: 1, height: 58, background: '#ddd2be' }} />
        <Image src="/portal/logo-fran.png" alt="Dra. Fran Torres" width={70} height={92} style={{ width: 70, height: 'auto', objectFit: 'contain' }} />
      </div>

      {/* Saudação */}
      <div style={{ padding: '10px 22px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 46, height: 46, borderRadius: 16, overflow: 'hidden', background: data.avatarUrl ? '#eee' : 'linear-gradient(135deg,#e7d9b8,#C4A86A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, color: '#fff', fontSize: 20, flexShrink: 0 }}>
          {data.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={data.avatarUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initial(data.name)}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.muted2 }}>Olá, seja bem-vindo(a)</div>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.graphiteStrong, lineHeight: 1 }}>{firstName(data.name)}</div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -10px rgba(0,0,0,.3)' }}>
          <IconBell size={18} color={C.goldIcon} />
        </span>
      </div>

      <div style={{ fontFamily: serif, fontSize: 19, color: C.graphiteStrong, padding: '18px 22px 0', marginBottom: 10 }}>Acesso rápido</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, padding: '0 20px 8px' }}>
        <QA label="Fotos" tone="gold" icon={<IconCamera color={C.goldIcon} />} onClick={() => go('fotos')} />
        <QA label="Exames" tone="gold" icon={<IconFlask color={C.goldIcon} />} onClick={() => go('exames')} />
        <QA label="Bioimpedância" tone="sage" icon={<IconBars color={C.sageText} />} onClick={() => go('bio')} />
        <QA label="Dieta" tone="gold" icon={<IconLeaf color={C.goldIcon} />} onClick={() => go('dieta')} />
        <QA label="Medicações" tone="gold" icon={<IconCapsule color={C.goldIcon} />} onClick={() => go('med')} />
        <QA label="Termos" tone="sage" icon={<IconDoc color={C.sageText} />} onClick={() => go('termos')} />
        {data.hasEstetica && <QA label="Estética" tone="gold" icon={<IconSparkle color={C.goldIcon} />} onClick={() => go('estetica')} />}
      </div>
    </div>
  )
}
