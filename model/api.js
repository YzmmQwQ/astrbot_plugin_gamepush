import fetch from 'node-fetch'
import cfg from "./config.js"
import { getGameCheckAPI, getGameAPI, getGameName, getRedisKeys, GAME_CONFIG } from "./util.js"
import base from './base.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

class apitools extends base {
  async autoCheck(game = '') {
    try {
      const gameConfig = cfg.getGameConfig(game)
      if (gameConfig.enable) {
        await this.checkVersion(true, game)
      }
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}自动检查] 失败`, err)
    }
  }

  async checkVersion(auto = false, game = '') {
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
      });

    }
  }

  async processPreDownload(game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = preData?.tag
    const storedPre = await redis.get(preKey)

    if (currentPre) {
      if (currentPre !== storedPre) {
        await redis.set(preKey, currentPre)
        this.pushNotify({
          type: 'pre',
          game,
          newVersion: currentPre,
          oldVersion: storedPre
        });
      }
    } else if (storedPre) {
      await redis.del(preKey)
      this.pushNotify({
        type: 'pre-remove',
        game,
        oldVersion: storedPre
      });
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
    return false;
  }

  async pushNotify({ type, game, newVersion, oldVersion}) {
    const config = cfg.getGameConfig(game)
    const gameName = getGameName(game)
    let formattedTotalSize = ''
    let incrementalSize = ''
    
    if (type === 'main' || type === 'pre') {
    try{
      const downloadData = await this.getDownloadData(game, type)
      let totalSize = 0
    
    if (downloadData.data?.game_pkgs) {
      downloadData.data.game_pkgs.forEach(pkg => {
        totalSize += parseInt(pkg.size || '0', 10)
      })
    }
    
    if (downloadData.data?.audio_pkgs) {
      const chineseAudio = downloadData.data.audio_pkgs.find(a => 
        a.language.toLowerCase() === 'zh-cn'
      )
      if (chineseAudio) totalSize += parseInt(chineseAudio.size || '0', 10)
    }
    
    formattedTotalSize = this.formatSize(totalSize)
    
    let patchTotalSize = 0

    if (downloadData.patch?.game_pkgs) {
      downloadData.patch.game_pkgs.forEach(pkg => {
        patchTotalSize += parseInt(pkg.size || '0', 10)
      })
    }

    if (downloadData.patch?.audio_pkgs) {
      const chineseAudio = downloadData.patch.audio_pkgs.find(a => 
        a.language.toLowerCase() === 'zh-cn'
      )
      if (chineseAudio) totalSize += parseInt(chineseAudio.size || '0', 10)
    }
  
    incrementalSize = this.formatSize(patchTotalSize)
  } catch (err) {
      logger.error(`[GamePush-Plugin][${gameName}大小计算失败]`, err);
      formattedTotalSize = '（大小计算失败）';
      incrementalSize = '（计算失败）';
    }
  }
  
  const templates = {
    main: () => {
      const messages = [
        `✨ ${gameName}游戏版本更新通知`,
        `🚀 版本变更：${oldVersion} → ${newVersion}`,
        formattedTotalSize && `📦 完整大小（含中文语音）：${formattedTotalSize}`,
        incrementalSize && `🔄 增量更新大小：约${incrementalSize}`,
      ]
      
      messages.push(
        '📢 请及时更新客户端',
        ...(game !== 'ys' ? [`💾 发送【#${gameName}获取下载】获取客户端`] : [])
      )
      
      return messages.flat()
    },
    
    pre: () => [
      `🎁 ${gameName}预下载资源已开放`,
      oldVersion ? `🔄 版本更新：${oldVersion} → ${newVersion}` : `📦 新版本：${newVersion}`,
      formattedTotalSize && `📦 完整大小（含中文语音）：${formattedTotalSize}`,
      incrementalSize && `⏬ 增量包大小：约${incrementalSize}`,
      '📥 请提前下载游戏资源',
      ...(game !== 'ys' ? [`🚪 发送【#${gameName}获取预下载】获取链接`] : [])
    ],
    'pre-remove': () => [
      `🌙 ${gameName}预下载资源已关闭`,
      `🔒 正式版本${oldVersion}即将上线`
    ]
  }

    try {
      const data = {
        ...this.getScreenData(game),
        messages: templates[type](),
        gameName,
        date: new Date().toLocaleDateString(),
        type,
        newVersion,
        oldVersion
      }

      const img = await puppeteer.screenshot('GamePush-Plugin/notice', data)
      this.sendToGroups(img, game, config);
    } catch (err) {
      logger.error(`[GamePush-Plugin][${gameName}截图失败]`, err)
      const textMsg = templates[type]().join('\n')
      this.sendToGroups(textMsg, game, config)
    }
  }

  sendToGroups(msg, game, gameConfig) {
    if (!gameConfig?.pushGroups?.length) {
      logger.debug(`[GamePush-Plugin][${getGameName(game)}] 未配置推送群组`)
      return
    }

    for(const groupId of gameConfig.pushGroups) {
        Bot.pickGroup(groupId).sendMsg(msg)
    }
  }

