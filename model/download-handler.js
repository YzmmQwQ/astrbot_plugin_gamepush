import fetch from 'node-fetch'
import { getGameAPI, getGameName } from './util.js'

export default class Download {
  /** 所有游戏统一米哈游格式的json */
  async getDownloadData (game, type = 'main') {
    try {
      const apiUrl = getGameAPI(game)
      const res = await fetch(apiUrl)

      if (!res.ok) {
        console.error(`API请求失败: ${res.status} ${res.statusText}`)
        return {
          data: null,
          patch: { game_pkgs: [], audio_pkgs: [], patches: [] },
          type
        }
      }

      const data = await res.json()
      console.log('API响应:', JSON.stringify(data, null, 2))

      if (game === 'ww') {
        return this.handleWutheringWaves(data, type)
      }

      const packageData = data?.data?.game_packages?.[0]
      const safeGetPatch = (patchArray) => {
        return patchArray && patchArray.length > 0
          ? patchArray[0]
          : { game_pkgs: [], audio_pkgs: [] }
      }

      if (type === 'pre') {
        return {
          data: packageData?.pre_download?.major,
          patch: safeGetPatch(packageData?.pre_download?.patches),
          type: 'pre'
        }
      }

      return {
        data: packageData?.main?.major,
        patch: safeGetPatch(packageData?.main?.patches),
        type: 'main'
      }
    } catch (e) {
      console.error('获取下载数据时发生错误:', e)
      return {
        data: null,
        patch: { game_pkgs: [], audio_pkgs: [] },
        type
      }
    }
  }

  handleWutheringWaves (data, type) {
    const versionType = type === 'pre' ? 'predownload' : 'default'
    console.log(`处理鸣潮${type === 'pre' ? '预下载' : '正式'}数据，使用${versionType}部分`)

    const versionData = data[versionType]

    if (!versionData || !versionData.config) {
      console.warn(`${versionType}数据缺失，versionData: ${!!versionData}, config: ${!!versionData?.config}`)
      return {
        data: null,
        patch: { game_pkgs: [], audio_pkgs: [] },
        type
      }
    }

    let cdn = ''
    if (versionData.cdnList && versionData.cdnList.length > 0) {
      cdn = versionData.cdnList[0].url.replace(/\/+$/, '')
    } else {
      cdn = 'https://pcdownload-huoshan.aki-game.com'
    }

    const config = versionData.config

    const mainUrl = this.constructWWUrl(cdn, config)
    console.log(`主包URL构造结果: ${mainUrl || '无链接'}, 
      参数: cdn=${cdn}, 
      indexFile=${config.indexFile || '无indexFile'}`)

    const mainMajor = {
      version: config.version,
      game_pkgs: [{
        url: mainUrl,
        md5: config.indexFileMd5 || '',
        size: config.size || 0,
        decompressed_size: config.unCompressSize || 0
      }]
    }

    const patchPkgs = []
    if (config.patchConfig && Array.isArray(config.patchConfig)) {
      const sortedPatchConfig = [...config.patchConfig].sort((a, b) => {
        return this.compareVersions(b.version, a.version)
      })

      sortedPatchConfig.forEach((patch, index) => {
        if (patch.indexFile) {
          const patchUrl = this.constructWWUrl(cdn, patch)
          console.log(`差分包 ${index + 1} (版本: ${patch.version}): 
            URL=${patchUrl || '无链接'}, 
            indexFile=${patch.indexFile}`)

          patchPkgs.push({
            url: patchUrl,
            md5: patch.indexFileMd5 || '',
            size: patch.size || 0,
            decompressed_size: patch.unCompressSize || 0,
            version: patch.version
          })
        }
      })
    }

    return {
      data: mainMajor,
      patch: { game_pkgs: patchPkgs },
      type
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
    const cleanCdn = cdn.replace(/\/+$/, '')
    const cleanIndexFile = resourceConfig.indexFile
      .replace(/^\//, '')
      .replace(/\?.*$/, '')

    return `${cleanCdn}/${cleanIndexFile}`
  }

  formatDownloadInfo (game, pkgData, type, patchData) {
    if (!pkgData) {
      return {
        msg: ['🌫️ 暂无可用下载资源'],
        client: [],
        patchesMessages: []
      }
    }

    const gameName = getGameName(game)
    const isPre = type === 'pre'

    if (game === 'ww') {
      return this.formatWWDownloadInfo(pkgData, patchData, gameName, isPre)
    }

    return this.formatOtherGamesInfo(pkgData, patchData, gameName, isPre)
  }

  formatWWDownloadInfo (pkgData, patchData, gameName, isPre) {
    const msg = []
    const client = []
    const patchesMessages = []

    msg.push(
      `🌊 ${gameName}${isPre ? '预下载' : '正式'}版本 - ${pkgData.version || '未知'}`
    )

    let clientText = '📦 完整客户端包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'

    pkgData.game_pkgs?.forEach((pkg, i) => {
      clientText += `${i + 1}. 🗃️ URL: ${pkg.url || `无链接${pkg.url}`}\n`
      clientText += `⚖️ 文件大小: ${this.formatSize(pkg.size)}\n`
      clientText += `🔍 MD5: ${pkg.md5 || '未知'}\n`
    })

    client.push(clientText)

    if (patchData?.game_pkgs?.length > 0) {
      let patchText = '🔄 各版本差分包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.game_pkgs.forEach((pkg, i) => {
        patchText += `${i + 1}. 🧩 版本: ${pkg.version || '未知'}\n`
        patchText += `🗃️ URL: ${pkg.url || '无链接'}\n`
        patchText += `⚖️ 文件大小: ${this.formatSize(pkg.size)}\n`
        patchText += `🔍 MD5: ${pkg.md5 || '未知'}\n\n`
      })
      patchesMessages.push(patchText)
    }

    return {
      msg,
      client,
      patchesMessages
    }
  }

