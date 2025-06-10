import fs from 'node:fs'
import YAML from 'yaml'
import path from 'node:path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CONFIG_DIR = path.join(process.cwd(), 'data')
const CONFIG_PATH = path.join(CONFIG_DIR, 'GamePush-Plugin.yaml')

export default class Config {
  constructor () {
    this.gameIds = ['ys', 'sr', 'zzz', 'bh3', 'ww']
    this.init()
  }

  init () {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      const defaultConfig = this.generateDefaultConfig()
      this.saveConfig(defaultConfig)
    }
  }

  generateDefaultConfig () {
    const defaultConfig = {}
    this.gameIds.forEach(gameId => {
      defaultConfig[gameId] = {
        enable: true,
        cron: '0 0/5 * * * *',
        pushGroups: []
      }
    })
    return defaultConfig
  }

  loadConfig () {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        logger.warn('[GamePush-Plugin] 配置文件不存在，创建默认配置')
        const defaultConfig = this.generateDefaultConfig()
        this.saveConfig(defaultConfig)
        return defaultConfig
      }

      const content = fs.readFileSync(CONFIG_PATH, 'utf8')
      let config = YAML.parse(content)

      const fullConfig = this.fillMissingGameConfigs(config)

      this.gameIds.forEach(gameId => {
        fullConfig[gameId] = this.validateGameConfig(fullConfig[gameId])
      })

      this.saveConfig(fullConfig)

      return fullConfig
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置加载失败，使用默认值', err)
      return this.generateDefaultConfig()
    }
  }

  fillMissingGameConfigs (config) {
    const fullConfig = { ...this.generateDefaultConfig(), ...config }

    this.gameIds.forEach(gameId => {
      if (!fullConfig[gameId]) {
        fullConfig[gameId] = this.generateDefaultConfig()[gameId]
      }
    })

    return fullConfig
  }

  validateGameConfig (config) {
    return {
      enable: typeof config.enable === 'boolean' ? config.enable : true,
      cron: typeof config.cron === 'string' && config.cron ? config.cron : '0 0/5 * * * *',
      pushGroups: Array.isArray(config.pushGroups)
        ? config.pushGroups.map(g => String(g))
        : []
    }
  }

  saveConfig (config) {
    try {
      const validConfig = this.fillMissingGameConfigs(config)

      const yamlContent = YAML.stringify(validConfig, {
        indent: 2,
        aliasDuplicateObjects: false,
        simpleKeys: true,
        lineWidth: 0
      })

      fs.writeFileSync(CONFIG_PATH, yamlContent, 'utf8')
      return true
    } catch (err) {
      return false
    }
  }

  getGameConfig (game) {
    const config = this.loadConfig()
    return config[game] || this.generateDefaultConfig()[game]
  }

  updateGameConfig (game, updater) {
    const config = this.loadConfig()
    const gameConfig = config[game] || this.generateDefaultConfig()[game]
    updater(gameConfig)
    config[game] = gameConfig
    this.saveConfig(config)
  }
}
