import fetch from 'node-fetch'
import Config from './config.js'
import base from './base.js'
import noticerender from './notice-render.js'
import { getGameCheckAPI, getGameName, getRedisKeys, GAME_CONFIG } from './util.js'

const notice = new noticerender()
const cfg = new Config()
export default class ApiTools extends base {
  async autoCheck (game = '') {
    try {
      const gameConfig = cfg.getGameConfig(game)
      if (gameConfig.enable) {
        await this.checkVersion(true, game)
      }
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}自动检查] 失败`, err)
    }
  }

  async checkVersion (auto = false, game = '') {
    try {
      if (!game || !GAME_CONFIG[game]) {
        throw new Error(`[GamePush-Plugin] 无效的游戏标识: ${game}`)
      }

      const apiUrl = getGameCheckAPI(game)
      logger.debug(`[GamePush-Plugin][${getGameName(game)}] 请求API: ${apiUrl}`)

      const res = await fetch(apiUrl)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`[GamePush-Plugin] API请求失败：HTTP ${res.status} - ${body.slice(0, 100)}`)
      }

      const data = await res.json()
      const gameData = data?.data?.game_packages?.[0]
      const gameCheckData = data?.data?.game_branches?.[0]
      if (!gameData && !gameCheckData) throw new Error(`[GamePush-Plugin] ${getGameName(game)}游戏数据解析失败`)

      await this.processMainVersion(game, gameCheckData.main?.tag)
      await this.processPreDownload(game, gameCheckData.pre_download)
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}版本监控] 错误`, err)
      if (!auto) this.reply(`[GamePush-Plugin] ❌ 检查失败：${err.message}`)
    }
  }

  async processMainVersion (game, currentVersion) {
    if (!currentVersion) return

    const { main: redisKey } = getRedisKeys(game)
    const stored = await redis.get(redisKey) || '0.0.0'

    if (this.compareVersions(currentVersion, stored)) {
      await redis.set(redisKey, currentVersion)
      notice.pushNotify({
        type: 'main',
        game,
        newVersion: currentVersion,
        oldVersion: stored
      })
    }
  }

  async processPreDownload (game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = preData?.tag
    const storedPre = await redis.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await redis.set(preKey, currentPre)
        notice.pushNotify({
          type: 'pre',
          game,
          newVersion: currentPre,
          oldVersion: storedPre
        })
      }
    } else if (storedPre) {
      await redis.del(preKey)
      notice.pushNotify({
        type: 'pre-remove',
        game,
        oldVersion: storedPre
      })
    }
  }

  compareVersions (newVer, oldVer) {
    const newParts = newVer.split('.').map(Number)
    const oldParts = oldVer.split('.').map(Number)

    for (let i = 0; i < Math.max(newParts.length, oldParts.length); i++) {
      const n = newParts[i] || 0
      const o = oldParts[i] || 0
      if (n > o) return true
      if (n < o) return false
    }
    return false
  }

  sendToGroups (msg, game, gameConfig) {
    if (!gameConfig?.pushGroups?.length) {
      logger.debug(`[GamePush-Plugin][${getGameName(game)}] 未配置推送群组`)
      return
    }

    for (const groupId of gameConfig.pushGroups) {
      Bot.pickGroup(groupId).sendMsg(msg)
    }
  }
}