async getDownloadData(game, type = 'main') {
    const apiUrl = getGameAPI(game)
    const res = await fetch(apiUrl)
  
    
    const data = await res.json()
    const packageData = data?.data?.game_packages?.[0]
    const safeGetPatch = (patchArray) => {
      if (!patchArray || patchArray.length === 0) {
        return { 
          game_pkgs: [],
          audio_pkgs: [] 
        }
      }
      return patchArray[0]
    }

    if (type === 'pre') {
      return {
        data: packageData.pre_download?.major,
        patch: safeGetPatch(packageData.pre_download?.patches),
        type: 'pre'
      }
    } else if (type === 'main') {
      return {
        data: packageData.main?.major,
        patch: safeGetPatch(packageData.main?.patches),
        type: 'main'
      }
    }
}

formatDownloadInfo(game, pkgData, type, patchData) {
  if (!pkgData) return ['🌫️ 暂无可用下载资源']
  
  const gameName = getGameName(game)
  const isPre = type === 'pre'

  const msg = []
  const clent = []
  const audio = []
  const patch_audio = []
  const patch_clent = []

  msg.push(`🎮 ${gameName}${isPre ? '预下载' : '正式'}版本（${pkgData.version}）`)

  let clientMsg = '📦 客户端分卷包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
  pkgData.game_pkgs.forEach((pkg, i) => {
    clientMsg += `${i+1}. 🗃️ 链接：${pkg.url}\n`
    clientMsg += `⚖️ 大小：${this.formatSize(pkg.size)}\n`
    clientMsg += `🔍 MD5：${pkg.md5}\n\n`
  })
  clent.push(clientMsg)

  if (pkgData.audio_pkgs.length > 0) {
    let audioMsg = '🎧 语言资源包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
    pkgData.audio_pkgs.forEach(audio => {
      audioMsg += `🌍 语言类型：${audio.language.toUpperCase()}\n`
      audioMsg += `🗃️ 链接：${audio.url}\n`
      audioMsg += `⚖️ 大小：${this.formatSize(audio.size)}\n`
      audioMsg += `🔍 MD5：${audio.md5}\n\n`
    })
    audio.push(audioMsg)
  }

  if (patchData.game_pkgs.length > 0) {
    let patchMsg = '🔄 增量更新：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
    patchData.game_pkgs.forEach((pkg, i) => {
      patchMsg += `${i+1}. 🧩 链接：${pkg.url}\n`
      patchMsg += `⚖️ 大小：${this.formatSize(pkg.size)}\n`
      patchMsg += `🧪 MD5: ${pkg.md5}\n\n`
    })
    patch_clent.push(patchMsg)
  }

  if (patchData.audio_pkgs.length > 0) {
    let audioPatchMsg = '🎶 增量语音资源：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
    patchData.audio_pkgs.forEach(audio => {
      audioPatchMsg += `🌍 语言类型：${audio.language.toUpperCase()}\n`
      audioPatchMsg += `🧩 链接：${audio.url}\n`
      audioPatchMsg += `⚖️ 大小：${this.formatSize(audio.size)}\n`
      audioPatchMsg += `🔍 MD5：${audio.md5}\n\n`
    })
    patch_audio.push(audioPatchMsg)
  }

  return {
    msg,
    clent,
    audio,
    patch_clent,
    patch_audio
  }
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