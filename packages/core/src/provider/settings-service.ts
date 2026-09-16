import type { AuthPolicy, UserRepository } from '../account/ports.ts'
import type { RequestContext } from '../kernel/context.ts'
import { AuthenticationError } from '../kernel/errors.ts'
import {
  embeddingTarget,
  normalizeLlmSettings,
  platformEmbeddingReady,
  platformLlmReady,
  platformServiceFields,
  resolveEmbeddingConfig,
  resolveLlmConfig,
} from './config.ts'
import {
  defaultTrainingSettings,
  emptyEmbeddingSettings,
  emptyServiceSettings,
  type PlatformProviderConfig,
  type SettingsView,
  type SystemPlatformConfig,
  type SystemSettings,
} from './model.ts'
import type { ProviderSettingsRepository, SettingsUseCases, VectorIndexControl } from './ports.ts'

/** GET 给管理员看到的是脱敏视图,密钥位一律写死成这个占位符。 */
const MASKED_SECRET = '***'

/**
 * 从整份回传里挑出"这次真的要写"的字段:没传的、以及脱敏占位符都不算。
 *
 * 前端表单是从 GET 的脱敏视图渲染出来的,保存时整份 PUT 回来。不做这层过滤,
 * 一次保存就会把字面量 `***` 当成新密钥写进库里,把真实 key 覆盖掉。
 */
function stripMasked<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {}
  const kept: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || item === MASKED_SECRET) continue
    kept[key] = item
  }
  return kept as Partial<T>
}

/**
 * 落库时丢掉空串。空在这里就等于"没配",该由 `.env` 兜底。
 *
 * 不能把空串写进 system_settings.json:`entry.bun.ts` 启动时 llm/embedding 走
 * `sysPlat?.x || config.x`(空串自动退回 env),但 `services` 是普通展开
 * `{...config.platformServices, ...sysPlat.services}`——一个空串就能把部署方
 * 写在 .env 里的服务凭据盖成空,平台兜底静默失效。
 */
function withoutBlanks<T extends object>(patch: Partial<T>): Partial<T> {
  const kept: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(patch as Record<string, unknown>)) {
    if (item === undefined || item === '') continue
    kept[key] = item
  }
  return kept as Partial<T>
}

export class SettingsService implements SettingsUseCases {
  constructor(
    private readonly repository: ProviderSettingsRepository,
    private readonly users: UserRepository,
    private readonly indexes: VectorIndexControl,
    private readonly platform: PlatformProviderConfig,
    private readonly registration: AuthPolicy,
  ) {}

  private userId(context: RequestContext): string {
    if (!context.userId) throw new AuthenticationError()
    return context.userId
  }

  async get(context: RequestContext): Promise<SettingsView> {
    const userId = this.userId(context)
    const [stored, training, lastReindexAt, user] = await Promise.all([
      this.repository.loadProvider(userId),
      this.repository.loadTraining(userId),
      this.repository.loadLastReindexAt(userId),
      this.users.findById(userId),
    ])
    const llm = normalizeLlmSettings(stored.llm)
    const embedding = stored.embedding || emptyEmbeddingSettings()
    const resolvedLlm = resolveLlmConfig(stored.llm, this.platform)
    const resolvedEmbedding = resolveEmbeddingConfig(stored.embedding, this.platform)
    return {
      llm,
      embedding,
      services: stored.services || emptyServiceSettings(),
      system: {
        allow_registration: this.registration.allowRegistration,
        announcement: this.registration.announcement || "",
        platform: user?.is_admin ? {
          llm: { api_base: this.platform.llm?.api_base || '', model: this.platform.llm?.model || '', compatibility: this.platform.llm?.compatibility, api_key: this.platform.llm?.api_key ? '***' : '' },
          embedding: { api_base: this.platform.embedding?.api_base || '', api_model: this.platform.embedding?.api_model || '', api_key: this.platform.embedding?.api_key ? '***' : '' },
          services: {
            dashscope_api_key: this.platform.services?.dashscope_api_key ? '***' : '',
            tavily_api_key: this.platform.services?.tavily_api_key ? '***' : '',
            oss_access_key_id: this.platform.services?.oss_access_key_id ? '***' : '',
            oss_access_key_secret: this.platform.services?.oss_access_key_secret ? '***' : '',
            oss_bucket: this.platform.services?.oss_bucket || '',
            oss_endpoint: this.platform.services?.oss_endpoint || '',
          },
          token_limit: this.platform.tokenLimit,
          token_window: this.platform.tokenWindow,
        } : undefined,
      },
      training: training || defaultTrainingSettings(),
      is_admin: user?.is_admin || false,
      configured: {
        llm: Boolean(resolvedLlm.api_key && resolvedLlm.model),
        embedding: resolvedEmbedding.backend === 'local' || Boolean(resolvedEmbedding.api_key),
      },
      platform: { llm: platformLlmReady(this.platform), embedding: platformEmbeddingReady(this.platform) },
      // 只传字段名。平台凭据的值留在内存里,不进这个响应。
      platform_services: platformServiceFields(this.platform),
      source: resolvedLlm.source,
      last_reindex_at: lastReindexAt,
    }
  }

