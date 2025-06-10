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

export default class Config {
  constructor () {
    this.gameIds = ['ys', 'sr', 'zzz', 'bh3', 'ww']
    this.configCache = {}
    this.changeCallbacks = {}
    this.watcher = null

    this.init()
    this.watchConfig()
  }

  init () {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      this.saveConfigSync(this.generateDefaultConfig())
    }

    this.loadConfig()
  }

  watchConfig () {
    if (this.watcher) return

    this.watcher = chokidar.watch(CONFIG_PATH)

    this.watcher.on('change', path => {
      this.loadConfig()

      this.gameIds.forEach(gameId => {
        if (this[`change_${gameId}`]) {
          this[`change_${gameId}`]()
        }
      })

      logger.info('[GamePush-Plugin] 配置已重新加载')
    })

    logger.info('[GamePush-Plugin] 配置监听已启动')
  }

  generateDefaultConfig () {
    const config = {}
    this.gameIds.forEach(gameId => {
      config[gameId] = {
        enable: true,
        cron: '0 0/5 * * * *',
        pushGroups: []
      }
    })
    return config
  }

  loadConfig () {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        this.saveConfigSync(this.generateDefaultConfig())
      }

      const content = fs.readFileSync(CONFIG_PATH, 'utf8')
      const rawConfig = YAML.parse(content) || {}

      this.configCache = this.validateConfig(rawConfig)

      return this.configCache
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置加载失败，使用默认值', err)
      this.configCache = this.generateDefaultConfig()
      return this.configCache
    }
  }

  validateConfig (config) {
    const validatedConfig = {}

    this.gameIds.forEach(gameId => {
      const gameConfig = config[gameId] || {}

      validatedConfig[gameId] = {
        enable: typeof gameConfig.enable === 'boolean' ? gameConfig.enable : true,
        cron: typeof gameConfig.cron === 'string' && gameConfig.cron
          ? gameConfig.cron
          : '0 0/5 * * * *',
        pushGroups: Array.isArray(gameConfig.pushGroups)
          ? gameConfig.pushGroups.map(g => String(g))
          : []
      }
    })

    return validatedConfig
  }

  getConfig () {
    return this.configCache
  }

  getGameConfig (game) {
    return this.configCache[game] || this.generateDefaultConfig()[game]
  }

  saveConfig (newConfig) {
    try {
      const validatedConfig = this.validateConfig(newConfig)

      this.configCache = validatedConfig

      const yamlContent = YAML.stringify(validatedConfig, {
        indent: 2,
        aliasDuplicateObjects: false
      })

      fs.writeFileSync(CONFIG_PATH, yamlContent, 'utf8')

      logger.info('[GamePush-Plugin] 配置已保存')
      return true
    } catch (error) {
      logger.error('[GamePush-Plugin] 配置保存失败:', error)
      return false
    }
  }

  saveConfigSync (config) {
    try {
      const validatedConfig = this.validateConfig(config)
      const yamlContent = YAML.stringify(validatedConfig)
      fs.writeFileSync(CONFIG_PATH, yamlContent, 'utf8')
      return true
    } catch (error) {
      logger.error('[GamePush-Plugin] 配置保存失败:', error)
      return false
    }
  }

  registerChangeCallback (gameId, callback) {
    this[`change_${gameId}`] = callback
    logger.info(`[GamePush-Plugin] ${gameId}配置变更回调已注册`)
  }
}
