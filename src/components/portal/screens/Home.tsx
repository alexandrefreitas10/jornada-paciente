'use client'

import React from 'react'
import { C, serif, shadowCard, shadowFeature } from '../theme'
import { firstName, initial } from '../theme'
import { IconBox } from '../ui'
import { IconBell, IconCamera, IconMoon, IconFlask, IconBars, IconLeaf, IconCapsule, IconSparkle, IconDoc } from '../Icons'
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
  const pct = data.tasksTotal > 0 ? Math.round((data.tasksDone / data.tasksTotal) * 100) : 0
  return (
    <div className="pt-view">
      {/* Cabeçalho: avatar + saudação + sino */}
      <div style={{ padding: '18px 22px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg,#e7d9b8,#C4A86A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, color: '#fff', fontSize: 20 }}>{initial(data.name)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.muted2 }}>Olá, seja bem-vindo(a)</div>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.graphiteStrong, lineHeight: 1 }}>{firstName(data.name)}</div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -10px rgba(0,0,0,.3)' }}>
          <IconBell size={18} color={C.goldIcon} />
        </span>
      </div>

      {/* Card de jornada com anel de progresso */}
      <button onClick={() => go('jornada')} className="pt-press" style={{
        cursor: 'pointer', margin: '14px 20px', background: 'linear-gradient(135deg,#fff,#fbf3e6)', borderRadius: 24, padding: 20,
        display: 'flex', alignItems: 'center', gap: 18, boxShadow: shadowFeature, border: 'none', width: 'calc(100% - 40px)', textAlign: 'left',
      }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(${C.gold} 0 ${pct}%, #efe6d6 ${pct}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: serif, fontSize: 20, color: C.graphiteStrong }}>{data.tasksDone}/{data.tasksTotal}</span>
            <span style={{ fontSize: 9, color: C.muted2 }}>TAREFAS</span>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18, color: C.graphiteStrong }}>Sua jornada</div>
          <div style={{ fontSize: 12, color: C.soft, marginTop: 4, lineHeight: 1.4 }}>{data.tasksDone} de {data.tasksTotal} tarefas concluídas. Continue firme!</div>
        </div>
      </button>

      <div style={{ fontFamily: serif, fontSize: 19, color: C.graphiteStrong, padding: '0 22px', marginBottom: 10 }}>Acesso rápido</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, padding: '0 20px 8px' }}>
        <QA label="Fotos" tone="gold" icon={<IconCamera color={C.goldIcon} />} onClick={() => go('fotos')} />
        <QA label="Antes/Depois" tone="sage" icon={<IconMoon color={C.sageText} />} onClick={() => go('antes')} />
        <QA label="Exames" tone="gold" icon={<IconFlask color={C.goldIcon} />} onClick={() => go('exames')} />
        <QA label="Bioimpedância" tone="sage" icon={<IconBars color={C.sageText} />} onClick={() => go('bio')} />
        <QA label="Dieta" tone="gold" icon={<IconLeaf color={C.goldIcon} />} onClick={() => go('dieta')} />
        <QA label="Medicações" tone="gold" icon={<IconCapsule color={C.goldIcon} />} onClick={() => go('med')} />
        {data.hasEstetica && <QA label="Estética" tone="gold" icon={<IconSparkle color={C.goldIcon} />} onClick={() => go('estetica')} />}
        <QA label="Termos" tone="sage" icon={<IconDoc color={C.sageText} />} onClick={() => go('termos')} />
      </div>
    </div>
  )
}