  async update(context: RequestContext, value: SettingsView): Promise<{ ok: true; embedding_changed: boolean }> {
    const userId = this.userId(context)
    const [stored, user] = await Promise.all([this.repository.loadProvider(userId), this.users.findById(userId)])
    const before = embeddingTarget(resolveEmbeddingConfig(stored.embedding, this.platform))
    await this.repository.saveProvider(userId, { llm: value.llm, embedding: value.embedding, services: value.services })
    this.indexes.resetEmbeddingClient(userId)
    const after = embeddingTarget(resolveEmbeddingConfig(value.embedding, this.platform))
    const embeddingChanged = before !== after
    if (embeddingChanged) await this.indexes.invalidateUser(userId)
    if (user?.is_admin) {
      const previous = await this.repository.loadSystem()
      const previousPlatform = previous?.platform
      const incomingPlatform = value.system.platform
      const llmDelta = stripMasked(incomingPlatform?.llm)
      const embeddingDelta = stripMasked(incomingPlatform?.embedding)
      const servicesDelta = stripMasked(incomingPlatform?.services)
      // 合并而不是整体覆盖:主「保存」按钮只发 allow_registration,直接落库会把
      // 公告和平台配置一起抹掉(公告那条路曾经就是这么丢的)。
      const system: SystemSettings = { ...(previous ?? {}), allow_registration: value.system.allow_registration }
      // 公告只在真的带了字符串时覆盖。空串是合法值,表示管理员主动清空。
      if (typeof value.system.announcement === 'string') system.announcement = value.system.announcement
      if (incomingPlatform) {
        // 运行时按增量叠,保住 .env 兜底、这次没被显式改写的字段。
        this.platform.llm = { ...this.platform.llm, ...llmDelta }
        this.platform.embedding = { ...this.platform.embedding, ...embeddingDelta }
        this.platform.services = { ...(this.platform.services ?? {}), ...servicesDelta }
        if (incomingPlatform.token_limit !== undefined) this.platform.tokenLimit = incomingPlatform.token_limit
        if (incomingPlatform.token_window !== undefined) this.platform.tokenWindow = incomingPlatform.token_window
        // 落库的是「上一版增量 ⊕ 这次增量」,且不含空串——那份文件只负责启动时
        // 叠加到 .env 之上,不是 config 的镜像。显式清空某项会让它退出 JSON,
        // 重启后自然回到部署方的 env 值。
        system.platform = {
          llm: withoutBlanks({ ...previousPlatform?.llm, ...llmDelta }),
          embedding: withoutBlanks({ ...previousPlatform?.embedding, ...embeddingDelta }),
          services: withoutBlanks({ ...previousPlatform?.services, ...servicesDelta }),
          token_limit: incomingPlatform.token_limit ?? previousPlatform?.token_limit,
          token_window: incomingPlatform.token_window ?? previousPlatform?.token_window,
        } satisfies SystemPlatformConfig
      }
      await this.repository.saveSystem(system)
      this.registration.allowRegistration = system.allow_registration
      this.registration.announcement = system.announcement || ""
    }
    await this.repository.saveTraining(userId, value.training)
    return { ok: true, embedding_changed: embeddingChanged }
  }

  async llmSource(context: RequestContext) {
    const stored = await this.repository.loadProvider(this.userId(context))
    return resolveLlmConfig(stored.llm, this.platform).source
  }
}
