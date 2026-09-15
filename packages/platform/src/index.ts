import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { jwtVerify, SignJWT } from 'jose'
import type { IdGenerator, PasswordHasher, ServiceSettings, TokenService } from '@techspar/core'

export type AppConfig = {
  baseDir: string
  dataDir: string
  dbPath: string
  jwtSecret: string
  defaultEmail: string
  defaultPassword: string
  defaultName: string
  allowRegistration: boolean
  platformLlmApiBase: string
  platformLlmApiKey: string
  platformLlmModel: string
  platformEmbeddingApiBase: string
  platformEmbeddingApiKey: string
  platformEmbeddingModel: string
  platformDailyCallLimit: number
  platformTokenLimit: number
  platformTokenWindow: 'day' | 'month'
  /**
   * 部署方共享给全部用户的服务凭据(可选服务)。
   *
   * 刻意做成一个整体映射而不是逐项字段:以后要多共享一项服务,
   * 只需在 loadConfig 里加一行,core / api / 前端都不用跟着改。
   */
  platformServices: Partial<ServiceSettings>
  voiceprintEncryptionKey: string
  host: string
  port: number
  webDir?: string
}

const truthy = new Set(['1', 'true', 'yes', 'on'])

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const baseDir = resolve(env.TECHSPAR_BASE_DIR || process.cwd())
  const dataDir = resolve(baseDir, env.TECHSPAR_DATA_DIR || 'data')
  return {
    baseDir,
    dataDir,
    dbPath: resolve(baseDir, env.DB_PATH || 'data/interviews.db'),
    jwtSecret: env.JWT_SECRET || 'change-me-in-production',
    defaultEmail: env.DEFAULT_EMAIL || 'admin@techspar.local',
    defaultPassword: env.DEFAULT_PASSWORD || 'admin123',
    defaultName: env.DEFAULT_NAME || 'Admin',
    allowRegistration: truthy.has((env.ALLOW_REGISTRATION || '').toLowerCase()),
    platformLlmApiBase: env.PLATFORM_LLM_API_BASE || '',
    platformLlmApiKey: env.PLATFORM_LLM_API_KEY || '',
    platformLlmModel: env.PLATFORM_LLM_MODEL || '',
    platformEmbeddingApiBase: env.PLATFORM_EMBEDDING_API_BASE || '',
    platformEmbeddingApiKey: env.PLATFORM_EMBEDDING_API_KEY || '',
    platformEmbeddingModel: env.PLATFORM_EMBEDDING_MODEL || '',
    platformDailyCallLimit: Number(env.PLATFORM_DAILY_CALL_LIMIT || 0),
    platformTokenLimit: Number(env.PLATFORM_TOKEN_LIMIT || 0),
    platformTokenWindow: env.PLATFORM_TOKEN_WINDOW === 'month' ? 'month' : 'day',
    // 共享给全部用户的可选服务凭据。放开一项服务 = 这里取消一行注释。
    // 留空即为「不共享」,行为与未配置该变量完全一致。
    platformServices: {
      tavily_api_key: env.PLATFORM_TAVILY_API_KEY || '',
      // dashscope_api_key: env.PLATFORM_DASHSCOPE_API_KEY || '',
      // oss_access_key_id: env.PLATFORM_OSS_ACCESS_KEY_ID || '',
      // oss_access_key_secret: env.PLATFORM_OSS_ACCESS_KEY_SECRET || '',
      // oss_bucket: env.PLATFORM_OSS_BUCKET || '',
      // oss_endpoint: env.PLATFORM_OSS_ENDPOINT || '',
    },
    voiceprintEncryptionKey: env.VOICEPRINT_ENCRYPTION_KEY || env.JWT_SECRET || 'change-me-in-production',
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8000),
    ...(env.TECHSPAR_WEB_DIR ? { webDir: resolve(env.TECHSPAR_WEB_DIR) } : {}),
  }
}

function jwtKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }
}

export class JoseTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  async create(userId: string): Promise<string> {
    const now = Math.floor(this.now() / 1000)
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + 7 * 24 * 60 * 60)
      .sign(jwtKey(this.secret))
  }

  async decode(token: string): Promise<string | undefined> {
    try {
      const { payload } = await jwtVerify(token, jwtKey(this.secret), { algorithms: ['HS256'] })
      return payload.sub
    } catch {
      return undefined
    }
  }
}

export class ShortUuidGenerator implements IdGenerator {
  next(): string {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  }
}

export * from './provider-settings-repository.ts'
export * from './user-data-store.ts'
export * from './knowledge-store.ts'
export * from './resume-store.ts'
export * from './profile-repository.ts'
export * from './personal-document-store.ts'
export * from './data-archive.ts'
export * from './system-restore.ts'
export * from './voiceprint-repository.ts'
