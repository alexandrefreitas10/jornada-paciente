import sql, { initSchema } from './db'
import bcrypt from 'bcryptjs'

export interface User {
  id: number
  username: string
  password_hash: string
  is_admin: boolean
  created_at: string
}

export async function findUserByUsername(username: string): Promise<User | null> {
  await initSchema()
  const [user] = await sql<User[]>`SELECT * FROM users WHERE username = ${username}`
  return user ?? null
}

export async function listUsers(): Promise<Omit<User, 'password_hash'>[]> {
  await initSchema()
  return sql<Omit<User, 'password_hash'>[]>`SELECT id, username, created_at FROM users ORDER BY created_at ASC`
}

export async function createUser(username: string, password: string): Promise<Omit<User, 'password_hash'>> {
  await initSchema()
  const hash = await bcrypt.hash(password, 12)
  const [user] = await sql<User[]>`
    INSERT INTO users (username, password_hash) VALUES (${username}, ${hash}) RETURNING id, username, created_at
  `
  return user
}

export async function updateUsername(id: number, username: string): Promise<Omit<User, 'password_hash'>> {
  await initSchema()
  const [user] = await sql<User[]>`
    UPDATE users SET username = ${username} WHERE id = ${id} RETURNING id, username, is_admin, created_at
  `
  return user
}

export async function updatePassword(id: number, password: string): Promise<void> {
  await initSchema()
  const hash = await bcrypt.hash(password, 12)
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`
}

export async function deleteUser(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM users WHERE id = ${id}`
}

export async function countUsers(): Promise<number> {
  await initSchema()
  const [{ count }] = await sql<{ count: string }[]>`SELECT COUNT(*) as count FROM users`
  return Number(count)
}
