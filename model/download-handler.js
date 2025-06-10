import fetch from 'node-fetch'
import { getGameAPI, getGameName } from './util.js'

export default class download {
  /** 所有游戏统一米哈游格式的json */
  async getDownloadData (game, type = 'main') {
    const apiUrl = getGameAPI(game)
    const res = await fetch(apiUrl)
    const data = await res.json()

    if (game === 'ww') {
      const versionType = type === 'pre' ? 'predownload' : 'default'
      const versionData = data[versionType]
      if (!versionData || !versionData.config) {
        return {
          data: null,
          patch: { game_pkgs: [], audio_pkgs: [], patches: [] },
          type
        }
      }

      const cdn = versionData.cdnList?.[0]?.url || ''
      const config = versionData.config

      const mainMajor = {
        version: config.version,
        game_pkgs: [{
          url: this.constructWWUrl(cdn, config),
          md5: config.indexFileMd5 || '',
          size: config.size || 0,
          decompressed_size: config.unCompressSize || 0
        }]
      }

      let patchPkgs = []
      if (config.patchConfig && config.patchConfig.length > 0) {
        const sortedPatches = [...config.patchConfig].sort((a, b) => {
          return this.compareVersions(b.version, a.version)
        })

        patchPkgs = sortedPatches.map(patch => ({
          url: this.constructWWUrl(cdn, patch),
          md5: patch.indexFileMd5 || '',
          size: patch.size || 0,
          decompressed_size: patch.unCompressSize || 0,
          version: patch.version
        }))
      }

      return {
        data: mainMajor,
        patch: {
          game_pkgs: patchPkgs
        },
        type
      }
    }

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
    } else {
      return {
        data: packageData.main?.major,
        patch: safeGetPatch(packageData.main?.patches),
        type: 'main'
      }
    }
  }

  compareVersions (versionA, versionB) {
    const partsA = (versionA || '').split('.').map(Number)
    const partsB = (versionB || '').split('.').map(Number)

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const a = partsA[i] || 0
      const b = partsB[i] || 0

      if (a > b) return 1
      if (a < b) return -1
    }

    return 0
  }

  constructWWUrl (cdn, resourceConfig) {
    if (!cdn || !resourceConfig || !resourceConfig.indexFile) return ''
    const cleanCdn = cdn.replace(/\/+$/, '')
    const cleanIndexFile = resourceConfig.indexFile.replace(/^\//, '')
    return `${cleanCdn}/${cleanIndexFile}`
  }

  formatDownloadInfo (game, pkgData, type, patchData) {
    if (!pkgData) return ['🌫️ 暂无可用下载资源']

    const gameName = getGameName(game)
    const isPre = type === 'pre'

    if (game === 'ww') {
      const msg = []
      const client = []
      const patchesMessages = []

      if (pkgData) {
        msg.push(`🌊 ${gameName}${isPre ? '预下载' : '正式'}版本 - ${pkgData.version}`)

        let clientText = '📦 完整客户端包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
        pkgData.game_pkgs.forEach(pkg => {
          clientText += `🗃️ 下载链接：${pkg.url}\n`
          clientText += `⚖️ 文件大小：${this.formatSize(pkg.size)}\n`
          clientText += `🔍 MD5校验：${pkg.md5 || '未知'}\n`
          clientText += '\n'
        })
        client.push(clientText)
      }

      if (patchData.patches && patchData.patches.length > 0) {
        let patchText = '🔄 增量更新补丁：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
        patchData.patches.forEach(patch => {
          patchText += `🧩 补丁版本：${patch.version}\n`
          patch.game_pkgs.forEach(pkg => {
            patchText += `🗃️ 下载链接：${pkg.url}\n`
            patchText += `⚖️ 文件大小：${this.formatSize(pkg.size)}\n`
            patchText += `🔍 MD5校验：${pkg.md5 || '未知'}\n`
          })
          patchText += '\n'
        })
        patchesMessages.push(patchText)
      }

      return {
        msg,
        client,
        patchesMessages
      }
    } else {
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
          patchMsg += `🔍 MD5: ${pkg.md5}\n\n`
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
