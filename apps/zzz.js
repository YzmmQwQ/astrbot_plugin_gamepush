import { GamePushBase } from "./base.js"
import { download } from "#GamePush.model"
import { makeForwardMsg } from "#GamePush.lib"

const zzzReg = "(%|％|绝区零|zzz|ZZZ|绝区)"

export class zzzPush extends GamePushBase {
  constructor() {
    super({
      gameId: "zzz",
      gameName: "绝区零",
      regPattern: zzzReg,
      priority: 100,
      extraRules: [
        {
          reg: `^#*${zzzReg}获取下载链接$`,
          fnc: "zzzDownloadLinks"
        },
        {
          reg: `^#*${zzzReg}获取预下载链接$`,
          fnc: "zzzPreDownloadLinks"
        }
      ]
    })
  }

  /**
   * 获取绝区零下载链接
   */
  async zzzDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "main",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取绝区零预下载链接
   */
  async zzzPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "pre")
      if (!data) return this.reply("🚫 绝区零当前未开放预下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "pre",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}
