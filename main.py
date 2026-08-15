from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any

import astrbot.api.message_components as Comp
from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star, StarTools, register
from astrbot.core.message.message_event_result import MessageChain

from .gamepush_service import GAME_CONFIG, GamePushService, game_name
from .renderer import LocalCardRenderer


def _command_aliases(action: str) -> set[str]:
    aliases = {
        f"{alias}{action}"
        for game in GAME_CONFIG.values()
        for alias in game["aliases"]
    }
    aliases.discard(f"原神{action}")
    return aliases


@register(
    "astrbot_plugin_gamepush",
    "Yzmm",
    "监控游戏版本更新并推送原有游戏卡片通知",
    "2.0.0",
)
class GamePushPlugin(Star):
    def __init__(self, context: Context, config: dict[str, Any] | None = None) -> None:
        super().__init__(context)
        self.config = config if config is not None else {}
        self.plugin_dir = Path(__file__).parent
        self.service: GamePushService | None = None
        self.renderer: LocalCardRenderer | None = None
        self.monitor_task: asyncio.Task[None] | None = None
        self._last_runs: dict[str, str] = {}

    async def initialize(self) -> None:
        data_dir = Path(StarTools.get_data_dir(self.name))
        self.service = GamePushService(
            self.plugin_dir,
            data_dir,
            self.config,
            self._send_target,
            self._render_card,
        )
        await self.service.initialize()
        self.renderer = LocalCardRenderer(data_dir / "renders")
        try:
            await self.renderer.start()
        except Exception as error:
            self.renderer = None
            logger.error(f"GamePush 本地图片渲染器启动失败，将使用文本推送: {error}")
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("GamePush AstrBot 插件已加载")

    async def terminate(self) -> None:
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        if self.service:
            await self.service.close()
        if self.renderer:
            await self.renderer.stop()

    async def _render_card(self, style: str, data: dict[str, Any]) -> str:
        assert self.service
        data |= {
            "bot": {"name": "AstrBot"},
            "plugin": {"name": "GamePush", "version": "2.0.0"},
            "pluResPath": "",
        }
        if not self.renderer:
            raise RuntimeError("本地图片渲染器未启动")
        return await self.renderer.render(self.service.template(style), data)

    async def _send_target(self, target: dict[str, str], content: str, is_image: bool) -> None:
        chain = MessageChain([
            Comp.Image.fromFileSystem(content) if is_image else Comp.Plain(text=content)
        ])
        if target.get("umo"):
            await self.context.send_message(target["umo"], chain)
            return
        group_id = target.get("group_id")
        if not group_id:
            raise ValueError("推送目标缺少群组 ID")
        await StarTools.send_message_by_id(
            "GroupMessage", group_id, chain, target.get("platform", "aiocqhttp")
        )

    async def _monitor_loop(self) -> None:
        while True:
            try:
                for game in GAME_CONFIG:
                    if not self.service:
                        continue
                    cfg = self.service.game_config(game)
                    if not cfg.get("enable"):
                        continue
                    now = datetime.now()
                    marker = now.strftime("%Y%m%d%H%M")
                    if self._cron_matches(str(cfg.get("cron", "")), now) and self._last_runs.get(game) != marker:
                        self._last_runs[game] = marker
                        try:
                            await self.service.check_version(game)
                        except Exception as error:
                            logger.error(f"[{game_name(game)}] 自动检查失败: {error}")
            except Exception as error:
                logger.error(f"GamePush 定时任务异常: {error}")
            await asyncio.sleep(15)

    @staticmethod
    def _cron_matches(expression: str, now: datetime) -> bool:
        fields = expression.split()
        if len(fields) == 6:
            values = [now.second, now.minute, now.hour, now.day, now.month, (now.weekday() + 1) % 7]
        elif len(fields) == 5:
            fields = ["0", *fields]
            values = [now.second, now.minute, now.hour, now.day, now.month, (now.weekday() + 1) % 7]
        else:
            logger.warning(f"GamePush 忽略无效 cron: {expression}")
            return False
        return all(GamePushPlugin._cron_field_matches(field, value) for field, value in zip(fields, values))

    @staticmethod
    def _cron_field_matches(field: str, value: int) -> bool:
        for item in field.split(","):
            base, separator, step_text = item.partition("/")
            try:
                step = int(step_text) if separator else 1
            except ValueError:
                continue
            if step <= 0:
                continue
            if base == "*":
                if value % step == 0:
                    return True
                continue
            if "-" in base:
                try:
                    start, end = (int(number) for number in base.split("-", 1))
                    if start <= value <= end and (value - start) % step == 0:
                        return True
                except ValueError:
                    continue
            else:
                try:
                    start = int(base)
                    if value == start or (separator and value >= start and (value - start) % step == 0):
                        return True
                except ValueError:
                    continue
        return False

    def _parse_game_command(self, message: str) -> tuple[str, str] | None:
        clean = message.strip().lstrip("/").strip()
        for game, info in GAME_CONFIG.items():
            for alias in sorted(info["aliases"], key=len, reverse=True):
                if clean.lower().startswith(alias.lower()):
                    return game, clean[len(alias):].strip()
        return None

    def _target_from_event(self, event: AstrMessageEvent) -> dict[str, str] | None:
        group_id = str(event.get_group_id() or "")
        if not group_id:
            return None
        target = {"group_id": group_id, "platform": "aiocqhttp"}
        umo = getattr(event, "unified_msg_origin", "")
        if umo:
            target["umo"] = str(umo)
        return target

    def _save_push_target(self, game: str, target: dict[str, str], enabled: bool) -> bool:
        cfg = self.config.setdefault(game, {})
        groups = cfg.setdefault("push_groups", [])
        if not isinstance(groups, list):
            groups = cfg["push_groups"] = []
        existing = next((item for item in groups if isinstance(item, dict) and item.get("group_id") == target["group_id"]), None)
        if enabled and not existing:
            groups.append(target)
        elif not enabled and existing:
            groups.remove(existing)
        else:
            return False
        if hasattr(self.config, "save_config"):
            self.config.save_config()
        return True

    async def _handle_game_command(self, event: AstrMessageEvent, action: str, value: str = "") -> str:
        parsed = self._parse_game_command(event.get_message_str())
        if not parsed or not self.service:
            return "插件尚未完成初始化"
        game, _ = parsed
        try:
            if action == "版本监控":
                if not event.is_admin():
                    return "该命令仅限管理员使用"
                await self.service.check_version(game)
                return f"已完成 {game_name(game)} 版本检查"
            elif action in ("开启版本推送", "关闭版本推送"):
                if not event.is_admin():
                    return "该命令仅限管理员使用"
                target = self._target_from_event(event)
                if not target:
                    return "该功能仅限群聊中使用"
                enabled = action.startswith("开启")
                changed = self._save_push_target(game, target, enabled)
                if changed:
                    return f"已{'开启' if enabled else '关闭'}本群 {game_name(game)} 版本推送"
                return "本群推送配置未发生变化"
            elif action == "当前版本":
                main = await self.service.db.get_state(game, "main") or "未知"
                pre = await self.service.db.get_state(game, "pre") or "未开启"
                return f"{game_name(game)}当前版本信息\n正式版本：{main}\n预下载版本：{pre}"
            elif action == "版本数据":
                main, pre = await self.service.db.history(game, value)
                if not main and not pre:
                    return f"暂无 {game_name(game)} 版本数据"
                lines = [f"{game_name(game)}历史版本数据"]
                lines += [f"正式版 {row[0]} | {row[1] or '大小未知'} | {row[2]}" for row in main]
                lines += [f"预下载 {row[0]}（旧版 {row[1] or '未知'}）| {row[2] or '大小未知'} | {row[3]}" for row in pre]
                return "\n".join(lines)
            elif action in ("获取下载链接", "获取预下载链接"):
                if game in ("ys", "bh3"):
                    return f"{game_name(game)}暂不支持获取下载链接"
                kind = "pre" if action == "获取预下载链接" else "main"
                download = await self.service.get_download_data(game, kind)
                return self.service.download_text(game, kind, download)
        except Exception as error:
            logger.error(f"[{game_name(game)}] 命令执行失败: {error}")
            return f"操作失败：{error}"
        return "未知命令"

    async def _handle_state_command(self, event: AstrMessageEvent, action: str, value: str = "") -> str:
        if not event.is_admin() or not self.service:
            return "该命令仅限管理员使用"
        parsed = self._parse_game_command(event.get_message_str())
        game = parsed[0] if parsed else "ys"
        kind = "pre" if "预下载" in action else "main"
        if action.startswith("删除"):
            await self.service.db.delete_state(game, kind)
            return f"已删除 {game_name(game)} {'预下载' if kind == 'pre' else '正式版'}版本状态"
        if action.startswith("设置"):
            if not value:
                return "请提供要设置的版本号"
            await self.service.db.set_state(game, kind, value)
            return f"已设置 {game_name(game)} {'预下载' if kind == 'pre' else '正式版'}版本为 {value}"
        return "未知管理命令"

    @filter.command("原神版本监控", alias=_command_aliases("版本监控"))
    async def version_monitor(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "版本监控"))

    @filter.command("原神开启版本推送", alias=_command_aliases("开启版本推送"))
    async def enable_push(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "开启版本推送"))

    @filter.command("原神关闭版本推送", alias=_command_aliases("关闭版本推送"))
    async def disable_push(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "关闭版本推送"))

    @filter.command("原神当前版本", alias=_command_aliases("当前版本"))
    async def current_version(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "当前版本"))

    @filter.command("原神版本数据", alias=_command_aliases("版本数据"))
    async def version_history(self, event: AstrMessageEvent, version: str = ""):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "版本数据", version))

    @filter.command("原神获取下载链接", alias=_command_aliases("获取下载链接"))
    async def download_links(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "获取下载链接"))

    @filter.command("原神获取预下载链接", alias=_command_aliases("获取预下载链接"))
    async def predownload_links(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_game_command(event, "获取预下载链接"))

    @filter.command("原神删除rediskey", alias=_command_aliases("删除rediskey"))
    async def delete_main_state(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_state_command(event, "删除rediskey"))

    @filter.command("原神删除预下载rediskey", alias=_command_aliases("删除预下载rediskey"))
    async def delete_pre_state(self, event: AstrMessageEvent):
        event.stop_event()
        yield event.plain_result(await self._handle_state_command(event, "删除预下载rediskey"))

    @filter.command("原神设置rediskey", alias=_command_aliases("设置rediskey"))
    async def set_main_state(self, event: AstrMessageEvent, version: str):
        event.stop_event()
        yield event.plain_result(await self._handle_state_command(event, "设置rediskey", version))

    @filter.command("原神设置预下载rediskey", alias=_command_aliases("设置预下载rediskey"))
    async def set_pre_state(self, event: AstrMessageEvent, version: str):
        event.stop_event()
        yield event.plain_result(await self._handle_state_command(event, "设置预下载rediskey", version))

    @filter.command("更新游戏版本数据")
    async def update_history(self, event: AstrMessageEvent):
        event.stop_event()
        if not event.is_admin():
            yield event.plain_result("该命令仅限管理员使用")
            return
        yield event.plain_result("AstrBot 版本使用本地 SQLite 自动维护历史数据，无需下载外部数据库。")

    @filter.command("游戏推送渲染测试")
    async def render_test(self, event: AstrMessageEvent):
        """管理员私聊渲染五张测试卡片，不请求游戏接口也不发送群推送。"""
        event.stop_event()
        if not event.is_admin() or not event.is_private_chat():
            yield event.plain_result("该命令仅限管理员私聊使用")
            return
        if not self.renderer:
            yield event.plain_result("本地图片渲染器未启动，当前只能使用文本推送")
            return

        images = []
        failures = []
        for index, game in enumerate(("ys", "sr", "zzz", "bh3", "ww"), start=1):
            try:
                assert self.service
                icon = await self.service.inline_image(await self.service.game_icon(game))
                image = await self._render_card(
                    "default",
                    {
                        "gameName": game_name(game),
                        "type": "main",
                        "oldVersion": f"{index}.0.0",
                        "newVersion": f"{index}.0.1",
                        "formattedTotalSize": "12.34 GB",
                        "incrementalSize": "1.23 GB",
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "icon": icon,
                    },
                )
                images.append(Comp.Image.fromFileSystem(image))
            except Exception as error:
                logger.error(f"[{game_name(game)}] 渲染测试失败: {error}")
                failures.append(f"{game_name(game)}：{error}")

        if images:
            yield event.chain_result(images)
        if failures:
            yield event.plain_result("渲染失败\n" + "\n".join(failures))
