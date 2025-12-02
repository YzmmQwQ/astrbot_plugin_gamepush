import { GamePushBase } from "./base.js"
import { download } from "#GamePush.model"
import { makeForwardMsg } from "#GamePush.lib"

const wwReg = "(~|～|鸣潮|ww|WW|mc)"

export class wwPush extends GamePushBase {
  constructor() {
    super({
      gameId: "ww",
      gameName: "鸣潮",
      regPattern: wwReg,
      priority: 100,
      extraRules: [
        {
          reg: `^#*${wwReg}获取下载链接$`,
          fnc: "wwDownloadLinks"
        },
        {
          reg: `^#*${wwReg}获取预下载链接$`,
          fnc: "wwPreDownloadLinks"
        }
      ]
    })
  }

  /**
   * 获取鸣潮下载链接
   */
  async wwDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("ww", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("ww", data, "main", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取鸣潮预下载链接
   */
  async wwPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("ww", "pre")
      if (!data) return this.reply("🚫 鸣潮当前未开放预下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("ww", data, "pre", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}
