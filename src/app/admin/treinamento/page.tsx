'use client'

import { useEffect, useState } from 'react'
import type { TrainingKb } from '@/lib/training/types'
import { centsToReais, reaisToCents } from '@/lib/training/money'

// A tela é o cadastro do gabarito que a IA usa para simular pacientes e
// avaliar a secretária. Sem isso preenchido, o módulo de treino inteiro
// fica bloqueado — então cada campo aqui precisa ser fácil de entender e
// difícil de errar, não elegante.

// --- Rascunho do formulário -------------------------------------------------
// Preço, anos de experiência, meses e semanas ficam como texto no rascunho.
// Se fossem number, um campo esvaziado ou pela metade ("9," por exemplo)
// viraria NaN enquanto a pessoa ainda está digitando. Convertidos só no envio.

interface DoctorDraft {
  name: string
  nickname: string
  specialty: string
  yearsExperience: string
  education: string
  focus: string
}

interface PlanDraft {
  name: string
  months: string
  price: string
}

interface ProcedureDraft {
  name: string
  price: string
}

interface KbDraft {
  doctors: DoctorDraft[]
  consultation: {
    price: string
    durationLabel: string
    includes: string[]
    returnWeeks: string
  }
  plans: PlanDraft[]
  plansNote: string
  payment: {
    methods: string[]
    installments: string
    discountPolicy: string
  }
  insurance: {
    accepts: boolean
    note: string
  }
  procedures: ProcedureDraft[]
  weightLossDrugsPolicy: string
  noShowPolicy: string
  links: {
    site: string
    instagram: string
    google: string
  }
  redLines: string[]
  modelAnswers: string[]
}

const EMPTY_DRAFT: KbDraft = {
  doctors: [],
  consultation: { price: '', durationLabel: '', includes: [], returnWeeks: '' },
  plans: [],
  plansNote: '',
  payment: { methods: [], installments: '', discountPolicy: '' },
  insurance: { accepts: false, note: '' },
  procedures: [],
  weightLossDrugsPolicy: '',
  noShowPolicy: '',
  links: { site: '', instagram: '', google: '' },
  redLines: [],
  modelAnswers: [],
}

