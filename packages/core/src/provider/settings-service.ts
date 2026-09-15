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
} from './model.ts'
import type { ProviderSettingsRepository, SettingsUseCases, VectorIndexControl } from './ports.ts'

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
      await this.repository.saveSystem(value.system)
      this.registration.allowRegistration = value.system.allow_registration
      if (value.system.platform) {
        if (value.system.platform.llm) {
          this.platform.llm = { ...this.platform.llm, ...value.system.platform.llm }
        }
        if (value.system.platform.embedding) {
          this.platform.embedding = { ...this.platform.embedding, ...value.system.platform.embedding }
        }
        if (value.system.platform.services) {
          this.platform.services = { ...this.platform.services, ...value.system.platform.services }
        }
        if (typeof value.system.platform.token_limit === 'number') {
          this.platform.tokenLimit = value.system.platform.token_limit
        }
        if (value.system.platform.token_window) {
          this.platform.tokenWindow = value.system.platform.token_window
        }
      }
    }
    await this.repository.saveTraining(userId, value.training)
    return { ok: true, embedding_changed: embeddingChanged }
  }

  async llmSource(context: RequestContext) {
    const stored = await this.repository.loadProvider(this.userId(context))
    return resolveLlmConfig(stored.llm, this.platform).source
  }
}
