export const USER_PROVIDER = 'user' as const
export const PLATFORM_PROVIDER = 'platform' as const
// The upstream BAAI checkpoint does not ship the ONNX assets required by
// Transformers.js. This conversion keeps the same model while making local
// inference work in the TypeScript runtime.
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/bge-m3'
export const DEFAULT_EMBEDDING_BATCH_SIZE = 10

export type ProviderSource = typeof USER_PROVIDER | typeof PLATFORM_PROVIDER

export type LlmCompatibility = 'generic' | 'deepseek'

export type LlmSettings = {
  api_base: string
  api_key: string
  model: string
  temperature: number
  compatibility: LlmCompatibility
  /** 显式选用部署方的共享 key。填了自己的 key 但仍想走平台额度时才需要它。 */
  use_platform: boolean
}

export type EmbeddingSettings = {
  backend: '' | 'api' | 'local'
  api_base: string
  api_key: string
  api_model: string
  local_model: string
  local_path: string
  api_batch_size: number
}

export type ServiceSettings = {
  dashscope_api_key: string
  tavily_api_key: string
  oss_access_key_id: string
  oss_access_key_secret: string
  oss_bucket: string
  oss_endpoint: string
}

export type TrainingSettings = {
  num_questions: number
  divergence: number
}

export type SystemSettings = {
  allow_registration: boolean
}

export type ProviderStatus = { llm: boolean; embedding: boolean }

export type SettingsView = {
  llm: LlmSettings
  embedding: EmbeddingSettings
  services: ServiceSettings
  system: SystemSettings
  training: TrainingSettings
  is_admin: boolean
  /** 当前能不能用——自己的或平台的,任一可用即为 true。 */
  configured: ProviderStatus
  /** 本部署是否提供共享 key。自托管通常全 false,前端据此隐藏来源选择。 */
  platform: ProviderStatus
  /**
   * 部署方提供了哪些服务凭据(逐字段)。
   *
   * 只报字段名,绝不回填平台 key 本身——`services` 会被前端整体 PUT 回来，
   * 把平台值放进去就等于把部署方的密钥写进用户的 provider.json。
   */
  platform_services: Array<keyof ServiceSettings>
  /** 此刻实际在用谁的 key。用户判断"会不会消耗额度"只看这个。 */
  source: ProviderSource
  last_reindex_at: string
}

export type ResolvedLlmConfig = LlmSettings & { source: ProviderSource }
export type ResolvedEmbeddingConfig = EmbeddingSettings & { source: ProviderSource }

export const emptyLlmSettings = (): LlmSettings => ({ api_base: '', api_key: '', model: '', temperature: 0.7, compatibility: 'generic', use_platform: false })
export const emptyEmbeddingSettings = (): EmbeddingSettings => ({
  backend: '', api_base: '', api_key: '', api_model: '', local_model: '', local_path: '', api_batch_size: DEFAULT_EMBEDDING_BATCH_SIZE,
})
export const emptyServiceSettings = (): ServiceSettings => ({
  dashscope_api_key: '', tavily_api_key: '', oss_access_key_id: '', oss_access_key_secret: '', oss_bucket: '', oss_endpoint: '',
})
/** 服务凭据的字段清单。加新服务时只改这里,resolver 与前端标记会自动跟上。 */
export const SERVICE_FIELDS = [
  'dashscope_api_key', 'tavily_api_key', 'oss_access_key_id', 'oss_access_key_secret', 'oss_bucket', 'oss_endpoint',
] as const satisfies readonly (keyof ServiceSettings)[]
export const defaultTrainingSettings = (): TrainingSettings => ({ num_questions: 10, divergence: 3 })

/**
 * 部署方提供给全部用户的服务凭据。逐字段可选——只想兜底 Tavily、不碰 OSS 是合法配置。
 * 与 LLM/Embedding 的区别:服务之间彼此独立,所以回退是逐字段做的,不是整体切换。
 */
export type PlatformServiceConfig = Partial<ServiceSettings>

/** 服务配置的解析结果。`platform_fields` 标出哪些字段由部署方提供,供前端显示来源。 */
export type ResolvedServiceConfig = ServiceSettings & {
  platform_fields: Array<keyof ServiceSettings>
}

export type PlatformProviderConfig = {
  llm: Pick<LlmSettings, 'api_base' | 'api_key' | 'model'> & { compatibility?: LlmCompatibility }
  embedding: Pick<EmbeddingSettings, 'api_base' | 'api_key' | 'api_model'>
  /** 可选的服务兜底凭据。不配就是空的,行为与从前一致。 */
  services?: PlatformServiceConfig
  dailyCallLimit: number
  /** token 上限,0 表示不启用;设了就优先于 dailyCallLimit */
  tokenLimit: number
  /** token 上限的计量窗口。按天算,一个白嫖用户一年能烧掉几十块;按月封顶才可控 */
  tokenWindow: 'day' | 'month'
}