function toInt(value: string): number {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

function kbToDraft(kb: TrainingKb): KbDraft {
  return {
    doctors: kb.doctors.map(d => ({
      name: d.name, nickname: d.nickname, specialty: d.specialty,
      yearsExperience: d.yearsExperience ? String(d.yearsExperience) : '',
      education: d.education, focus: d.focus,
    })),
    consultation: {
      price: centsToReais(kb.consultation.priceCents),
      durationLabel: kb.consultation.durationLabel,
      includes: [...kb.consultation.includes],
      returnWeeks: kb.consultation.returnWeeks ? String(kb.consultation.returnWeeks) : '',
    },
    plansNote: kb.plansNote ?? '',
    plans: kb.plans.map(p => ({
      name: p.name,
      months: p.months ? String(p.months) : '',
      price: centsToReais(p.priceCents),
    })),
    payment: {
      methods: [...kb.payment.methods],
      installments: kb.payment.installments,
      discountPolicy: kb.payment.discountPolicy,
    },
    insurance: { accepts: kb.insurance.accepts, note: kb.insurance.note },
    procedures: kb.procedures.map(p => ({ name: p.name, price: centsToReais(p.priceCents) })),
    weightLossDrugsPolicy: kb.weightLossDrugsPolicy,
    noShowPolicy: kb.noShowPolicy,
    links: { ...kb.links },
    redLines: [...kb.redLines],
    modelAnswers: [...kb.modelAnswers],
  }
}

function draftToKb(f: KbDraft): TrainingKb {
  return {
    doctors: f.doctors.map(d => ({
      name: d.name.trim(),
      nickname: d.nickname.trim(),
      specialty: d.specialty.trim(),
      yearsExperience: toInt(d.yearsExperience),
      education: d.education.trim(),
      focus: d.focus.trim(),
    })),
    consultation: {
      priceCents: reaisToCents(f.consultation.price),
      durationLabel: f.consultation.durationLabel.trim(),
      includes: f.consultation.includes.map(s => s.trim()).filter(Boolean),
      returnWeeks: toInt(f.consultation.returnWeeks),
    },
    plans: f.plans.map(p => ({
      name: p.name.trim(),
      months: toInt(p.months),
      priceCents: reaisToCents(p.price),
    })),
    plansNote: f.plansNote.trim(),
    payment: {
      methods: f.payment.methods.map(s => s.trim()).filter(Boolean),
      installments: f.payment.installments.trim(),
      discountPolicy: f.payment.discountPolicy.trim(),
    },
    insurance: { accepts: f.insurance.accepts, note: f.insurance.note.trim() },
    procedures: f.procedures.map(p => ({ name: p.name.trim(), priceCents: reaisToCents(p.price) })),
    weightLossDrugsPolicy: f.weightLossDrugsPolicy.trim(),
    noShowPolicy: f.noShowPolicy.trim(),
    links: {
      site: f.links.site.trim(),
      instagram: f.links.instagram.trim(),
      google: f.links.google.trim(),
    },
    redLines: f.redLines.map(s => s.trim()).filter(Boolean),
    modelAnswers: f.modelAnswers.map(s => s.trim()).filter(Boolean),
  }
}

// --- Classes reaproveitadas do resto do app (usuarios/estoque/auditoria) ---

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400'
const textareaClass = `${inputClass} resize-none`
const primaryBtn = 'px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors'
const addBtn = 'text-xs font-medium text-violet-600 hover:bg-violet-50 px-2 py-1 rounded-lg transition-colors'
const removeBtn = 'text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0'

// --- Blocos pequenos de UI ---------------------------------------------------

function Section({
  title, description, tone, children,
}: {
  title: string
  description?: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section className={`bg-white rounded-2xl border shadow-sm p-5 ${tone === 'danger' ? 'border-red-200' : 'border-gray-200'}`}>
      <h2 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-700' : 'text-gray-700'}`}>{title}</h2>
      {description && <p className="text-xs text-gray-500 mt-1 mb-4">{description}</p>}
      <div className={`space-y-3 ${description ? '' : 'mt-4'}`}>{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function StringListEditor({
  items, onChange, placeholder, addLabel, multiline,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  addLabel: string
  multiline?: boolean
}) {
  function update(i: number, value: string) {
    const next = [...items]
    next[i] = value
    onChange(next)
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...items, ''])
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          {multiline ? (
            <textarea
              value={item}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              rows={2}
              className={`${textareaClass} flex-1 min-w-0`}
            />
          ) : (
            <input
              value={item}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className={`${inputClass} flex-1 min-w-0`}
            />
          )}
          <button type="button" onClick={() => remove(i)} className={removeBtn}>Remover</button>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-gray-400">Nenhum item cadastrado ainda.</p>}
      <button type="button" onClick={add} className={addBtn}>+ {addLabel}</button>
    </div>
  )
}

function DoctorsEditor({ doctors, onChange }: { doctors: DoctorDraft[]; onChange: (d: DoctorDraft[]) => void }) {
  function update(i: number, patch: Partial<DoctorDraft>) {
    const next = [...doctors]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function remove(i: number) {
    onChange(doctors.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...doctors, { name: '', nickname: '', specialty: '', yearsExperience: '', education: '', focus: '' }])
  }
  return (
    <div className="space-y-4">
      {doctors.map((d, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Médico {i + 1}</p>
            <button type="button" onClick={() => remove(i)} className={removeBtn}>Remover</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome completo">
              <input value={d.name} onChange={e => update(i, { name: e.target.value })} placeholder="Dra. Francielle Torres" className={inputClass} />
            </Field>
            <Field label="Como é chamada(o)">
              <input value={d.nickname} onChange={e => update(i, { nickname: e.target.value })} placeholder="Dra. Fran" className={inputClass} />
            </Field>
            <Field label="Especialidade">
              <input value={d.specialty} onChange={e => update(i, { specialty: e.target.value })} placeholder="Nutrologia" className={inputClass} />
            </Field>
            <Field label="Anos de experiência">
              <input
                value={d.yearsExperience}
                onChange={e => update(i, { yearsExperience: onlyDigits(e.target.value) })}
                inputMode="numeric"
                placeholder="10"
                className={inputClass}
              />
            </Field>
            <Field label="Formação">
              <input value={d.education} onChange={e => update(i, { education: e.target.value })} placeholder="Título de especialista em Nutrologia" className={inputClass} />
            </Field>
            <Field label="Foco de atuação">
              <input value={d.focus} onChange={e => update(i, { focus: e.target.value })} placeholder="Emagrecimento, menopausa, estética corporal" className={inputClass} />
            </Field>
          </div>
        </div>
      ))}
      {doctors.length === 0 && <p className="text-xs text-gray-400">Nenhum médico cadastrado ainda.</p>}
      <button type="button" onClick={add} className={addBtn}>+ adicionar médico</button>
    </div>
  )
}

function PlansEditor({ plans, onChange }: { plans: PlanDraft[]; onChange: (p: PlanDraft[]) => void }) {
  function update(i: number, patch: Partial<PlanDraft>) {
    const next = [...plans]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function remove(i: number) {
    onChange(plans.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...plans, { name: '', months: '', price: '' }])
  }
  return (
    <div className="space-y-3">
      {plans.map((p, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-end border border-gray-200 rounded-xl p-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do plano</label>
            <input value={p.name} onChange={e => update(i, { name: e.target.value })} placeholder="Acompanhamento 6 meses" className={inputClass} />
          </div>
          <div className="w-full sm:w-24">
            <label className="block text-xs font-medium text-gray-600 mb-1">Meses</label>
            <input value={p.months} onChange={e => update(i, { months: onlyDigits(e.target.value) })} inputMode="numeric" placeholder="6" className={inputClass} />
          </div>
          <div className="w-full sm:w-32">
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
            <input value={p.price} onChange={e => update(i, { price: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} />
          </div>
          <button type="button" onClick={() => remove(i)} className={removeBtn}>Remover</button>
        </div>
      ))}
      {plans.length === 0 && <p className="text-xs text-gray-400">Nenhum plano cadastrado ainda.</p>}
      <button type="button" onClick={add} className={addBtn}>+ adicionar plano</button>
    </div>
  )
}

function ProceduresEditor({ procedures, onChange }: { procedures: ProcedureDraft[]; onChange: (p: ProcedureDraft[]) => void }) {
  function update(i: number, patch: Partial<ProcedureDraft>) {
    const next = [...procedures]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function remove(i: number) {
    onChange(procedures.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...procedures, { name: '', price: '' }])
  }
  return (
    <div className="space-y-3">
      {procedures.map((p, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-end border border-gray-200 rounded-xl p-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Procedimento</label>
            <input value={p.name} onChange={e => update(i, { name: e.target.value })} placeholder="Criolipólise" className={inputClass} />
          </div>
          <div className="w-full sm:w-32">
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
            <input value={p.price} onChange={e => update(i, { price: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} />
          </div>
          <button type="button" onClick={() => remove(i)} className={removeBtn}>Remover</button>
        </div>
      ))}
      {procedures.length === 0 && <p className="text-xs text-gray-400">Nenhum procedimento cadastrado ainda.</p>}
      <button type="button" onClick={add} className={addBtn}>+ adicionar procedimento</button>
    </div>
  )
}

// --- Página -------------------------------------------------------------

export default function TreinamentoAdminPage() {
  const [draft, setDraft] = useState<KbDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/treinamento/kb')
      .then(async res => {
        if (cancelled) return
        if (res.status === 403) {
          setLoadError('Acesso restrito ao administrador.')
          setLoading(false)
          return
        }
        if (!res.ok) {
          setLoadError('Não foi possível carregar a base de conhecimento. Tente recarregar a página.')
          setLoading(false)
          return
        }
        const data = (await res.json()) as { kb: TrainingKb; configured: boolean }
        setDraft(kbToDraft(data.kb))
        setConfigured(data.configured)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Não foi possível carregar a base de conhecimento. Tente recarregar a página.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    let res: Response
    try {
      res = await fetch('/api/admin/treinamento/kb', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToKb(draft)),
      })
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
      setSaving(false)
      return
    }

    if (res.status === 403) {
      setSaveError('Acesso restrito ao administrador.')
      setSaving(false)
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setSaveError(data.error || 'Não foi possível salvar a base de conhecimento.')
      setSaving(false)
      return
    }

    const data = (await res.json()) as { kb: TrainingKb; configured: boolean }
    setDraft(kbToDraft(data.kb))
    setConfigured(data.configured)
    setSaveSuccess(true)
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-3xl mx-auto text-center py-16">
          <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando base de conhecimento...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Base de conhecimento — Treinador de Atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">
            É o gabarito que a IA usa para simular pacientes e avaliar a secretária. Preencha com a verdade —
            médicos, preços e o que a clínica realmente faz. É preenchido uma vez e raramente muda.
          </p>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {loadError}
          </div>
        )}

        {!loadError && (
          <>
            {!configured && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 mb-4">
                Base ainda não configurada. Enquanto não for salva, o módulo de treino fica bloqueado.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                  ✓ Base de conhecimento salva com sucesso.
                </div>
              )}

              <Section title="Médicos" description="Quem atende, com anos de experiência reais — é o que impede a secretária de inventar credenciais.">
                <DoctorsEditor doctors={draft.doctors} onChange={doctors => setDraft(d => ({ ...d, doctors }))} />
              </Section>

              <Section title="Consulta">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Valor (R$)">
                    <input
                      value={draft.consultation.price}
                      onChange={e => setDraft(d => ({ ...d, consultation: { ...d.consultation, price: e.target.value } }))}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Duração">
                    <input
                      value={draft.consultation.durationLabel}
                      onChange={e => setDraft(d => ({ ...d, consultation: { ...d.consultation, durationLabel: e.target.value } }))}
                      placeholder="1h30 a 2h"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Retorno incluso em (semanas)">
                    <input
                      value={draft.consultation.returnWeeks}
                      onChange={e => setDraft(d => ({ ...d, consultation: { ...d.consultation, returnWeeks: onlyDigits(e.target.value) } }))}
                      inputMode="numeric"
                      placeholder="8"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">O que está incluso</label>
                  <StringListEditor
                    items={draft.consultation.includes}
                    onChange={includes => setDraft(d => ({ ...d, consultation: { ...d.consultation, includes } }))}
                    placeholder="Bioimpedância"
                    addLabel="adicionar item"
                  />
                </div>
              </Section>

              <Section title="Planos de acompanhamento" description="Gabarito para quando a paciente já consultou e está decidindo o protocolo.">
                <PlansEditor plans={draft.plans} onChange={plans => setDraft(d => ({ ...d, plans }))} />
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Como funciona o valor dos planos
                  </label>
                  <textarea
                    value={draft.plansNote}
                    onChange={e => setDraft(d => ({ ...d, plansNote: e.target.value }))}
                    rows={3}
                    placeholder="Ex.: o valor do plano não é tabelado — a médica define caso a caso na consulta, conforme o protocolo. A secretária nunca informa um valor de plano."
                    className={textareaClass}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use este campo quando os planos não têm preço fixo. Sem ele, a avaliação entende
                    que o assunto não foi cadastrado e deixa de cobrar — quando na verdade citar um
                    valor inventado é justamente o erro a ser pego.
                  </p>
                </div>
              </Section>

              <Section title="Pagamento">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Formas de pagamento aceitas</label>
                  <StringListEditor
                    items={draft.payment.methods}
                    onChange={methods => setDraft(d => ({ ...d, payment: { ...d.payment, methods } }))}
                    placeholder="PIX"
                    addLabel="adicionar forma"
                  />
                </div>
                <Field label="Parcelamento">
                  <input
                    value={draft.payment.installments}
                    onChange={e => setDraft(d => ({ ...d, payment: { ...d.payment, installments: e.target.value } }))}
                    placeholder="3x sem juros"
                    className={inputClass}
                  />
                </Field>
                <Field label="Política de desconto">
                  <textarea
                    value={draft.payment.discountPolicy}
                    onChange={e => setDraft(d => ({ ...d, payment: { ...d.payment, discountPolicy: e.target.value } }))}
                    rows={2}
                    placeholder="Não há desconto."
                    className={textareaClass}
                  />
                </Field>
              </Section>

              <Section title="Convênio">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.insurance.accepts}
                    onChange={e => setDraft(d => ({ ...d, insurance: { ...d.insurance, accepts: e.target.checked } }))}
                    className="accent-violet-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Atende convênio</span>
                </label>
                <Field label="Observação (nota fiscal, reembolso etc.)">
                  <textarea
                    value={draft.insurance.note}
                    onChange={e => setDraft(d => ({ ...d, insurance: { ...d.insurance, note: e.target.value } }))}
                    rows={2}
                    placeholder="Não atendemos convênio. Emitimos nota para reembolso."
                    className={textareaClass}
                  />
                </Field>
              </Section>

              <Section title="Procedimentos estéticos">
                <ProceduresEditor procedures={draft.procedures} onChange={procedures => setDraft(d => ({ ...d, procedures }))} />
              </Section>

              <Section title="Canetas de emagrecimento" description="Política sobre Ozempic, Mounjaro etc. — a secretária nunca pode indicar dose.">
                <textarea
                  value={draft.weightLossDrugsPolicy}
                  onChange={e => setDraft(d => ({ ...d, weightLossDrugsPolicy: e.target.value }))}
                  rows={3}
                  placeholder="Só a médica avalia se há indicação, na consulta."
                  className={textareaClass}
                />
              </Section>

              <Section title="No-show e remarcação">
                <textarea
                  value={draft.noShowPolicy}
                  onChange={e => setDraft(d => ({ ...d, noShowPolicy: e.target.value }))}
                  rows={3}
                  placeholder="Sem taxa. Duas tentativas de recuperação antes de liberar o horário."
                  className={textareaClass}
                />
              </Section>

              <Section title="Links oficiais">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Site">
                    <input
                      value={draft.links.site}
                      onChange={e => setDraft(d => ({ ...d, links: { ...d.links, site: e.target.value } }))}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Instagram">
                    <input
                      value={draft.links.instagram}
                      onChange={e => setDraft(d => ({ ...d, links: { ...d.links, instagram: e.target.value } }))}
                      placeholder="https://instagram.com/..."
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Google">
                    <input
                      value={draft.links.google}
                      onChange={e => setDraft(d => ({ ...d, links: { ...d.links, google: e.target.value } }))}
                      placeholder="https://g.co/..."
                      className={inputClass}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="🚫 Linhas vermelhas"
                description="O que a secretária NUNCA pode fazer — prometer resultado, inventar estatística, falar de medicação ou de desconto/parcelamento que não existe. Uma linha cruzada reprova o treino inteiro, mesmo com nota alta no resto."
                tone="danger"
              >
                <StringListEditor
                  items={draft.redLines}
                  onChange={redLines => setDraft(d => ({ ...d, redLines }))}
                  placeholder="Prometer quantidade de peso ou prazo"
                  addLabel="adicionar linha vermelha"
                  multiline
                />
              </Section>

              <Section title="Respostas-modelo" description="Frases prontas que a clínica quer ver usadas — servem de referência de tom para a avaliadora.">
                <StringListEditor
                  items={draft.modelAnswers}
                  onChange={modelAnswers => setDraft(d => ({ ...d, modelAnswers }))}
                  placeholder="Entendo perfeitamente sua cautela."
                  addLabel="adicionar resposta-modelo"
                  multiline
                />
              </Section>

              <div className="flex justify-end pb-8">
                <button type="submit" disabled={saving} className={primaryBtn}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
