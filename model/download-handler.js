import fetch from 'node-fetch'
import { getGameAPI, getGameName } from './util.js'

export default class download {
  async getDownloadData (game, type = 'main') {
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

  formatDownloadInfo (game, pkgData, type, patchData) {
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
      clientMsg += `${i + 1}. 🗃️ 链接：${pkg.url}\n`
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
        patchMsg += `${i + 1}. 🧩 链接：${pkg.url}\n`
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
