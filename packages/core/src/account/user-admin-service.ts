import type { RequestContext } from '../kernel/context.ts'
import { AppError, AuthenticationError } from '../kernel/errors.ts'
import type { UsageRepository } from '../provider/ports.ts'
import type { AuthUser, ManagedUser, ManagedUserList, ManagedUserWithUsage, UpdateManagedUserInput } from './model.ts'
import type { PasswordHasher, UserAdminUseCases, UserDataStore, UserRepository } from './ports.ts'

/**
 * 账号管理。只有管理员可用。
 *
 * 管理员身份不是数据库里的列，而是 `email === DEFAULT_EMAIL` 推导出来的（见
 * BunUserRepository.authUser）。由此产生两条必须守住的规则：
 *   1. 停用或删除管理员账号 = 全站再没人能管理系统，所以一律拒绝；
 *   2. 无法把别人提升为管理员——那需要改身份推导方式，不在本次范围内。
 */
export class UserAdminService implements UserAdminUseCases {
  constructor(private readonly deps: {
    users: UserRepository
    passwords: PasswordHasher
    usage: UsageRepository
    data: UserDataStore
  }) {}

  private async requireAdmin(context: RequestContext): Promise<AuthUser> {
    if (!context.userId) throw new AuthenticationError()
    const me = await this.deps.users.findById(context.userId)
    if (!me?.is_admin) throw new AppError('Only administrators can manage users', 403)
    return me
  }

  private async find(id: string): Promise<ManagedUser> {
    const target = (await this.deps.users.list()).find((user) => user.id === id)
    if (!target) throw new AppError('User not found', 404)
    return target
  }

  async list(context: RequestContext): Promise<ManagedUserList> {
    await this.requireAdmin(context)
    const [users, usage] = await Promise.all([this.deps.users.list(), this.deps.usage.summarizeByUser()])
    const byUser = new Map(usage.map((row) => [row.userId, row]))
    const merged: ManagedUserWithUsage[] = users.map((user) => ({
      ...user,
      platform_tokens: byUser.get(user.id)?.platformTokens ?? 0,
      total_tokens: byUser.get(user.id)?.totalTokens ?? 0,
    }))
    return {
      total: merged.length,
      active: merged.filter((user) => !user.disabled).length,
      disabled: merged.filter((user) => user.disabled).length,
      admins: merged.filter((user) => user.is_admin).length,
      users: merged,
    }
  }

  async update(context: RequestContext, userId: string, patch: UpdateManagedUserInput): Promise<ManagedUser> {
    await this.requireAdmin(context)
    const target = await this.find(userId)
    if (target.is_admin && patch.disabled === true) {
      throw new AppError('不能停用管理员账号：管理员由 DEFAULT_EMAIL 派生，停用后将无人能再管理系统。', 400)
    }
    if (typeof patch.disabled === 'boolean') await this.deps.users.setDisabled(userId, patch.disabled)
    if (patch.new_password) {
      await this.deps.users.updatePassword(userId, await this.deps.passwords.hash(patch.new_password))
    }
    return this.find(userId)
  }

  async remove(context: RequestContext, userId: string): Promise<{ ok: true; deleted: string; files_removed: boolean }> {
    const me = await this.requireAdmin(context)
    const target = await this.find(userId)
    if (target.is_admin) {
      throw new AppError('不能删除管理员账号：管理员由 DEFAULT_EMAIL 派生，删除后将无人能再管理系统。', 400)
    }
    if (target.id === me.id) throw new AppError('不能删除自己的账号。', 400)
    if (!(await this.deps.users.delete(userId))) throw new AppError('User not found', 404)
    // 库里删干净了才算删号成功；磁盘目录属于派生数据，清不掉就照实回报，不假装成功。
    let filesRemoved = false
    try { filesRemoved = await this.deps.data.removeUser(userId) } catch { filesRemoved = false }
    return { ok: true, deleted: userId, files_removed: filesRemoved }
  }
}
