import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SettingsViewSchema } from '@techspar/contracts'
import { SettingsService, type PlatformProviderConfig, type UserRepository } from '@techspar/core'
import { FileProviderSettingsRepository } from '@techspar/platform'

/**
 * 全站公告与平台共享凭据的持久化。
 *
 * 这两条路都曾经是「HTTP 200 但什么都没存」:契约把 `system.announcement` 和
 * `system.platform` 当成未知字段剥掉了,`c.req.valid('json')` 一过就已经没了,
 * 服务层再怎么处理都白搭。所以第一个用例直接在契约层设防——它才是当年的破口。
 */

const emptyPlatform: PlatformProviderConfig = {
  llm: { api_base: '', api_key: '', model: '' },
  embedding: { api_base: '', api_key: '', api_model: '' },
  dailyCallLimit: 0, tokenLimit: 0, tokenWindow: 'day' as const,
}

const adminUsers: UserRepository = {
  async findByEmail() { return undefined },
  async findById() { return { id: 'admin', email: 'admin@example.com', name: 'Admin', is_admin: true } },
  async create() { throw new Error('not used') },
  async updatePassword() {},
  async list() { return [] },
  async isActive() { return true },
  async setDisabled() { return undefined },
  async delete() { return false },
}

const context = { requestId: 'test', userId: 'admin', signal: new AbortController().signal }

describe('settings view contract', () => {
  test('keeps the announcement and the platform patch instead of stripping them', () => {
    const parsed = SettingsViewSchema.parse({
      llm: { api_base: '', api_key: '', model: '' },
      training: { num_questions: 10, divergence: 3 },
      system: { allow_registration: false, announcement: 'HELLO', platform: { llm: { api_key: 'sk-x' }, token_limit: 1000 } },
    })
    // 用默认识别不出来:被剥掉的话这里是 undefined,而不是落到 ''
    expect(parsed.system.announcement).toBe('HELLO')
    expect(parsed.system.platform?.llm?.api_key).toBe('sk-x')
    expect(parsed.system.platform?.token_limit).toBe(1000)
  })

  test('leaves absent fields undefined so a partial save cannot clobber them', () => {
    const parsed = SettingsViewSchema.parse({
      llm: { api_base: '', api_key: '', model: '' },
      training: { num_questions: 10, divergence: 3 },
      system: { allow_registration: true },
    })
    // 关键:不是 '' 也不是 {}。主「保存」按钮只发 allow_registration,
    // 带默认值的话每次点保存都会把公告清成空串。
    expect(parsed.system.announcement).toBeUndefined()
    expect(parsed.system.platform).toBeUndefined()
  })
})

describe('system settings persistence', () => {
  let root = ''
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = '' })

  async function setup() {
    root = await mkdtemp(join(tmpdir(), 'techspar-system-'))
    const dataDir = join(root, 'data')
    const repository = new FileProviderSettingsRepository(dataDir)
    const platform: PlatformProviderConfig = { ...emptyPlatform, llm: { ...emptyPlatform.llm }, embedding: { ...emptyPlatform.embedding } }
    const registration: { allowRegistration: boolean; announcement?: string } = { allowRegistration: false }
    const service = new SettingsService(repository, adminUsers, { async invalidateUser() {}, resetEmbeddingClient() {} }, platform, registration)
    const raw = () => readFile(join(dataDir, 'system_settings.json'), 'utf8')
    const stored = async () => JSON.parse(await raw())
    return { service, platform, registration, stored, raw }
  }

  test('persists the announcement and survives a later save that omits it', async () => {
    const { service, registration, stored } = await setup()

    const withAnnouncement = await service.get(context)
    withAnnouncement.system.announcement = '## 训练领域已改为按你的材料生成'
    await service.update(context, withAnnouncement)
    expect(registration.announcement).toBe('## 训练领域已改为按你的材料生成')
    expect((await stored()).announcement).toBe('## 训练领域已改为按你的材料生成')

    // 主「保存」按钮的载荷:契约里 announcement 字段整个缺席。
    const mainSave = await service.get(context)
    delete mainSave.system.announcement
    await service.update(context, mainSave)

    expect(registration.announcement).toBe('## 训练领域已改为按你的材料生成')
    expect((await stored()).announcement).toBe('## 训练领域已改为按你的材料生成')
  })

  test('treats the masked api key as unchanged instead of writing the placeholder', async () => {
    const { service, platform, stored } = await setup()

    const first = await service.get(context)
    first.system.platform = { llm: { api_base: 'https://api.example.test/v1', api_key: 'sk-real', model: 'm' } }
    await service.update(context, first)
    expect(platform.llm.api_key).toBe('sk-real')

    // GET 给管理员的是脱敏视图,前端原样回传。'***' 必须被当成"不改"。
    const masked = await service.get(context)
    expect(masked.system.platform?.llm?.api_key).toBe('***')
    await service.update(context, masked)

    expect(platform.llm.api_key).toBe('sk-real')
    expect((await stored()).platform.llm.api_key).toBe('sk-real')
  })

  test('never writes the masked placeholder or blank fields into the file', async () => {
    const { service, platform, stored, raw } = await setup()
    // 模拟 .env 里由部署方提供的平台兜底凭据。
    platform.services = { tavily_api_key: 'tv-real' }

    const view = await service.get(context)
    expect(view.system.platform?.services?.tavily_api_key).toBe('***')
    await service.update(context, view)

    // 关键:.env 提供的值既不能被 '***' 覆盖,也不能被空串清掉——
    // entry.bun.ts 启动时 `services` 是普通展开,一个空串就能盖掉 env。
    expect(platform.services?.tavily_api_key).toBe('tv-real')
    expect(await raw()).not.toContain('***')
    expect((await stored()).platform.services.tavily_api_key).toBeUndefined()
  })

  test('merges a partial platform patch without wiping the fields it omits', async () => {
    const { service, platform, stored } = await setup()

    const seeded = await service.get(context)
    seeded.system.platform = { llm: { api_base: 'https://api.example.test/v1', api_key: 'sk-real', model: 'm' } }
    await service.update(context, seeded)

    const partial = await service.get(context)
    partial.system.platform = { services: { tavily_api_key: 'tv-platform' } }
    await service.update(context, partial)

    expect(platform.services?.tavily_api_key).toBe('tv-platform')
    expect(platform.llm.api_key).toBe('sk-real')
    const persisted = await stored()
    expect(persisted.platform.services.tavily_api_key).toBe('tv-platform')
    expect(persisted.platform.llm.api_key).toBe('sk-real')
  })
})
