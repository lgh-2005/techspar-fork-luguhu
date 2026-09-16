import { describe, expect, test } from 'bun:test'
import presetTopics from '../packages/platform/assets/preset-topics.json' with { type: 'json' }

type PresetTopic = { key: string; name: string; icon: string; dir: string; readme: string }

describe('preset training topics', () => {
  test('ships no seeded topic so users only train their own directions', () => {
    expect(presetTopics as PresetTopic[]).toEqual([])
  })

  test('keeps every remaining preset structurally valid and unique', () => {
    const topics = presetTopics as PresetTopic[]
    const keys = topics.map((topic) => topic.key)
    const directories = topics.map((topic) => topic.dir)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(directories).size).toBe(directories.length)
    for (const topic of topics) {
      expect(topic.key).toMatch(/^[a-z0-9_]+$/)
      expect(topic.dir).not.toContain('/')
      expect(topic.name.trim().length).toBeGreaterThan(0)
      expect(topic.readme.startsWith('# ')).toBeTrue()
    }
  })
})