  formatOtherGamesInfo (pkgData, patchData, gameName, isPre) {
    const msg = []
    const clent = []
    const audio = []
    const patch_audio = []
    const patch_clent = []

    msg.push(`🎮 ${gameName}${isPre ? '预下载' : '正式'}版本（${pkgData.version || '未知'}）`)

    let clientMsg = '📦 客户端分卷包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'

    if (pkgData.game_pkgs) {
      pkgData.game_pkgs.forEach((pkg, i) => {
        clientMsg += `${i + 1}. 🗃️ 链接：${pkg.url || '无链接'}\n`
        clientMsg += `⚖️ 大小：${this.formatSize(pkg.size)}\n`
        clientMsg += `🔍 MD5：${pkg.md5 || '未知'}\n\n`
      })
    }

    clent.push(clientMsg)

    if (pkgData.audio_pkgs?.length > 0) {
      let audioMsg = '🎧 语言资源包：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      pkgData.audio_pkgs.forEach(audioPkg => {
        audioMsg += `🌍 语言类型：${audioPkg.language?.toUpperCase() || '未知'}\n`
        audioMsg += `🗃️ 链接：${audioPkg.url || '无链接'}\n`
        audioMsg += `⚖️ 大小：${this.formatSize(audioPkg.size)}\n`
        audioMsg += `🔍 MD5：${audioPkg.md5 || '未知'}\n\n`
      })
      audio.push(audioMsg)
    }

    if (patchData?.game_pkgs?.length > 0) {
      let patchMsg = '🔄 增量更新：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.game_pkgs.forEach((pkg, i) => {
        patchMsg += `${i + 1}. 🧩 链接：${pkg.url || '无链接'}\n`
        patchMsg += `⚖️ 大小：${this.formatSize(pkg.size)}\n`
        patchMsg += `🔍 MD5: ${pkg.md5 || '未知'}\n\n`
      })
      patch_clent.push(patchMsg)
    }

    if (patchData?.audio_pkgs?.length > 0) {
      let audioPatchMsg = '🎶 增量语音资源：\n▂▂▂▂▂▂▂▂▂▂▂▂\n'
      patchData.audio_pkgs.forEach(audioPkg => {
        audioPatchMsg += `🌍 语言类型：${audioPkg.language?.toUpperCase() || '未知'}\n`
        audioPatchMsg += `🧩 链接：${audioPkg.url || '无链接'}\n`
        audioPatchMsg += `⚖️ 大小：${this.formatSize(audioPkg.size)}\n`
        audioPatchMsg += `🔍 MD5：${audioPkg.md5 || '未知'}\n\n`
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
