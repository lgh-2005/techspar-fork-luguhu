import { describe, expect, test } from 'bun:test'
import {
  UserAdminService,
  type AuthUser,
  type ManagedUser,
  type PasswordHasher,
  type RequestContext,
  type UsageRepository,
  type UserDataStore,
  type UserRepository,
} from '@techspar/core'

const context = (userId: string): RequestContext => ({ requestId: 'test', userId, signal: new AbortController().signal })

class StubUsers implements UserRepository {
  constructor(private rows: Array<ManagedUser & { password: string }>) {}
  private publicRows(): ManagedUser[] { return this.rows.map(({ password: _password, ...user }) => user) }
  async findByEmail(email: string) { return this.rows.find((row) => row.email === email) }
  async findById(id: string) { return this.publicRows().find((row) => row.id === id) }
  async create(): Promise<AuthUser> { throw new Error('not used') }
  async updatePassword(id: string, password: string) { const row = this.rows.find((item) => item.id === id); if (row) row.password = password }
  async list() { return this.publicRows() }
  async isActive(id: string) { const row = this.rows.find((item) => item.id === id); return Boolean(row) && !row!.disabled }
  async setDisabled(id: string, disabled: boolean) {
    const row = this.rows.find((item) => item.id === id)
    if (!row) return undefined
    row.disabled = disabled
    const { password: _password, ...user } = row
    return user
  }
  async delete(id: string) { const index = this.rows.findIndex((item) => item.id === id); if (index < 0) return false; this.rows.splice(index, 1); return true }
}

const passwords: PasswordHasher = { async hash(value) { return `hashed:${value}` }, async verify() { return true } }
const usage: UsageRepository = {
  initialize() {},
  async record() {},
  async platformCallsToday() { return 0 },
  async platformTokensToday() { return 0 },
  async platformTokensSince() { return 0 },
  async summarizeByUser() { return [{ userId: 'admin', platformTokens: 10, totalTokens: 30 }, { userId: 'member', platformTokens: 5, totalTokens: 5 }] },
}

function build(rows: Array<ManagedUser & { password: string }>) {
  const users = new StubUsers(rows)
  const purged: string[] = []
  const data: UserDataStore = { async removeUser(id) { purged.push(id); return true } }
  return { users, purged, service: new UserAdminService({ users, passwords, usage, data }) }
}

const admin: ManagedUser & { password: string } = { id: 'admin', email: 'admin@techspar.local', name: 'Admin', is_admin: true, disabled: false, created_at: '2026-09-15 10:00:00', password: 'x' }
const member: ManagedUser & { password: string } = { id: 'member', email: 'member@example.com', name: 'Member', is_admin: false, disabled: false, created_at: '', password: 'x' }

describe('user administration', () => {
  test('reports counts and merges each account with its own usage', async () => {
    const { service } = build([admin, member])
    const list = await service.list(context('admin'))
    expect(list.total).toBe(2)
    expect(list.active).toBe(2)
    expect(list.admins).toBe(1)
    expect(list.users.find((user) => user.id === 'member')?.platform_tokens).toBe(5)
  })

  test('refuses every mutation for non-administrators', async () => {
    const { service } = build([admin, member])
    await expect(service.list(context('member'))).rejects.toThrow(/administrators/i)
    await expect(service.update(context('member'), 'member', { disabled: true })).rejects.toThrow(/administrators/i)
    await expect(service.remove(context('member'), 'admin')).rejects.toThrow(/administrators/i)
  })

  test('protects the derived administrator from disable and delete', async () => {
    const { service, purged } = build([admin, member])
    // 管理员由 DEFAULT_EMAIL 派生，停用或删除它等于让全站再没人能管理。
    await expect(service.update(context('admin'), 'admin', { disabled: true })).rejects.toThrow(/不能停用管理员/)
    await expect(service.remove(context('admin'), 'admin')).rejects.toThrow(/不能删除管理员/)
    expect(purged).toEqual([])
  })

  test('disables a member and purges both the row and the local files on delete', async () => {
    const { service, purged, users } = build([admin, member])
    expect((await service.update(context('admin'), 'member', { disabled: true })).disabled).toBe(true)
    await expect(users.isActive('member')).resolves.toBe(false)

    const deleted = await service.remove(context('admin'), 'member')
    expect(deleted).toEqual({ ok: true, deleted: 'member', files_removed: true })
    expect(purged).toEqual(['member'])
    await expect(users.list()).resolves.toHaveLength(1)
  })

  test('hashes a reset password instead of storing it verbatim', async () => {
    const { service, users } = build([admin, member])
    await service.update(context('admin'), 'member', { new_password: 'brand-new-secret' })
    expect((await users.findByEmail('member@example.com'))?.password).toBe('hashed:brand-new-secret')
  })
})
