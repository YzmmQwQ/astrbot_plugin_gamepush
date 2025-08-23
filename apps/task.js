import karin from "node-karin"
import { api, gameIds, getGameName } from "#GamePush.model"
import { cfg } from "#GamePush.components"

const tasks = gameIds.map((gameId) => {
  const name = `${getGameName(gameId)}版本监控`
  const cron = cfg.getGameConfig(gameId)?.cron || "0 0/5 * * * *"
  const logset = cfg.getGameConfig(gameId)?.log || false
  logger.info(`[karin-plugin-gamepush] 创建定时任务: ${name} (cron: ${cron})`)

  return karin.task(
    name,
    cron,
    async () => {
      try {
        api.autoCheck(gameId)
      } catch (e) {
        logger.error(`[karin-plugin-gamepush] ${name}定时任务执行错误:`, e)
      }
    },
    { log: logset }
  )
})

export const Task = tasks
