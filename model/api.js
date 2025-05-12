import fetch from 'node-fetch'
import cfg from "./config.js"
import { getGameCheckAPI, getGameAPI, getGameName, getRedisKeys, GAME_CONFIG, getGameSignAPI } from "./util.js"
import base from './base.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

class apitools extends base {
  constructor() {
    super();
    this.dailyCache = []
    this.delayTimer = null
    this.postUpdateChecks = new Map()
  }

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

      const apiUrl = game === 'sr' ? getGameAPI(game) : getGameCheckAPI(game)
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

      if (game === 'sr') {
        await this.processMainVersion(game, gameData.main?.major?.version)
        await this.processPreDownload(game, gameData.pre_download?.major)
      } else {
        await this.processMainVersion(game, gameCheckData.main?.tag)
        await this.processPreDownload(game, gameCheckData.pre_download)
      }

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
    let serverStatus = {};
    if (['ys', 'zzz'].includes(game)) {
      serverStatus = await this.checkServerStatus(game, stored, currentVersion)
      
      this.startPostUpdateCheck(game, currentVersion)
    }
      
      await redis.set(redisKey, currentVersion)
      this.pushNotify({
        type: 'main',
        game,
        newVersion: currentVersion,
        oldVersion: stored,
        serverStatus
      });

    }
  }

  async checkServerStatus(game, oldVer, newVer) {
    try {
      const gameConfig = GAME_CONFIG[game]
      if (!gameConfig?.url) return { supported: false }

      const urls = [
        getGameSignAPI(game, oldVer),
        getGameSignAPI(game, newVer)
      ];

      const responses = await Promise.all(
        urls.map(url => fetch(url).then(res => res.text()))
      );

      logger.debug(urls)

      return {
        supported: true,
        oldStopped: responses[0].length < 800,
        newLaunched: responses[1].length > 800,
        rawData: { old: responses[0], new: responses[1] }
      };
    } catch (err) {
      logger.error(`[GamePush-Plugin][${getGameName(game)}状态检测] 异常`, err)
      return {
        supported: true,
        error: err.message.slice(0, 100)
      };
    }
  }

  // 新增持续检测逻辑（修改检测间隔）
  async startPostUpdateCheck(game, version) {
    const CHECK_INTERVAL = 2 * 60 * 1000
    const MAX_DURATION = 6 * 60 * 60 * 1000
    
    // 停止已有检测
    if (this.postUpdateChecks.has(game)) {
      clearInterval(this.postUpdateChecks.get(game).timer)
    }

    const startTime = Date.now()
    let isNotified = false

    const checkTask = async () => {
      try {
        // 超时终止
        if (Date.now() - startTime > MAX_DURATION) {
          clearInterval(timer);
          this.postUpdateChecks.delete(game);
          logger.debug(`[GamePush-Plugin][${getGameName(game)}] 持续检测已超时终止`)
          return;
        }

        // 执行检测
        const url = getGameSignAPI(game, version)
        const res = await fetch(url)
        const text = await res.text()
        
        if (text.length > 10000) {
          clearInterval(timer);
          this.postUpdateChecks.delete(game)
          this.sendServerLaunchNotice(game, version)
          isNotified = true
        }

        logger.debug(`[GamePush-Plugin][${game} ${version}] 检测结果: ${text.length}字符`)
      } catch (err) {
        logger.error(`[GamePush-Plugin][持续检测] 异常`, err)
      }
    }

    // 立即执行首次检测
    checkTask()
    
    // 创建定时器
    const timer = setInterval(checkTask, CHECK_INTERVAL)
    this.postUpdateChecks.set(game, { timer, version, startTime })
  }

  async processPreDownload(game, preData) {
    const { pre: preKey } = getRedisKeys(game)
    const currentPre = game === 'sr' ? preData?.version : preData?.tag
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

  async pushNotify({ type, game, newVersion, oldVersion, serverStatus = {} }) {
    const config = cfg.getGameConfig(game)
    const gameName = getGameName(game)

    const templates = {
      main: () => {
        const messages = [
          `✨ ${gameName}游戏版本更新通知`,
          `🚀 版本变更：${oldVersion} → ${newVersion}`
        ]

        if (serverStatus.supported) {
          messages.push(
            serverStatus.error 
              ? `⚠️ 服务器状态异常: ${serverStatus.error}`
              : [
                  serverStatus.oldStopped && '🛑 旧版本服务已终止',
                  serverStatus.newLaunched ? '✅ 新版本现已开放' : '⏳ 新版本维护中'
                ].filter(Boolean)
          )
        }

        messages.push(
          '📢 请及时更新客户端',
          ...(game !== 'ys' ? [`💾 发送【#获取${gameName}下载】获取客户端`] : [])
        )

        return messages.flat()
      },
      pre: () => [
        `🎁 ${gameName}预下载资源已开放`,
        oldVersion ? `🔄 版本更新：${oldVersion} → ${newVersion}` : `📦 新版本：${newVersion}`,
        '📥 请提前下载游戏资源',
        ...(game !== 'ys' ? [`🚪 发送【#获取${gameName}预下载】获取链接`] : [])
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

  // 新增开服通知方法
  async sendServerLaunchNotice(game, version) {
    const config = cfg.getGameConfig(game);
    const gameName = getGameName(game);
    
    const msg = [
      `🎉 ${gameName}版本${version}已开服`,
      `🕒 开服时间：${new Date().toLocaleString()}`,
      '👉 请及时登录游戏体验新内容'
    ];

    try {
      const data = {
        ...this.getScreenData(game),
        messages: msg,
        gameName,
        date: new Date().toLocaleDateString(),
        type: 'launch'
      };
      const img = await puppeteer.screenshot('GamePush-Plugin/notice', data);
      this.sendToGroups(img, game, config);
    } catch (err) {
      logger.error(`[GamePush-Plugin][开服通知] 截图失败`, err);
      this.sendToGroups(msg.join('\n'), game, config);
    }
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
        `⚖️ 大小：${this.formatSize(pkg.size)}`,
        `🧪 MD5: ${pkg.md5}\n`
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