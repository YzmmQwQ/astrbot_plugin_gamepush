import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import cfg from './config.js'
import base from './base.js'
import api from './api.js';
import download from './download.js';

class Notifier extends base {
  templateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, formattedIncrementalSize }) => [
      `<span class="emoji-text">✨</span> ${gameName}游戏版本更新通知`,
      `<span class="emoji-text">🚀</span> 版本变更：${oldVersion} → ${newVersion}`,
      ...(gameName !== '原神' ? [formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`] : []),
      ...((gameName !== '原神' && gameName !== '崩坏3') ? [formattedIncrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${formattedIncrementalSize}`]: []),
      '<span class="emoji-text">📢</span> 请及时更新客户端',
      ...(gameName !== '原神' ? [`<span class="emoji-text">💾</span> 发送【#${gameName}获取下载链接】获取客户端`] : [])
    ],
    
    pre: ({ gameName, oldVersion, newVersion, formattedTotalSize, formattedIncrementalSize }) => [
      `<span class="emoji-text">🎁</span> ${gameName}预下载资源已开放`,
      oldVersion 
        ? `<span class="emoji-text">🔄</span> 版本更新：${oldVersion} → ${newVersion}`
        : `<span class="emoji-text">📦</span> 新版本：${newVersion}`,
      ...(gameName !== '原神' ? [formattedTotalSize && `<span class="emoji-text">📦</span> 完整大小（含中文语音）：${formattedTotalSize}`] : []),
      ...((gameName !== '原神' && gameName !== '崩坏3') ? [formattedIncrementalSize && `<span class="emoji-text">🔄</span> 增量更新大小：约${formattedIncrementalSize}`]: []),
      '<span class="emoji-text">📥</span> 请提前下载游戏资源',
      ...(gameName !== '原神' ? [`<span class="emoji-text">🚪</span> 发送【#${gameName}获取预下载链接】获取链接`] : [])
    ],
    
    'pre-remove': ({ gameName, oldVersion }) => [
      `<span class="emoji-text">🌙</span> ${gameName}预下载资源已关闭`,
      `<span class="emoji-text">🔒</span> 正式版本${oldVersion}即将上线`
    ]
  };
  
  textTemplateMap = {
    main: ({ gameName, oldVersion, newVersion, formattedTotalSize, formattedIncrementalSize }) => {
      const parts = [
        `✨${gameName}游戏版本更新通知`,
        `🚀版本变更：${oldVersion} → ${newVersion}`,
        ...(gameName !== '原神' ? [formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`] : []),
        ...((gameName !== '原神' && gameName !== '崩坏3') ? [formattedIncrementalSize && `🔄 增量更新大小：约${formattedIncrementalSize}`]: []),
        '📢 请及时更新客户端',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取下载链接】获取客户端`] : [])
      ]
      return parts.filter(Boolean).join('\n');
    },
    
    pre: ({ gameName, oldVersion, newVersion, formattedTotalSize, formattedIncrementalSize }) => {
      const parts = [
        `🎁${gameName}预下载资源已开放`,
        oldVersion 
          ? `🔄版本更新：${oldVersion} → ${newVersion}`
          : `📦新版本：${newVersion}`,
        ...(gameName !== '原神' ? [formattedTotalSize && `📦完整大小（含中文语音）：${formattedTotalSize}`] : []),
        ...((gameName !== '原神' && gameName !== '崩坏3') ? [formattedIncrementalSize && `🔄 增量更新大小：约${formattedIncrementalSize}`]: []),
        '📥请提前下载游戏资源',
        ...(gameName !== '原神' ? [`💾 发送【#${gameName}获取预下载链接】获取客户端`] : [])
      ];
      return parts.filter(Boolean).join('\n');
    },
    
    'pre-remove': ({ gameName, oldVersion }) => [
      `🌙${gameName}预下载资源已关闭`,
      `🔒正式版本${oldVersion}即将上线`
    ].join('\n')
  };
  
  async pushNotify({ type, game, newVersion, oldVersion, pushChangeType }) {
    try {
      const gameConfig = cfg.getGameConfig(game);
      const gameName = this.getGameName(game);
      
      let formattedTotalSize = '';
      let formattedIncrementalSize = '';
      
      if (['main', 'pre'].includes(type)) {
        const downloadData = await download.getDownloadData(game, type);
        
        if (downloadData.data) {
          const totalSize = this.calculateTotalSize(downloadData.data, game);
          formattedTotalSize = api.formatSize(totalSize);
          
          if (downloadData.patch) {
            const incrementalSize = this.calculateTotalSize(downloadData.patch, game);
            formattedIncrementalSize = api.formatSize(incrementalSize);
          }
        }
      }
      
      const templateParams = {
        gameName,
        oldVersion: oldVersion || '未知',
        newVersion: newVersion || '未知',
        formattedTotalSize,
        formattedIncrementalSize
      };
      
      if (pushChangeType === '2') {
        this.sendTextNotification(templateParams, type, game, gameConfig);
      } else {
        await this.sendImageNotification(templateParams, type, game, gameConfig);
      }
    } catch (err) {
      logger.error(`[GamePush][${this.getGameName(game)}通知] 失败`, err);
    }
  }
  
  calculateTotalSize(data, game) {
    let totalSize = 0;
    
    if (data.game_pkgs) {
      for (const pkg of data.game_pkgs) {
        if (game === 'ww') {
          if (data.game_pkgs.length > 0) {
            totalSize += parseInt(data.game_pkgs[0].size || '0', 10);
          }
          break
        }
        else {
          totalSize += parseInt(pkg.size || '0', 10);
        }
      }
    }
    
    if (data.audio_pkgs) {
      for (const audio of data.audio_pkgs) {
        if (audio.language?.toLowerCase() === 'zh-cn') {
          totalSize += parseInt(audio.size || '0', 10);
        }
      }
    }
    
    return totalSize;
  }
  
  sendTextNotification(params, type, game, gameConfig) {
    const text = this.textTemplateMap[type](params);
    api.sendToGroups(text, game, gameConfig);
  }
  
  async sendImageNotification(params, type, game, gameConfig) {
    const escapeHtml = (str) => {
      if (!str) return '';
      return str.replace(/[&<>"']/g,
        tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[tag]))
    };
    
    const data = {
      ...this.getScreenData(game),
      messages: this.templateMap[type](params),
      gameName: escapeHtml(params.gameName),
      date: new Date().toLocaleDateString(),
      type
    };
    
    const img = await puppeteer.screenshot('GamePush-Plugin/notice', data);
    api.sendToGroups(img, game, gameConfig);
  }
}

const notice = new Notifier();
export default notice;