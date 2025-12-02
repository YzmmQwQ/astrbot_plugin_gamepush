import { GamePushBase } from "./base.js"

const bh3Reg = "(!|！|崩坏三|崩坏3|崩三|崩3|bbb|三崩子)"
export class bh3Push extends GamePushBase {
  constructor() {
    super({
      gameId: "bh3",
      gameName: "崩坏3",
      regPattern: bh3Reg
    })
  }
}
