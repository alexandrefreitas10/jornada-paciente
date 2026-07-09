'use server'
import { portalSignOut } from '@/auth-portal'

export async function logoutPortal() {
  await portalSignOut({ redirectTo: '/portal/login' })
}
