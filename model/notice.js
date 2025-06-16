import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import cfg from './config.js'
import base from './base.js'
import api from './api.js'
import download from './download.js'
import { getGameCheckAPI, getDownloadAPI } from './util.js'

class Notifier extends base {
  templateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) => [
      `<span class="emoji-text">✨</span> ${gameName}游戏版本更新通知`,
      `<span class="emoji-text">🚀</span> 版本变更：${oldVersion} → ${newVersion}`,
      formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`,
      ...((gameName !== '原神' && gameName !== '崩坏3') ? [incrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${incrementalSize}`] : []),
      '<span class="emoji-text">📢</span> 请及时更新客户端',
      ...(gameName !== '原神' ? [`<span class="emoji-text">💾</span> 发送【#${gameName}获取下载链接】获取客户端`] : [])
    ],

    pre: ({ gameName, newVersion, incrementalSize }) => [
      `<span class="emoji-text">🎁</span> ${gameName}预下载资源已开放`,
      `<span class="emoji-text">📦</span> 新版本：${newVersion}`,
      ...(gameName !== '原神' ? [formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`] : []),
      ...((gameName !== '崩坏3') ? [incrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${incrementalSize}`] : []),
      '<span class="emoji-text">📥</span> 请提前下载游戏资源',
      ...(gameName !== '原神' ? [`<span class="emoji-text">🚪</span> 发送【#${gameName}获取预下载链接】获取链接`] : [])
    ],

    'pre-remove': ({ gameName, oldVersion }) => [
      `<span class="emoji-text">🌙</span> ${gameName}预下载资源已关闭`,
      `<span class="emoji-text">🔒</span> 正式版本${oldVersion}即将上线`
    ]
  }

  textTemplateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, incrementalSize }) => {
      const parts = [
        `✨${gameName}游戏版本更新通知`,
        `🚀版本变更：${oldVersion} → ${newVersion}`,
        formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`,
        ...((gameName !== '原神' && gameName !== '崩坏3') ? [incrementalSize && `🔄 增量更新大小：约${incrementalSize}`] : []),
        '📢 请及时更新客户端',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取下载链接】获取客户端`] : [])
      ]
      return parts.filter(Boolean).join('\n')
    },

    pre: ({ gameName, newVersion, incrementalSize }) => {
      const parts = [
        `🎁${gameName}预下载资源已开放`,
        `📦新版本：${newVersion}`,
        ...(gameName !== '原神' ? [formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`] : []),
        ...((gameName !== '崩坏3') ? [incrementalSize && `🔄 增量更新大小：约${incrementalSize}`] : []),
        '📥请提前下载游戏资源',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取预下载链接】获取客户端`] : [])
      ]
      return parts.filter(Boolean).join('\n')
    },

    'pre-remove': ({ gameName, oldVersion }) => [
      `🌙${gameName}预下载资源已关闭`,
      `🔒正式版本${oldVersion}即将上线`
    ].join('\n')
  }

  async pushNotify ({ type, game, newVersion, oldVersion, pushChangeType }) {
    try {
      const gameConfig = cfg.getGameConfig(game)
      const gameName = this.getGameName(game)
      let formattedTotalSize = ''
      let incrementalSize = ''

      if (game == 'ww') {
        if (type === 'main' || type === 'pre') {
          const downloadData = await download.getDownloadData(game, type)
          let totalSize = downloadData.data.game_pkgs[0].size
          formattedTotalSize = api.formatSize(totalSize)
          let patchTotalSize = downloadData.patch.game_pkgs[0].size
          incrementalSize = api.formatSize(patchTotalSize)
        }
      } else if (game === 'ys') {
        let BranchesUrl = getGameCheckAPI(game)
        let Branches = await fetch(BranchesUrl, { method: 'GET' })
        let Branchesres = await Branches.json()
        let BranchesData = Branchesres?.data?.game_branches?.[0]
        let chucksizeApi = ''
        let chucksizeData = ''
        let chucksizeDatares = ''
        let data = ''
        let mainSize = 0
        let PreSize = 0
        const Version = BranchesData?.pre_download?.diff_tags[0]
        if (type === 'pre') {
          chucksizeApi = getDownloadAPI(type, BranchesData?.pre_download?.package_id, BranchesData?.pre_download?.password)
          chucksizeData = await fetch(chucksizeApi, { method: 'POST' })
          chucksizeDatares = await chucksizeData.json()
          data = chucksizeDatares?.data?.manifests
          PreSize += parseInt(data?.[0]?.stats[Version]?.uncompressed_size, 10)
          PreSize += parseInt(data?.[1]?.stats[Version]?.uncompressed_size, 10)
          incrementalSize = api.formatSize(PreSize)
        } else {
          chucksizeApi = getDownloadAPI(type, BranchesData?.main?.package_id, BranchesData?.[0]?.main?.password)
          chucksizeData = await fetch(chucksizeApi, { method: 'GET' })
          data = await chucksizeData.json()
          data = chucksizeDatares?.data?.manifests
          mainSize += parseInt(data[0]?.deduplicated_stats?.uncompressed_size, 10)
          mainSize += parseInt(data[1]?.deduplicated_stats?.uncompressed_size, 10)
          formattedTotalSize = api.formatSize(mainSize)
        }
      } else {
        if (type === 'main' || type === 'pre') {
          const downloadData = await download.getDownloadData(game, type)
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

          formattedTotalSize = api.formatSize(totalSize)

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
            if (chineseAudio) patchTotalSize += parseInt(chineseAudio.size || '0', 10)
          }

          incrementalSize = api.formatSize(patchTotalSize)
        }
      }

      const templateParams = {
        gameName,
        oldVersion: oldVersion,
        newVersion: newVersion,
        formattedTotalSize,
        incrementalSize
      }

      if (pushChangeType === '2') {
        this.sendTextNotification(templateParams, type, game, gameConfig)
      } else {
        await this.sendImageNotification(templateParams, type, game, gameConfig)
      }
    } catch (err) {
      logger.error(`[GamePush][${this.getGameName(game)}通知] 失败`, err)
    }
  }

  sendTextNotification (params, type, game, gameConfig) {
    const text = this.textTemplateMap[type](params)
    api.sendToGroups(text, game, gameConfig)
  }

  async sendImageNotification (params, type, game, gameConfig) {
    const escapeHtml = (str) => {
      if (!str) return ''
      return str.replace(/[&<>"']/g,
        tag => ({
          '&': '&amp',
          '<': '&lt',
          '>': '&gt',
          '"': '&quot',
          "'": '&#39'
        }[tag]))
    }

    const data = {
      ...this.getScreenData(game),
      messages: this.templateMap[type](params),
      gameName: escapeHtml(params.gameName),
      date: new Date().toLocaleDateString(),
      type
    }

    const img = await puppeteer.screenshot('GamePush-Plugin/notice', data)
    api.sendToGroups(img, game, gameConfig)
  }
}

const notice = new Notifier()
export default notice
