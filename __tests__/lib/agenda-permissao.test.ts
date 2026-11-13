import { decidirGravacao } from '@/lib/agenda-vagas'

describe('decidirGravacao', () => {
  it('sem motivo grava limpo, sem aviso e sem encaixe', () => {
    expect(decidirGravacao({ motivo: null, forcado: false })).toEqual({
      grava: true, status: 201, aviso: null, encaixe: false,
    })
  })
  it('sem motivo, forcado não vira encaixe (não há regra a furar)', () => {
    expect(decidirGravacao({ motivo: null, forcado: true })).toEqual({
      grava: true, status: 201, aviso: null, encaixe: false,
    })
  })
  it('com motivo e forcado=false recusa com 409 e o motivo', () => {
    expect(decidirGravacao({ motivo: 'Este horário já está ocupado por outro agendamento.', forcado: false })).toEqual({
      grava: false, status: 409, aviso: 'Este horário já está ocupado por outro agendamento.', encaixe: false,
    })
  })
  it('com motivo e forcado=true grava como encaixe COM aviso', () => {
    expect(decidirGravacao({ motivo: 'Este horário está bloqueado na agenda.', forcado: true })).toEqual({
      grava: true, status: 201, aviso: 'Este horário está bloqueado na agenda.', encaixe: true,
    })
  })
})
