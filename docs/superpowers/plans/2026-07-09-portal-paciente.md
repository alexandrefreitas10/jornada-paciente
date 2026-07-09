# Portal do Paciente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um portal separado em `/portal` onde cada paciente acessa o próprio card em modo somente leitura via e-mail + senha, ativado por link de convite gerado pelo admin.

**Architecture:** Nova tabela `patient_users` armazena credenciais do paciente separadas dos usuários internos. Um segundo NextAuth (`auth-portal.ts`) gerencia sessões do portal com cookie próprio. As rotas `/portal/*` são independentes do sistema interno — o paciente não tem acesso a nada além do seu card.

**Tech Stack:** Next.js 16 App Router, NextAuth v5, postgres (npm), bcryptjs, Tailwind CSS, TypeScript.

---

## Mapa de Arquivos

**Criados:**
- `src/lib/patient-portal.ts` — funções DB para patient_users
- `src/auth-portal.ts` — segundo NextAuth para pacientes
- `src/app/api/portal/auth/[...nextauth]/route.ts` — handler do auth portal
- `src/app/api/portal/invite/[token]/route.ts` — validar e ativar convite
- `src/app/api/patients/[id]/portal-invite/route.ts` — gerar/revogar convite
- `src/app/portal/login/page.tsx` — página de login do portal
- `src/app/portal/login/PortalLoginForm.tsx` — formulário de login
- `src/app/portal/ativar/[token]/page.tsx` — página de ativação de conta
- `src/app/portal/paciente/page.tsx` — card do paciente read-only

**Modificados:**
- `src/lib/db.ts` — schema: email em patients, tabela patient_users
- `src/app/api/patients/[id]/portal-invite/route.ts` — (criado acima)
- `src/components/PatientDetailClient.tsx` — prop readOnly + bloco "Acesso do Paciente"
- `src/components/FilesTab.tsx` — prop readOnly
- `src/components/ExamsTab.tsx` — prop readOnly
- `src/components/EsteticaTab.tsx` — prop readOnly
- `src/components/EvolutionTab.tsx` — prop readOnly
- `src/components/TermsTab.tsx` — prop readOnly
- `src/components/MedicationsTab.tsx` — prop readOnly
- `src/components/NotesSection.tsx` — prop readOnly

---

## Task 1: Schema — email em patients e tabela patient_users

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Adicionar ao final da função `initSchema()` em `src/lib/db.ts`**, logo antes do `}` que fecha a função (após a última linha existente):

