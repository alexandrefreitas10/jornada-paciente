'use server'
import { portalSignIn } from '@/auth-portal'

export async function portalLogin(prevState: { error: string } | null, formData: FormData) {
  try {
    await portalSignIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/portal/paciente',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('NEXT_REDIRECT') || msg.includes('redirect')) throw e
    return { error: 'E-mail ou senha incorretos' }
  }
  return null
}
