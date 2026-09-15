import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { AuthUser, ManagedUser, UserRepository } from '@techspar/core'
import { users } from './schema.ts'

/**
 * 删号时要一并清掉的、以 user_id 归属的表。
 *
 * 表名只会来自这份白名单（拼进 SQL 之前不经过任何外部输入），所以下面的字符串
 * 拼接是安全的。新增带 user_id 的表时记得往这里补一项，否则会留下孤儿数据。
 */
const USER_DATA_TABLES = [
  'sessions',
  'resume_interview_state',
  'copilot_preps',
  'copilot_realtime_sessions',
  'personal_documents',
  'personal_conversations',
  'memory_vectors',
  'question_embeddings',
  'llm_usage',
  'tasks',
] as const

/** 上游早期把 created_at 的默认值写成字符串，旧行里存的就是这串文本本身。 */
const LEGACY_TIMESTAMP_LITERAL = 'CURRENT_TIMESTAMP'

function authUser(row: typeof users.$inferSelect, defaultEmail: string): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    is_admin: row.email === defaultEmail.toLowerCase().trim(),
  }
}

function managedUser(row: typeof users.$inferSelect, defaultEmail: string): ManagedUser {
  const createdAt = (row.createdAt || '').trim()
  return {
    ...authUser(row, defaultEmail),
    disabled: row.disabled === true,
    // 老数据里这列是字面量而非时间戳，宁可报「未知」也不要显示一串假时间。
    created_at: createdAt === LEGACY_TIMESTAMP_LITERAL ? '' : createdAt,
  }
}

export class BunUserRepository implements UserRepository {
  private readonly sqlite: Database
  private readonly db: ReturnType<typeof drizzle>

  constructor(path: string, private readonly defaultEmail: string) {
    this.sqlite = new Database(path, { create: true })
    this.sqlite.exec('PRAGMA journal_mode = WAL')
    this.db = drizzle(this.sqlite)
  }

  initialize(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        disabled INTEGER NOT NULL DEFAULT 0
      )
    `)
    // 既有库补列。没有这一步，升级后老实例一查 disabled 就报 no such column。
    const columns = new Set(
      this.sqlite.query<{ name: string }, []>('PRAGMA table_info(users)').all().map((row) => row.name),
    )
    if (!columns.has('disabled')) {
      this.sqlite.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0')
    }
  }

  async findByEmail(email: string): Promise<(AuthUser & { password: string }) | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)
    return row ? { ...authUser(row, this.defaultEmail), password: row.password } : undefined
  }

  async findById(id: string): Promise<AuthUser | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ? authUser(row, this.defaultEmail) : undefined
  }

  async create(input: { id: string; email: string; password: string; name: string }): Promise<AuthUser> {
    const normalized = input.email.toLowerCase().trim()
    await this.db.insert(users).values({ ...input, email: normalized })
    return { id: input.id, email: normalized, name: input.name, is_admin: normalized === this.defaultEmail.toLowerCase().trim() }
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await this.db.update(users).set({ password }).where(eq(users.id, id))
  }

  async list(): Promise<ManagedUser[]> {
    const rows = await this.db.select().from(users).orderBy(users.email)
    return rows.map((row) => managedUser(row, this.defaultEmail))
  }

  async isActive(id: string): Promise<boolean> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return Boolean(row) && row!.disabled !== true
  }

  async setDisabled(id: string, disabled: boolean): Promise<ManagedUser | undefined> {
    await this.db.update(users).set({ disabled }).where(eq(users.id, id))
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ? managedUser(row, this.defaultEmail) : undefined
  }

  async delete(id: string): Promise<boolean> {
    // 整段放进一个事务：删到一半失败会留下「账号没了但数据还在」的孤儿状态，
    // 那种状态既占空间又无法从界面清理。
    const purge = this.sqlite.transaction((userId: string) => {
      const present = new Set(
        this.sqlite.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
      )
      for (const table of USER_DATA_TABLES) {
        // 表可能还没被 create（各 repository 有各自的 initialize），跳过不存在的。
        if (!present.has(table)) continue
        this.sqlite.query(`DELETE FROM ${table} WHERE user_id = $userId`).run({ $userId: userId })
      }
      const removed = this.sqlite.query('DELETE FROM users WHERE id = $id').run({ $id: userId })
      return removed.changes > 0
    })
    return purge(id)
  }

  close(): void {
    this.sqlite.close()
  }
}

export * from './schema.ts'
export * from './usage-repository.ts'
export * from './knowledge-vector-repository.ts'
export * from './interview-repositories.ts'
export * from './personal-agent-repository.ts'
export * from './data-migration-repository.ts'
export * from './copilot-repository.ts'
