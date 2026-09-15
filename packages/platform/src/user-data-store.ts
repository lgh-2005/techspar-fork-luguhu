import { rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type { UserDataStore } from '@techspar/core'

/**
 * 删除账号时清理它落在磁盘上的文件。
 *
 * 站点把每个用户的东西都收在 `data/users/<id>/` 下——provider.json、简历、画像、
 * 个人资料库、声纹。删掉这一个目录就等于清干净了。
 *
 * 注意这是一次递归删除，而 userId 会被拼进路径，所以下面有两道防线：
 * 先挡住含分隔符或 .. 的字符串，再确认解析结果确实是 users/ 的**直接**子目录。
 * 少了第二道，一个形如 `../` 的 id 就能让删除跑出 users 目录。
 */
export class FileUserDataStore implements UserDataStore {
  constructor(private readonly dataDir: string) {}

  async removeUser(userId: string): Promise<boolean> {
    const id = (userId || '').trim()
    if (!id || id === '.' || id === '..' || /[\\/]/.test(id)) throw new Error('Invalid user id')

    const base = resolve(this.dataDir, 'users')
    const target = resolve(base, id)
    if (dirname(target) !== base || basename(target) !== id) throw new Error('Invalid user id')

    try {
      await rm(target, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }
}
