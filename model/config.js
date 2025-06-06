import fs from 'node:fs'
import YAML from 'yaml'
import path from 'node:path'
import { GAME_CONFIG } from './util.js'

const CONFIG_PATH = './data/GamePush-Plugin.yaml'

export default class Config {
  constructor () {
    this.init()
  }

  init () {
    const dir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      const defaultConfig = {}
      Object.keys(GAME_CONFIG).forEach(game => {
        defaultConfig[game] = {
          enable: true,
          cron: '0 0/5 * * * *',
          pushGroups: []
        }
      })
      this.saveConfig(defaultConfig)
    }
  }

  loadConfig () {
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf8')
      return YAML.parse(content) || {}
    } catch (err) {
      logger.error('[GamePush-Plugin] 配置加载失败，使用默认值', err)
      return this.generateDefaultConfig()
    }
  }

  getGameConfig (game) {
    const config = this.loadConfig()
    return config[game] || { enable: true, cron: '0 0/5 * * * *', pushGroups: [] }
  }

  updateGameConfig (game, updater) {
    const config = this.loadConfig()
    updater(config[game] || { enable: true, cron: '0 0/5 * * * *', pushGroups: [] })
    this.saveConfig(config)
  }

  saveConfig (config) {
    fs.writeFileSync(CONFIG_PATH, YAML.stringify(config))
  }

  updateConfig (updater) {
    const config = this.loadConfig()
    updater(config)
    this.saveConfig(config)
  }

  getDefaultPushGroups () {
    const config = this.loadConfig()
    const groups = new Set()

    Object.values(config).forEach(gameConfig => {
      if (gameConfig?.pushGroups) {
        gameConfig.pushGroups.forEach(group => groups.add(group))
      }
    })

    return Array.from(groups)
  }
}
