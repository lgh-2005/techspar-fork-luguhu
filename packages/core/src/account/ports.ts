import type { RequestContext } from '../kernel/context.ts'
import type { AuthUser, ManagedUser, ManagedUserList, UpdateManagedUserInput } from './model.ts'

export interface UserRepository {
  findByEmail(email: string): Promise<(AuthUser & { password: string }) | undefined>
  findById(id: string): Promise<AuthUser | undefined>
  create(input: { id: string; email: string; password: string; name: string }): Promise<AuthUser>
  updatePassword(id: string, password: string): Promise<void>
  /** 管理员列表用。按邮箱升序，保证每次刷新顺序稳定。 */
  list(): Promise<ManagedUser[]>
  /**
   * 账号是否仍可继续使用（存在且未停用）。
   *
   * 鉴权链路拿它做即时吊销——否则「删除」和「停用」对已经签发出去的 token 毫无作用，
   * 那是 7 天的空窗期。
   */
  isActive(id: string): Promise<boolean>
  setDisabled(id: string, disabled: boolean): Promise<ManagedUser | undefined>
  /** 删除账号并级联清理该用户在库里的全部数据。返回是否真的删掉了。 */
  delete(id: string): Promise<boolean>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}

export interface TokenService {
  create(userId: string): Promise<string>
  decode(token: string): Promise<string | undefined>
}

export interface IdGenerator {
  next(): string
}

/** 删除账号时清理落在磁盘上的用户目录。 */
export interface UserDataStore {
  /** 删除该用户的全部本地文件，返回是否删除了目录。 */
  removeUser(userId: string): Promise<boolean>
}

export interface AuthUseCases {
  login(email: string, password: string): Promise<{ token: string; user: AuthUser }>
  register(email: string, password: string, name: string): Promise<{ token: string; user: AuthUser }>
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ status: 'ok' }>
}

export interface UserAdminUseCases {
  list(context: RequestContext): Promise<ManagedUserList>
  update(context: RequestContext, userId: string, patch: UpdateManagedUserInput): Promise<ManagedUser>
  /** files_removed 如实反映磁盘目录是否清掉；库里删干净了就算删号成功。 */
  remove(context: RequestContext, userId: string): Promise<{ ok: true; deleted: string; files_removed: boolean }>
}

export type AuthPolicy = {
  allowRegistration: boolean
}
