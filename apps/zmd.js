import { GamePushBase } from "./base.js"
import { GAME_CONFIG } from "#GamePush.model"

export class zmdPush extends GamePushBase {
  constructor() {
    super({
      gameId: "zmd",
      gameName: GAME_CONFIG.zmd.name,
      regPattern: GAME_CONFIG.zmd.reg,
      priority: 100
    })
  }
}
