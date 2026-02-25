import { GamePushBase } from "./base.js"
import { GAME_CONFIG } from "#GamePush.model"

export class bh3Push extends GamePushBase {
  constructor() {
    super({
      gameId: "bh3",
      gameName: GAME_CONFIG.bh3.name,
      regPattern: GAME_CONFIG.bh3.reg,
      priority: 100
    })
  }
}
