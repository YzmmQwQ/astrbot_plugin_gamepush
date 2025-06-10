const API_BASE = 'https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGamePackages'
const Check_API = 'https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches'
const LAUNCHER_ID = 'jGHBHlcOq1'
const WW_API_BASE = 'https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json'

const GAME_CONFIG = {
  ys: {
    id: '1Z8W5NHUQb',
    name: '原神',
    redisKey: 'YZ:MHY:YS',
    preKey: 'YZ:MHY:YS:PRE'
  },
  sr: {
    id: '64kMb5iAWu',
    name: '崩坏:星穹铁道',
    redisKey: 'YZ:MHY:SR',
    preKey: 'YZ:MHY:SR:PRE'
  },
  zzz: {
    id: 'x6znKlJ0xK',
    name: '绝区零',
    redisKey: 'YZ:MHY:ZZZ',
    preKey: 'YZ:MHY:ZZZ:PRE'
  },
  bh3: {
    id: 'osvnlOc0S8',
    name: '崩坏3',
    redisKey: 'YZ:MHY:BH3',
    preKey: 'YZ:MHY:BH3:PRE'
  },
  ww: {
    name: '鸣潮',
    redisKey: 'YZ:KURO:WW',
    preKey: 'YZ:KURO:WW:PRE'
  }
}

const getGameAPI = (game) => {
  if (!GAME_CONFIG[game]) throw new Error(`[GamePush-Plugin] 无效的游戏标识: ${game}`)
  if (game === 'ww') {
    return `${WW_API_BASE}`
  } else {
    return `${API_BASE}?launcher_id=${LAUNCHER_ID}&game_ids[]=${GAME_CONFIG[game].id}`
  }
}

const getGameCheckAPI = (game) => {
  if (!GAME_CONFIG[game]) throw new Error(`[GamePush-Plugin] 无效的游戏标识: ${game}`)
  if (game === 'ww') {
    return `${WW_API_BASE}`
  } else {
    return `${Check_API}?launcher_id=${LAUNCHER_ID}&game_ids[]=${GAME_CONFIG[game].id}`
  }
}

const getGameName = (game) => GAME_CONFIG[game]?.name || '未知游戏'

const getRedisKeys = (game) => {
  const config = GAME_CONFIG[game]
  return {
    main: config?.redisKey,
    pre: config?.preKey
  }
}

export {
  API_BASE,
  Check_API,
  LAUNCHER_ID,
  WW_API_BASE,
  GAME_CONFIG,
  getGameAPI,
  getGameCheckAPI,
  getGameName,
  getRedisKeys
}
