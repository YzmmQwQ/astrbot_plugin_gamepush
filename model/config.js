import fs from 'node:fs'
import YAML from 'yaml'
import path from 'node:path'
import chokidar from 'chokidar'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CONFIG_DIR = path.join(process.cwd(), 'data')
const CONFIG_PATH = path.join(CONFIG_DIR, 'GamePush-Plugin.yaml')

const DEFAULT_CRON = '0 0/5 * * * *'
const GAME_IDS = ['ys', 'sr', 'zzz', 'bh3', 'ww']

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return []
  return groups.map(item =>
    item && typeof item === 'object' && 'groupId' in item ? String(item.groupId) : String(item)
  ).filter(Boolean)
}

function defaultGameConfig(enable = true) {
  return { enable, cron: DEFAULT_CRON, pushGroups: [] }
}

function defaultAllConfig() {
  return Object.fromEntries(GAME_IDS.map(id => [id, defaultGameConfig()]))
}

export default class Config {
  constructor() {
    this.configCache = {}
    this.init()
    this.watchConfig()
  }

  init() {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
    if (!fs.existsSync(CONFIG_PATH)) this.saveConfig(defaultAllConfig())
    this.loadConfig()
  }

  validateConfig(config) {
    return Object.fromEntries(GAME_IDS.map(gameId => {
      const c = { ...defaultGameConfig(), ...(config[gameId] || {}) }
      c.pushGroups = normalizeGroups(c.pushGroups)
      return [gameId, c]
    }))
  }

  loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) this.saveConfig(defaultAllConfig())
      const raw = YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}
      this.configCache = this.validateConfig(raw)
      logger?.debug?.('[GamePush-Plugin] 配置已加载')
      return this.configCache
    } catch (err) {
      logger?.error?.('[GamePush-Plugin] 配置加载失败', err)
      this.configCache = defaultAllConfig()
      return this.configCache
    }
  }

  saveConfig(newConfig) {
    try {
      const validated = this.validateConfig(newConfig)
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(validated, { indent: 2 }), 'utf8')
      this.configCache = validated
      logger?.debug?.('[GamePush-Plugin] 配置已保存')
      return true
    } catch (e) {
      logger?.error?.('[GamePush-Plugin] 配置保存失败', e)
      return false
    }
  }

  watchConfig() {
    if (this.watcher) return
    this.watcher = chokidar.watch(CONFIG_PATH)
    this.watcher.on('change', () => {
      logger?.info?.('[GamePush-Plugin] 配置变更，重新加载')
      this.loadConfig()
    })
  }

  getGameConfig(game) {
    return this.configCache[game] || defaultGameConfig()
  }

  getFrontendConfig() {
    try {
      const config = this.loadConfig()
      return Object.fromEntries(GAME_IDS.map(id => [id, { ...config[id] }]))
    } catch (e) {
      logger?.error?.('[GamePush-Plugin] 获取前端配置失败', e)
      return defaultAllConfig()
    }
  }

  saveFromFrontend(data) {
    try {
      logger?.debug?.('[GamePush-Plugin] 收到前端配置数据:', data)
      if (!data || typeof data !== 'object') return { success: false, message: '无效的配置数据' }
      const saveData = Object.fromEntries(GAME_IDS.map(gameId => {
        let gameData = {}
        Object.keys(data).forEach(key => {
          if (key.startsWith(`${gameId}.`)) gameData[key.slice(gameId.length + 1)] = data[key]
          else if (key === gameId) Object.assign(gameData, data[key])
        })
        if (!Object.keys(gameData).length) return [gameId, defaultGameConfig(false)]
        return [gameId, {
          enable: !!gameData.enable,
          cron: gameData.cron || DEFAULT_CRON,
          pushGroups: normalizeGroups(gameData.pushGroups)
        }]
      }))
      logger?.debug?.('[GamePush-Plugin] 格式化后的配置:', saveData)
      return this.saveConfig(saveData)
        ? { success: true, message: '游戏推送配置已保存！' }
        : { success: false, message: '保存失败，请查看日志' }
    } catch (e) {
      logger?.error?.('保存配置失败:', e)
      return { success: false, message: '保存失败: ' + e.message }
    }
  }
}