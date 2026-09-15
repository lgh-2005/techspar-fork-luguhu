import type { TokenService, UserRepository } from './ports.ts'

/**
 * 给 TokenService 加一层即时吊销。
 *
 * 签发出去的是 7 天有效的 JWT，本身无法撤回。若鉴权时只验签名，那么「停用」和
 * 「删除」对一个已登录的人要等 token 自然过期才生效——最长 7 天的空窗期，
 * 让这两个管理操作形同虚设。这里在验签之后再查一次账号状态，使两者立刻生效。
 *
 * 代价是每次带凭证的请求多一次查库。对本站这个量级可以忽略。
 */
export class RevocableTokenService implements TokenService {
  constructor(
    private readonly delegate: TokenService,
    private readonly users: UserRepository,
  ) {}

  create(userId: string): Promise<string> {
    return this.delegate.create(userId)
  }

  async decode(token: string): Promise<string | undefined> {
    const userId = await this.delegate.decode(token)
    if (!userId) return undefined
    return (await this.users.isActive(userId)) ? userId : undefined
  }
}
