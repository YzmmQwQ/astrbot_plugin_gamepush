// model/api.js
import fetch from 'node-fetch'
import cfg from "./config.js"
import { getGameAPI, getGameName, getRedisKeys, GAME_CONFIG } from "./util.js"

class apitools {
  async autoCheck(game = '') {
    try {
      const gameConfig = cfg.getGameConfig(game)
      if (gameConfig.enable) {
        await this.checkVersion(true, game)
      }
    } catch (err) {
      logger.error(`[${getGameName(game)}自动检查] 失败`, err)
    }
  }

  async checkVersion(auto = false, game = '') {
    try {
      // 参数校验
      if (!game || !GAME_CONFIG[game]) {
        throw new Error(`无效的游戏标识: ${game}`)
      }

      const apiUrl = getGameAPI(game)
      logger.debug(`[${getGameName(game)}] 请求API: ${apiUrl}`)

      const res = await fetch(apiUrl)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`API请求失败：HTTP ${res.status} - ${body.slice(0, 100)}`)
      }

      const data = await res.json()
      const gameData = data?.data?.game_packages?.[0]
      if (!gameData) throw new Error(`${getGameName(game)}游戏数据解析失败`)

      await this.processMainVersion(game, gameData.main?.major?.version)
      await this.processPreDownload(game, gameData.pre_download?.major)

    } catch (err) {
      logger.error(`[${getGameName(game)}版本监控] 错误`, err)
      if (!auto) this.reply(`❌ 检查失败：${err.message}`)
    }
  }

  async processMainVersion(game, currentVersion) {
    if (!currentVersion) return
    
    const { main: redisKey } = getRedisKeys(game)
    const stored = await redis.get(redisKey) || '0.0.0'

    if (this.compareVersions(currentVersion, stored)) {
      await redis.set(redisKey, currentVersion)
      this.pushNotify({
        type: 'main',
        game,
        newVersion: currentVersion,
        oldVersion: stored
      })
    }
  }

  async processPreDownload(game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = preData?.version
    const storedPre = await redis.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await redis.set(preKey, currentPre)
        this.pushNotify({
          type: 'pre',
          game,
          newVersion: currentPre,
          oldVersion: storedPre
        })
      }
    } else if (storedPre) {
      await redis.del(preKey)
      this.pushNotify({
        type: 'pre-remove',
        game,
        oldVersion: storedPre
      })
    }
  }

  compareVersions(newVer, oldVer) {
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

  pushNotify({ type, game, newVersion, oldVersion }) {
    const config =  cfg.getGameConfig(game)
    let msg = []
    
    const gameName = getGameName(game)
    const templates = {
      main: [
        `✨ ${gameName}游戏版本更新通知`,
        `🚀 版本变更：${oldVersion} → ${newVersion}`,
        '🌌 服务器进入维护状态',
        '⏳ 请及时更新客户端',
        `💾 发送【#获取${gameName}下载链接】获取下载链接`
      ],
      pre: [
        `🎁 ${gameName}预下载资源已开放`,
        oldVersion ? `🔄 版本更新：${oldVersion} → ${newVersion}` : `📦 新版本：${newVersion}`,
        '📥 请提前下载游戏资源',
        `🚪 发送【#获取${gameName}预下载链接】获取预下载链接`
      ],
      'pre-remove': [
        `🌙 ${gameName}预下载资源已关闭`,
        `📅 旧版本：${oldVersion}`,
        `🔒 正式版本${newVersion}即将上线`
      ]
    }

    msg = templates[type].join('\n')
    this.sendToGroups(msg, game, config)
  }

  sendToGroups(msg, game, gameConfig) {
    if (!gameConfig?.pushGroups?.length) {
      logger.warn(`[${getGameName(game)}] 未配置推送群组`)
      return
    }

    gameConfig.pushGroups.forEach(groupId => {
      Bot.pickGroup(groupId).sendMsg(msg)
    })
  }

  async getDownloadData(game, type = 'main') {
    const apiUrl = getGameAPI(game)
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    
    const data = await res.json()
    const packageData = data?.data?.game_packages?.[0]
    
    if (type === 'pre') {
      return {
        data: packageData.pre_download?.major,
        patch: packageData.pre_download?.patches[0],
        type: 'pre'
      }
    } else if (type === 'main') {
      return {
        data: packageData.main?.major,
        patch: packageData.main?.patches[0],
        type: 'main'
      }
    }
  }

  formatDownloadInfo(game, pkgData, type, patchData) {
    if (!pkgData) return '🌫️ 暂无可用下载资源'
    
    const gameName = getGameName(game)
    const isPre = type === 'pre'
    
    let msg = [
      `🎮 ${gameName}${isPre ? '预下载' : '正式'}版本（${pkgData.version}）`,
      '📦 客户端分卷包：'
    ]

    msg.push('\n▂▂▂▂▂▂▂▂▂▂▂▂\n📦 客户端分卷包')
    pkgData.game_pkgs.forEach((pkg, i) => {
      msg.push(
        `${i+1}. 🗃️ 链接：${pkg.url}`,
        `⚖️ 大小：${this.formatSize(pkg.size)}`,
        `🔍 MD5：${pkg.md5}\n`
      )
    })

    // 统一处理语音包
    msg.push('\n▂▂▂▂▂▂▂▂▂▂▂▂\n🎧 语言资源包')
    pkgData.audio_pkgs.forEach(audio => {
      msg.push(
        `🌍 语言类型：${audio.language.toUpperCase()}`,
        `🗃️ 链接：${audio.url}`,
        `⚖️ 大小：${this.formatSize(audio.size)}`,
        `🔍 MD5：${audio.md5}\n`
      )
    })

    msg.push('\n▂▂▂▂▂▂▂▂▂▂▂▂\n🔄 增量更新')
    patchData.game_pkgs.forEach((pkg, i) => {
      msg.push(
        `${i+1}. 🧩 链接：${pkg.url}`,
        `⚖️ ${this.formatSize(pkg.size)}`,
        `🧪 ${pkg.md5}\n`
      )
    })
  
    // 差分语音模块
    msg.push('\n▂▂▂▂▂▂▂▂▂▂▂▂\n🎶 增量语音')
    patchData.audio_pkgs.forEach(audio => {
      msg.push(
        `🌍 语言类型：${audio.language.toUpperCase()}`, 
        `🧩 链接：${audio.url}`,
        `⚖️ 大小：${this.formatSize(audio.size)}`,
        `🔍 MD5：${audio.md5}\n`
      )
    })

    return msg.join('\n')
  }

  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = Number(bytes)
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

const api = new apitools()
export default api