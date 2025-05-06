import cfg from '../../../lib/config/config.js'
import _ from 'lodash'
import path from 'node:path'

export default class base {
  constructor(e = {}) {
    this.e = e
    this.userId = Number(e?.user_id) || String(e?.user_id)
    this.model = 'GamePush-Plugin'
    this._path = process.cwd().replace(/\\/g, '/')
  }

  get prefix () {
    return `Yz:GamePush-Plugin:${this.model}:`
  }

  // 原有方法保持不变，添加辅助方法
  getGameName(game) {
    const gameNames = {
      sr: '星穹铁道',
      ys: '原神',
      zzz: '绝区零',
      bh3: '崩坏3'
    }
    return gameNames[game] || '未知游戏'
  }

  // 原有方法保持不变
  screenData(game) {
    return this.getScreenData(game)
  }

  getScreenData(game) {
    const basic = {
      saveId: `push_${game}_${Date.now()}`,
      cwd: this._path,
      tplFile: path.join(this._path, 'plugins/GamePush-Plugin/resources/html/GamePush-Plugin/GamePush-Plugin.html'),
      fontsPath: path.join(this._path, 'plugins/GamePush-Plugin/resources/fonts/'),
      pluResPath: path.join(this._path, 'plugins/GamePush-Plugin/resources/'),
      htmlSavePath: path.join(this._path, 'tmp', 'html', 'GamePush-Plugin'), // 新增存储路径[5](@ref)
      htmlFileName: `${game}_${Date.now()}.html`,// 生成唯一文件名[2](@ref)
      yunzaiName: cfg.package.name === 'miao-yunzai' ? 'Miao-Yunzai' : _.capitalize(cfg.package.name)
    }

    const icons = {
      zzz: 'https://www.miyoushe.com/_static/img/game-zzz.3ca2bac.png',
      sr: 'https://c-ssl.duitang.com/uploads/blog/202110/11/20211011094243_6ff48.jpeg',
      ys: 'https://bbs-static.miyoushe.com/avatar/avatar10011.png',
      bh3: 'https://www.miyoushe.com/_static/img/game-bh3.abe5ead.jpg'
    }

    return {
      ...basic,
      icon: icons[game]
    }
  }
}