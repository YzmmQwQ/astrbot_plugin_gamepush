import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import cfg from './config.js'
import { getGameName } from './util.js'
import download from './download-handler.js'
import ApiTools from './api.js'
import base from './base.js'

export default class noticerender extends base {
  async pushNotify ({ type, game, newVersion, oldVersion }) {
    const config = cfg.getGameConfig(game)
    const gameName = getGameName(game)
    let formattedTotalSize = ''
    let incrementalSize = ''

    if (type === 'main' || type === 'pre') {
      try {
        const downloadData = await new download().getDownloadData(game, type)
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
        logger.error(`[GamePush-Plugin][${gameName}大小计算失败]`, err)
        formattedTotalSize = '（大小计算失败）'
        incrementalSize = '（计算失败）'
      }
    }

    const escapeHtml = (str) => {
      if (!str) return ''
      return str.replace(/[&<>"']/g,
        tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[tag]))
    }

    const templates = {
      main: () => {
        const messages = [
        `<span class="emoji-text">✨</span> ${escapeHtml(gameName)}游戏版本更新通知`,
        `<span class="emoji-text">🚀</span> 版本变更：${escapeHtml(oldVersion)} → ${escapeHtml(newVersion)}`,
        formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${escapeHtml(formattedTotalSize)}`,
        incrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${escapeHtml(incrementalSize)}`,
        '<span class="emoji-text">📢</span> 请及时更新客户端',
        ...(game !== 'ys' ? [`<span class="emoji-text">💾</span> 发送【#${escapeHtml(gameName)}获取下载】获取客户端`] : [])
        ]

        return messages.flat()
      },

      pre: () => [
      `<span class="emoji-text">🎁</span> ${escapeHtml(gameName)}预下载资源已开放`,
      oldVersion
        ? `<span class="emoji-text">🔄</span> 版本更新：${escapeHtml(oldVersion)} → ${escapeHtml(newVersion)}`
        : `<span class="emoji-text">📦</span> 新版本：${escapeHtml(newVersion)}`,
      formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${escapeHtml(formattedTotalSize)}`,
      incrementalSize && `<span class="emoji-text">⏬</span> 增量包大小：约${escapeHtml(incrementalSize)}`,
      '<span class="emoji-text">📥</span> 请提前下载游戏资源',
      ...(game !== 'ys' ? [`<span class="emoji-text">🚪</span> 发送【#${escapeHtml(gameName)}获取预下载】获取链接`] : [])
      ],
      'pre-remove': () => [
      `<span class="emoji-text">🌙</span> ${escapeHtml(gameName)}预下载资源已关闭`,
      `<span class="emoji-text">🔒</span> 正式版本${escapeHtml(oldVersion)}即将上线`
      ]
    }

    try {
      const data = {
        ...this.getScreenData(game),
        messages: templates[type](),
        gameName: escapeHtml(gameName),
        date: new Date().toLocaleDateString(),
        type,
        newVersion: escapeHtml(newVersion),
        oldVersion: escapeHtml(oldVersion)
      }

      const img = await puppeteer.screenshot('GamePush-Plugin/notice', data)
      new ApiTools().sendToGroups(img, game, config)
    } catch (err) {
      logger.error(`[GamePush-Plugin][${gameName}截图失败]`, err)
      const textMsg = templates[type]().join('\n')
      new ApiTools().sendToGroups(textMsg, game, config)
    }
  }

  formatSize (bytes) {
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