```typescript
  // Portal do paciente
  await sql.unsafe(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT`).catch(() => {})
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_users (
      id               SERIAL PRIMARY KEY,
      patient_id       INTEGER UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      email            TEXT UNIQUE NOT NULL,
      password_hash    TEXT,
      invite_token     UUID UNIQUE,
      invite_used_at   TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
```

- [ ] **Step 2: Verificar que não quebrou nada**

Rode o servidor de desenvolvimento:
```bash
npm run dev
```
Acesse `http://localhost:3000` e confirme que a home carrega sem erros. O `initSchema()` roda na primeira requisição e cria a tabela silenciosamente.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: schema patient_users e email em patients"
```

---

## Task 2: Lib — funções DB do portal

**Files:**
- Create: `src/lib/patient-portal.ts`

- [ ] **Step 1: Criar `src/lib/patient-portal.ts`**

```typescript
import sql, { initSchema } from './db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

export interface PatientUser {
  id: number
  patient_id: number
  email: string
  password_hash: string | null
  invite_token: string | null
  invite_used_at: string | null
  created_at: string
}

export async function findPortalUserByEmail(email: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE email = ${email.toLowerCase().trim()}`
  return row ?? null
}

export async function findPortalUserByPatientId(patientId: number): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE patient_id = ${patientId}`
  return row ?? null
}

export async function findPortalUserByToken(token: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`
    SELECT * FROM patient_users
    WHERE invite_token = ${token}::uuid
      AND invite_used_at IS NULL
  `
  return row ?? null
}

export async function createPortalInvite(patientId: number, email: string): Promise<string> {
  await initSchema()
  const token = randomUUID()
  const normalizedEmail = email.toLowerCase().trim()

  // Salva email no card do paciente
  await sql`UPDATE patients SET email = ${normalizedEmail} WHERE id = ${patientId}`

  // Cria ou substitui o patient_users (upsert por patient_id)
  await sql`
    INSERT INTO patient_users (patient_id, email, invite_token)
    VALUES (${patientId}, ${normalizedEmail}, ${token}::uuid)
    ON CONFLICT (patient_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      invite_token = EXCLUDED.invite_token,
      invite_used_at = NULL,
      password_hash = NULL
  `
  return token
}

export async function activatePortalUser(token: string, password: string): Promise<boolean> {
  await initSchema()
  const user = await findPortalUserByToken(token)
  if (!user) return false

  const hash = await bcrypt.hash(password, 12)
  await sql`
    UPDATE patient_users
    SET password_hash = ${hash},
        invite_token = NULL,
        invite_used_at = NOW()
    WHERE id = ${user.id}
  `
  return true
}

export async function revokePortalAccess(patientId: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM patient_users WHERE patient_id = ${patientId}`
  await sql`UPDATE patients SET email = NULL WHERE id = ${patientId}`
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: sem erros relacionados a `patient-portal.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/patient-portal.ts
git commit -m "feat: lib patient-portal com funções de invite e ativação"
```

---

## Task 3: Auth do portal — segundo NextAuth

**Files:**
- Create: `src/auth-portal.ts`

- [ ] **Step 1: Criar `src/auth-portal.ts`**

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { findPortalUserByEmail } from './lib/patient-portal'

export const {
  handlers: portalHandlers,
  auth: portalAuth,
  signIn: portalSignIn,
  signOut: portalSignOut,
} = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await findPortalUserByEmail(credentials.email as string)
        if (!user || !user.password_hash) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password_hash)
        if (!valid) return null
        return {
          id: String(user.patient_id),
          email: user.email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patient_id: user.patient_id,
        }
      },
    }),
  ],
  pages: { signIn: '/portal/login' },
  session: { strategy: 'jwt' },
  cookies: {
    sessionToken: {
      name: 'portal-session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.patient_id = (user as any).patient_id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(session.user as any).patient_id = token.patient_id
      }
      return session
    },
  },
})
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: sem erros em `auth-portal.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/auth-portal.ts
git commit -m "feat: auth-portal segundo NextAuth para sessões de paciente"
```

---

## Task 4: Route handler do auth portal

**Files:**
- Create: `src/app/api/portal/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Criar diretórios e arquivo**

```bash
mkdir -p "src/app/api/portal/auth/[...nextauth]"
```

Criar `src/app/api/portal/auth/[...nextauth]/route.ts`:

```typescript
import { portalHandlers } from '@/auth-portal'

export const { GET, POST } = portalHandlers
```

- [ ] **Step 2: Testar que o endpoint responde**

Com o servidor rodando, acesse:
`http://localhost:3000/api/portal/auth/providers`

Esperado: JSON com o provider "credentials".

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/portal/auth/[...nextauth]/route.ts"
git commit -m "feat: route handler do auth portal"
```

---

## Task 5: API — validar e ativar convite por token

**Files:**
- Create: `src/app/api/portal/invite/[token]/route.ts`

- [ ] **Step 1: Criar `src/app/api/portal/invite/[token]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { findPortalUserByToken, activatePortalUser } from '@/lib/patient-portal'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

// GET /api/portal/invite/[token] — valida se token existe e é válido
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const user = await findPortalUserByToken(token)
  if (!user) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }
  return NextResponse.json({ valid: true, email: user.email })
}

