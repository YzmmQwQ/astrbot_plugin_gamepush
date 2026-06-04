const API_BASE = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGamePackages"
const CHECK_API = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches"
const Download_API = "https://api-takumi.mihoyo.com/downloader/sophon_chunk/api/"
const Game_API = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGames"
const WW_API_BASE =
  "https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json"
const HYPERGRYPH_API_BASE = "https://launcher.hypergryph.com/api/proxy/batch_proxy"

/**
 * 游戏ID
 */
export const gameIds = ["ys", "sr", "zzz", "bh3", "ww", "zmd"]

/**
 * 游戏配置信息
 */
export const GAME_CONFIG = {
  ys: {
    id: "1Z8W5NHUQb",
    name: "原神",
    biz: "hk4e_cn",
    redisPrefix: "YS",
    reg: "(ys|YS|原神)"
  },
  sr: {
    id: "64kMb5iAWu",
    name: "崩坏:星穹铁道",
    biz: "hkrpg_cn",
    redisPrefix: "SR",
    reg: "(\\*|星铁|星轨|穹轨|星穹|崩铁|星穹铁道|崩坏星穹铁道|铁道)"
  },
  zzz: {
    id: "x6znKlJ0xK",
    name: "绝区零",
    biz: "nap_cn",
    redisPrefix: "ZZZ",
    reg: "(%|％|绝区零|zzz|ZZZ|绝区)"
  },
  bh3: {
    id: "osvnlOc0S8",
    name: "崩坏3",
    biz: "bh3_cn",
    redisPrefix: "BH3",
    reg: "(!|！|崩坏三|崩坏3|崩三|崩3|bbb|三崩子)"
  },
  ww: {
    name: "鸣潮",
    redisPrefix: "WW",
    reg: "(~|～|鸣潮|ww|WW|mc)"
  },
  zmd: {
    name: "终末地",
    redisPrefix: "zmd",
    reg: "(:|：|zmd|终末地)"
  }
}

/**
 * 获取游戏API URL
 * @param {string} game - 游戏ID
 * @returns {string} API URL
 */
export const getGameAPI = (game) => {
  if (game === "ww") return WW_API_BASE
  if (game === "zmd") return HYPERGRYPH_API_BASE
  return `${API_BASE}?launcher_id=jGHBHlcOq1&game_ids[]=${GAME_CONFIG[game].id}`
}

/**
 * 获取游戏检查API URL
 * @param {string} game - 游戏ID
 * @returns {string} 检查API URL
 */
export const getGameChuckAPI = (game) => {
  if (game === "ww") return WW_API_BASE
  if (game === "zmd") return HYPERGRYPH_API_BASE
  return `${CHECK_API}?launcher_id=jGHBHlcOq1&game_ids[]=${GAME_CONFIG[game].id}`
}

/**
 * 获取下载API URL
 * @param {string} type - 下载类型
 * @param {string} package_id - 包ID
 * @param {string} password - 密码
 * @returns {string} 下载API URL
 */
export const getPatchBuildAPI = (type, package_id, password) => {
  return `${Download_API}getPatchBuild?branch=${type === "pre" ? "predownload" : "main"}&plat_app=ddxf5qt290cg&package_id=${package_id}&password=${password}`
}

export const getBuildAPI = (type, package_id, password) => {
  return `${Download_API}getBuild?branch=${type === "pre" ? "predownload" : "main"}&plat_app=ddxf5qt290cg&package_id=${package_id}&password=${password}`
}

export const getGameIcon = () => {
  return `${Game_API}?launcher_id=jGHBHlcOq1&language=zh-cn`
}
/**
 * 获取游戏名称
 * @param {string} game - 游戏ID
 * @returns {string} 游戏名称
 */
export const getGameName = (game) => GAME_CONFIG[game]?.name || "未知游戏"

/**
 * 获取Redis键
 * @param {string} game - 游戏ID
 * @returns {Object} Redis键对象
 */
export const getRedisKeys = (game) => {
  const prefix = GAME_CONFIG[game]?.redisPrefix || "GAME"
  return {
    main: `Yz:GamePush:${prefix}:Main`,
    pre: `Yz:GamePush:${prefix}:Pre`
  }
}

/**
 * 版本比较器
 */
export const versionComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
})
