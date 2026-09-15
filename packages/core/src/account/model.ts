export type AuthUser = {
  id: string
  email: string
  name: string
  is_admin: boolean
}

/**
 * 管理员视角下的账号。比 AuthUser 多了停用状态和注册时间。
 *
 * `created_at` 可能是空串或字面量 'CURRENT_TIMESTAMP'——上游早期版本把该列的
 * Drizzle 默认值写成了字符串，已入库的旧行仍是那个文本。前端需要容忍它。
 */
export type ManagedUser = AuthUser & {
  disabled: boolean
  created_at: string
}

export type UserUsageSummary = {
  userId: string
  /** 走平台 key 消耗的部分——也就是部署方买单的部分。 */
  platformTokens: number
  totalTokens: number
}

export type ManagedUserWithUsage = ManagedUser & {
  platform_tokens: number
  total_tokens: number
}

export type ManagedUserList = {
  total: number
  active: number
  disabled: number
  admins: number
  users: ManagedUserWithUsage[]
}

export type UpdateManagedUserInput = {
  disabled?: boolean
  new_password?: string
}