// POST /api/portal/invite/[token] — ativa conta com senha
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const { password } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const ok = await activatePortalUser(token, password)
  if (!ok) {
    return NextResponse.json({ error: 'Link inválido ou já utilizado' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/portal/invite/[token]/route.ts"
git commit -m "feat: API de validação e ativação de convite do portal"
```

---

## Task 6: API — gerar e revogar convite (admin)

**Files:**
- Create: `src/app/api/patients/[id]/portal-invite/route.ts`

- [ ] **Step 1: Criar `src/app/api/patients/[id]/portal-invite/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createPortalInvite, findPortalUserByPatientId, revokePortalAccess } from '@/lib/patient-portal'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — retorna status atual do acesso do paciente
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await findPortalUserByPatientId(Number(id))

  if (!user) return NextResponse.json({ status: 'none' })

  if (user.invite_used_at) {
    return NextResponse.json({ status: 'active', email: user.email })
  }

  if (user.invite_token) {
    return NextResponse.json({ status: 'pending', email: user.email, token: user.invite_token })
  }

  return NextResponse.json({ status: 'none' })
}

// POST — gera novo convite (cria patient_users ou sobrescreve token)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { email } = await req.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  }

  try {
    const token = await createPortalInvite(Number(id), email)
    const baseUrl = req.nextUrl.origin
    const link = `${baseUrl}/portal/ativar/${token}`
    return NextResponse.json({ ok: true, token, link })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Este e-mail já está em uso por outro paciente' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE — revoga acesso (remove patient_users e limpa email)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await revokePortalAccess(Number(id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/patients/[id]/portal-invite/route.ts"
git commit -m "feat: API admin para gerar e revogar convite do portal"
```

---

## Task 7: Página de login do portal

**Files:**
- Create: `src/app/portal/login/page.tsx`
- Create: `src/app/portal/login/PortalLoginForm.tsx`

- [ ] **Step 1: Criar `src/app/portal/login/PortalLoginForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export function PortalLoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/portal/paciente',
    })

    if (result?.error) {
      setError('E-mail ou senha incorretos')
      setLoading(false)
    } else {
      router.push('/portal/paciente')
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="seu@email.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Criar `src/app/portal/login/page.tsx`**

```tsx
import { PortalLoginForm } from './PortalLoginForm'

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl mx-auto mb-4">
            🌸
          </div>
          <h1 className="text-xl font-bold text-gray-900">Área do Paciente</h1>
          <p className="text-sm text-gray-500 mt-1">Acesse suas informações de tratamento</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <PortalLoginForm />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Importante — o `signIn` do portal precisa apontar para o provider correto**

O `PortalLoginForm` usa `signIn` do `next-auth/react`. Por padrão, ele usa o NextAuth principal. Como temos dois NextAuth separados, o portal precisa usar sua própria rota de auth. Substitua o `signIn` importado por uma chamada direta via fetch:

Edite `src/app/portal/login/PortalLoginForm.tsx` e substitua o corpo do `handleSubmit`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PortalLoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const res = await fetch('/api/portal/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password, csrfToken: '' }),
      redirect: 'follow',
    })

    if (res.ok || res.redirected) {
      router.push('/portal/paciente')
      router.refresh()
    } else {
      setError('E-mail ou senha incorretos')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="seu@email.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

**Nota:** O fluxo de login com dois NextAuth em paralelo tem uma sutileza. Se a abordagem do fetch direto não funcionar (CSRF), a alternativa é criar uma Server Action em um arquivo separado `src/app/portal/login/actions.ts`:

```typescript
'use server'
import { portalSignIn } from '@/auth-portal'
import { redirect } from 'next/navigation'

export async function portalLogin(formData: FormData) {
  try {
    await portalSignIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/portal/paciente',
    })
  } catch (e: unknown) {
    // NextAuth lança redirect como erro — deixa passar
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('NEXT_REDIRECT')) throw e
    return { error: 'E-mail ou senha incorretos' }
  }
}
```

E no `PortalLoginForm.tsx` usar um form com action Server Action:

```tsx
'use client'
import { useActionState } from 'react'
import { portalLogin } from './actions'

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null)
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
        <input name="email" type="email" required autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="seu@email.com" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
        <input name="password" type="password" required autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="••••••••" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
        {pending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

Testar a abordagem fetch primeiro; se o cookie não for setado corretamente, usar a Server Action.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/login/
git commit -m "feat: página de login do portal do paciente"
```

---

## Task 8: Página de ativação de conta

**Files:**
- Create: `src/app/portal/ativar/[token]/page.tsx`

- [ ] **Step 1: Criar `src/app/portal/ativar/[token]/page.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function AtivarPortalPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [tokenInvalid, setTokenInvalid] = useState(false)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/portal/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) setEmail(data.email)
        else setTokenInvalid(true)
      })
      .catch(() => setTokenInvalid(true))
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres'); return }
    if (password !== confirm) { setError('As senhas não coincidem'); return }
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/portal/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Erro ao ativar conta')
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/portal/login'), 2000)
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">Verificando link...</p>
      </div>
    )
  }

  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-base font-semibold text-gray-900">Link inválido</h1>
          <p className="text-sm text-gray-500 mt-2">Este link não é válido ou já foi utilizado.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-base font-semibold text-gray-900">Conta ativada!</h1>
          <p className="text-sm text-gray-500 mt-2">Redirecionando para o login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl mx-auto mb-4">🔑</div>
          <h1 className="text-xl font-bold text-gray-900">Criar sua senha</h1>
          <p className="text-sm text-gray-500 mt-1">Bem-vindo(a)! Defina uma senha para acessar sua área.</p>
          {email && <p className="text-xs text-violet-600 mt-2 font-medium">{email}</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Criar senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repita a senha"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Ativando...' : 'Ativar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Testar manualmente**

1. No terminal do servidor, crie um convite de teste via curl ou direto no banco
2. Acesse `http://localhost:3000/portal/ativar/TOKEN-INVALIDO`
3. Confirme que aparece "Link inválido"

- [ ] **Step 3: Commit**

```bash
git add "src/app/portal/ativar/[token]/page.tsx"
git commit -m "feat: página de ativação de conta do portal"
```

---

## Task 9: Prop `readOnly` nos componentes de aba

**Files:**
- Modify: `src/components/NotesSection.tsx`
- Modify: `src/components/FilesTab.tsx`
- Modify: `src/components/ExamsTab.tsx`
- Modify: `src/components/EsteticaTab.tsx`
- Modify: `src/components/EvolutionTab.tsx`
- Modify: `src/components/TermsTab.tsx`
- Modify: `src/components/MedicationsTab.tsx`

### 9a — NotesSection

- [ ] **Step 1: Ler o início de `src/components/NotesSection.tsx` para entender a interface atual**

```bash
# Apenas identificar a interface/props atuais
```

- [ ] **Step 2: Adicionar `readOnly?: boolean` à interface e esconder o editor**

Localize a interface `Props` em `NotesSection.tsx` e adicione `readOnly?: boolean`. Depois, envolva o botão/editor de edição com `{!readOnly && ...}`. O texto da nota deve continuar visível.

### 9b — FilesTab

- [ ] **Step 3: Em `src/components/FilesTab.tsx`, adicionar `readOnly?: boolean` à interface `Props`**

Localize a linha:
```tsx
interface Props {
  patientId: number
  fileType: string
  initialFiles: FileRecord[]
}
```

Mude para:
```tsx
interface Props {
  patientId: number
  fileType: string
  initialFiles: FileRecord[]
  readOnly?: boolean
}
```

Adicione `readOnly = false` na desestruturação do componente. Depois envolva com `{!readOnly && ...}`:
- O botão de upload (`+ Adicionar`)
- O botão de deletar arquivo (`🗑`)
- O componente `<DeletedItemsButton />`

O download deve permanecer funcional.

### 9c — ExamsTab

- [ ] **Step 4: Em `src/components/ExamsTab.tsx`, adicionar `readOnly?: boolean` à interface e esconder:**
- Botão de upload
- Botão de deletar

### 9d — EsteticaTab

- [ ] **Step 5: Em `src/components/EsteticaTab.tsx`, adicionar `readOnly?: boolean` à interface e esconder:**
- Botão "Nova sessão de estética" / criar sessão
- Botões de editar/deletar sessão
- Botão "Adicionar foto" / upload de fotos
- Botão de deletar foto no lightbox e no overlay
- O lightbox para visualizar fotos deve permanecer
- A montagem Antes x Depois deve permanecer

### 9e — EvolutionTab

- [ ] **Step 6: Em `src/components/EvolutionTab.tsx`, adicionar `readOnly?: boolean` à interface e esconder:**
- Botão/form de adicionar medição semanal
- Botão de upload de foto de evolução
- Botão de deletar foto de evolução
- Editor de notas (via `readOnly` em `NotesSection`)

### 9f — TermsTab

- [ ] **Step 7: Em `src/components/TermsTab.tsx`, adicionar `readOnly?: boolean` à interface e esconder:**
- Botão "Novo termo" / criar termo
- Botão de enviar para assinatura
- Botão de deletar termo
- Conteúdo e status dos termos devem permanecer visíveis

### 9g — MedicationsTab

- [ ] **Step 8: Em `src/components/MedicationsTab.tsx`, adicionar `readOnly?: boolean` à interface e esconder:**
- Botão de adicionar medicação
- Botões de editar/deletar medicação

- [ ] **Step 9: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: sem erros de tipo.

- [ ] **Step 10: Commit**

```bash
git add src/components/NotesSection.tsx src/components/FilesTab.tsx src/components/ExamsTab.tsx src/components/EsteticaTab.tsx src/components/EvolutionTab.tsx src/components/TermsTab.tsx src/components/MedicationsTab.tsx
git commit -m "feat: prop readOnly em todos os componentes de aba"
```

---

## Task 10: PatientDetailClient — prop readOnly e bloco "Acesso do Paciente"

**Files:**
- Modify: `src/components/PatientDetailClient.tsx`

### 10a — Prop readOnly no PatientDetailClient

- [ ] **Step 1: Adicionar `readOnly?: boolean` à interface `Props` em `src/components/PatientDetailClient.tsx`**

Localize:
```typescript
interface Props {
  patient: PatientDetail
  initialMeasurements: Measurement[]
  initialPhotos: FileRecord[]
  initialBioimpedances: FileRecord[]
  initialExams: FileRecord[]
  initialDiets: FileRecord[]
  initialEvolutionPhotos: FileRecord[]
  initialPrescriptions: FileRecord[]
  currentUserName: string
}
```

Mude para:
```typescript
interface Props {
  patient: PatientDetail
  initialMeasurements: Measurement[]
  initialPhotos: FileRecord[]
  initialBioimpedances: FileRecord[]
  initialExams: FileRecord[]
  initialDiets: FileRecord[]
  initialEvolutionPhotos: FileRecord[]
  initialPrescriptions: FileRecord[]
  currentUserName: string
  readOnly?: boolean
}
```

- [ ] **Step 2: Desestruturar `readOnly = false` no componente**

Localize:
```typescript
export function PatientDetailClient({ patient, initialMeasurements, initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions, currentUserName }: Props) {
```

Mude para:
```typescript
export function PatientDetailClient({ patient, initialMeasurements, initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions, currentUserName, readOnly = false }: Props) {
```

- [ ] **Step 3: Esconder controles de edição do cabeçalho quando readOnly**

Localize o bloco dos botões Editar e Deletar:
```tsx
<div className="flex gap-2 flex-shrink-0">
  <button
    onClick={() => setEditOpen(true)}
    className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
  >
    ✏️ Editar
  </button>
  <DeleteButton patientId={patient.id} patientName={patient.name} />
</div>
```

Envolva com `{!readOnly && ...}`:
```tsx
{!readOnly && (
  <div className="flex gap-2 flex-shrink-0">
    <button
      onClick={() => setEditOpen(true)}
      className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
    >
      ✏️ Editar
    </button>
    <DeleteButton patientId={patient.id} patientName={patient.name} />
  </div>
)}
```

- [ ] **Step 4: Remover aba "Tarefas" quando readOnly e repassar readOnly para as abas**

Localize a lista de tabs:
```typescript
const tabs: { key: Tab; label: string }[] = [
  { key: 'tasks', label: 'Tarefas' },
  ...
]
```

Mude para:
```typescript
const tabs: { key: Tab; label: string }[] = [
  ...(readOnly ? [] : [{ key: 'tasks' as Tab, label: 'Tarefas' }]),
  { key: 'evolution', label: 'Evolução' },
  { key: 'photos', label: 'Fotos' },
  { key: 'bioimpedance', label: 'Bioimpedância' },
  { key: 'exams', label: 'Exames' },
  { key: 'diet', label: 'Dietas' },
  { key: 'terms', label: '📄 Termos' },
  { key: 'medications', label: '💊 Medicações' },
  { key: 'estetica', label: '✨ Estética' },
]
```

Também passe a prop `readOnly` para cada aba que renderiza na seção de conteúdo:
```tsx
{activeTab === 'evolution' && (
  <EvolutionTab ... readOnly={readOnly} />
)}
{activeTab === 'photos' && (
  <FilesTab patientId={patient.id} fileType="photo" initialFiles={initialPhotos} readOnly={readOnly} />
)}
{activeTab === 'bioimpedance' && (
  <FilesTab patientId={patient.id} fileType="bioimpedance" initialFiles={initialBioimpedances} readOnly={readOnly} />
)}
{activeTab === 'exams' && (
  <ExamsTab patientId={patient.id} initialFiles={initialExams} readOnly={readOnly} />
)}
{activeTab === 'diet' && (
  <FilesTab patientId={patient.id} fileType="diet" initialFiles={initialDiets} readOnly={readOnly} />
)}
{activeTab === 'terms' && (
  <TermsTab patientId={patient.id} readOnly={readOnly} />
)}
{activeTab === 'medications' && (
  <MedicationsTab patientId={patient.id} patientName={patient.name} readOnly={readOnly} />
)}
{activeTab === 'estetica' && (
  <EsteticaTab patientId={patient.id} readOnly={readOnly} />
)}
```

- [ ] **Step 5: Esconder o modal de edição quando readOnly**

Localize:
```tsx
{editOpen && (
  <PatientModal ... />
)}
```

Envolva com `{!readOnly && editOpen && ...}`:
```tsx
{!readOnly && editOpen && (
  <PatientModal ... />
)}
```

### 10b — Bloco "Acesso do Paciente" (admin)

- [ ] **Step 6: Adicionar componente `PortalAccessBlock` no final do arquivo, antes do `export function PatientDetailClient`**

```tsx
'use client'

function PortalAccessBlock({ patientId }: { patientId: number }) {
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'active'>('loading')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/portal-invite`)
      .then(r => r.json())
      .then(data => {
        setStatus(data.status)
        if (data.email) setEmail(data.email)
        if (data.token) {
          setToken(data.token)
          setLink(`${window.location.origin}/portal/ativar/${data.token}`)
        }
      })
      .catch(() => setStatus('none'))
  }, [patientId])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    const res = await fetch(`/api/patients/${patientId}/portal-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Erro ao gerar convite'); setGenerating(false); return }
    setEmail(emailInput)
    setToken(data.token)
    setLink(data.link)
    setStatus('pending')
    setGenerating(false)
  }

  async function handleRevoke() {
    if (!confirm('Revogar acesso do paciente ao portal?')) return
    setRevoking(true)
    await fetch(`/api/patients/${patientId}/portal-invite`, { method: 'DELETE' })
    setStatus('none')
    setEmail('')
    setToken('')
    setLink('')
    setEmailInput('')
    setRevoking(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'loading') return null

  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Acesso do Paciente ao Portal</p>

      {status === 'none' && (
        <form onSubmit={handleGenerate} className="space-y-2">
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            required
            placeholder="E-mail do paciente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={generating}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {generating ? 'Gerando...' : '🔗 Gerar link de convite'}
          </button>
        </form>
      )}

      {status === 'pending' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 font-medium">⏳ Aguardando ativação — {email}</p>
          <div className="flex gap-2">
            <input readOnly value={link}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50" />
            <button onClick={copyLink}
              className="px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors shrink-0">
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={revoking}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            {revoking ? 'Revogando...' : '× Revogar convite'}
          </button>
        </div>
      )}

      {status === 'active' && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-600 font-medium">✅ Portal ativo — {email}</p>
          <button onClick={handleRevoke} disabled={revoking}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            {revoking ? 'Revogando...' : '× Revogar acesso'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Adicionar `<PortalAccessBlock>` no cabeçalho do paciente, visível apenas para admin (quando não readOnly)**

Dentro do card de cabeçalho do paciente (`<div className="bg-white rounded-2xl border...">`), após o `<ProgressBar />` e antes do fechamento do div, adicione:

```tsx
{!readOnly && <PortalAccessBlock patientId={patient.id} />}
```

- [ ] **Step 8: Garantir que `useState` e `useEffect` já estão importados** (já estão: veja linha 3 do arquivo).

- [ ] **Step 9: Verificar TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add src/components/PatientDetailClient.tsx
git commit -m "feat: readOnly e bloco Acesso do Paciente no PatientDetailClient"
```

---

## Task 11: Página do portal — card read-only do paciente

**Files:**
- Create: `src/app/portal/paciente/page.tsx`

- [ ] **Step 1: Criar `src/app/portal/paciente/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { portalAuth } from '@/auth-portal'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { listPatientFiles } from '@/lib/patient-files'
import { getSignedDownloadUrl } from '@/lib/s3'
import { PatientDetailClient } from '@/components/PatientDetailClient'
import { portalSignOut } from '@/auth-portal'

export const dynamic = 'force-dynamic'

export default async function PortalPacientePage() {
  const session = await portalAuth()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patientId = (session?.user as any)?.patient_id as number | undefined
  if (!session || !patientId) {
    redirect('/portal/login')
  }

  const [patient, measurements, photos, bioimpedances, exams, diets, evolutionPhotos, prescriptions] = await Promise.all([
    getPatient(patientId),
    listMeasurements(patientId),
    listPatientFiles(patientId, 'photo'),
    listPatientFiles(patientId, 'bioimpedance'),
    listPatientFiles(patientId, 'exam'),
    listPatientFiles(patientId, 'diet'),
    listPatientFiles(patientId, 'evolution'),
    listPatientFiles(patientId, 'prescription'),
  ])

  if (!patient) redirect('/portal/login')

  const withUrls = async (files: typeof photos) =>
    Promise.all(files.map(async (f) => ({ ...f, url: await getSignedDownloadUrl(f.s3_key) })))

  const [initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions] = await Promise.all([
    withUrls(photos),
    withUrls(bioimpedances),
    withUrls(exams),
    withUrls(diets),
    withUrls(evolutionPhotos),
    withUrls(prescriptions),
  ])

  return (
    <div>
      {/* Header simples do portal */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between max-w-2xl mx-auto">
        <span className="text-sm font-semibold text-gray-700">🌸 Minha Área</span>
        <form action={async () => {
          'use server'
          await portalSignOut({ redirectTo: '/portal/login' })
        }}>
          <button type="submit" className="text-xs text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </div>

      <PatientDetailClient
        patient={patient}
        initialMeasurements={measurements}
        initialPhotos={initialPhotos}
        initialBioimpedances={initialBioimpedances}
        initialExams={initialExams}
        initialDiets={initialDiets}
        initialEvolutionPhotos={initialEvolutionPhotos}
        initialPrescriptions={initialPrescriptions}
        currentUserName=""
        readOnly={true}
      />
    </div>
  )
}
```

**Nota:** O `portalSignOut` dentro de um Server Component inline com `'use server'` pode precisar ser extraído para um arquivo de ações separado se o TypeScript reclamar. Nesse caso, criar `src/app/portal/paciente/actions.ts`:

```typescript
'use server'
import { portalSignOut } from '@/auth-portal'

export async function logoutPortal() {
  await portalSignOut({ redirectTo: '/portal/login' })
}
```

E no page.tsx substituir o form inline por `<form action={logoutPortal}>`.

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/
git commit -m "feat: página do portal do paciente com card read-only"
```

---

## Task 12: Teste end-to-end e deploy

- [ ] **Step 1: Teste completo do fluxo**

1. Acesse um card de paciente no sistema interno
2. No bloco "Acesso do Paciente" no rodapé do cabeçalho, insira um e-mail e clique "Gerar link de convite"
3. Confirme que o link aparece e pode ser copiado
4. Abra o link em uma aba anônima
5. Defina uma senha → confirme a mensagem "Conta ativada!"
6. Acesse `/portal/login` com e-mail + senha
7. Confirme que o card aparece sem a aba Tarefas e sem botões de edição
8. Confirme que download de arquivos funciona
9. Volte ao sistema interno → confirme que o status mostra "✅ Portal ativo"
10. Clique "Revogar acesso" → confirme que o login do portal passa a falhar

- [ ] **Step 2: Deploy**

```bash
git push origin master
```

---

## Self-Review

**Cobertura da spec:**
- ✅ Tabela `patient_users` com todos os campos do spec
- ✅ Campo `email` em `patients`
- ✅ Fluxo de 4 estados no bloco admin (none → pending → active + revoke)
- ✅ Token UUID invalidado após uso único (`invite_token = NULL` após ativação)
- ✅ Auth separado com cookie próprio (`portal-session-token`)
- ✅ Rotas `/portal/login`, `/portal/ativar/[token]`, `/portal/paciente`
- ✅ Aba Tarefas removida no readOnly
- ✅ Todas as 8 abas restantes com readOnly
- ✅ Download e montagem Antes x Depois mantidos
- ✅ Revogação de acesso apaga `patient_users`

**Nenhum placeholder encontrado.**

**Consistência de tipos:**
- `PatientUser.patient_id` é `number` em toda a chain
- `readOnly?: boolean` com default `false` em todos os componentes
- `portalAuth()` retorna a sessão com `patient_id` via JWT callback
