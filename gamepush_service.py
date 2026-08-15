from __future__ import annotations

import asyncio
import base64
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

import aiohttp
from astrbot.api import logger


API_BASE = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGamePackages"
CHECK_API = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGameBranches"
DOWNLOAD_API = "https://api-takumi.mihoyo.com/downloader/sophon_chunk/api/"
GAME_API = "https://hyp-api.mihoyo.com/hyp/hyp-connect/api/getGames"
WW_API = "https://prod-cn-alicdn-gamestarter.kurogame.com/launcher/game/G152/10003_Y8xXrXk65DqFHEDgApn3cpK5lfczpFx5/index.json"
HYPERGRYPH_API = "https://launcher.hypergryph.com/api/proxy/batch_proxy"

GAME_CONFIG: dict[str, dict[str, Any]] = {
    "ys": {"name": "原神", "id": "1Z8W5NHUQb", "aliases": ["原神", "ys", "YS"]},
    "sr": {"name": "崩坏：星穹铁道", "id": "64kMb5iAWu", "aliases": ["星穹铁道", "崩坏星穹铁道", "星铁", "星轨", "穹轨", "星穹", "崩铁", "铁道", "sr", "SR", "*"]},
    "zzz": {"name": "绝区零", "id": "x6znKlJ0xK", "aliases": ["绝区零", "绝区", "zzz", "ZZZ", "%", "％"]},
    "bh3": {"name": "崩坏3", "id": "osvnlOc0S8", "aliases": ["崩坏三", "崩坏3", "崩三", "崩3", "bbb", "三崩子", "bh3", "BH3", "!", "！"]},
    "ww": {"name": "鸣潮", "aliases": ["鸣潮", "ww", "WW", "mc", "~", "～"]},
    "zmd": {"name": "终末地", "aliases": ["终末地", "zmd", "ZMD", ":", "："]},
}

DEFAULT_GAME_CONFIG = {
    "enable": True,
    "cron": "0 0/5 * * * *",
    "push_change_type": "1",
    "html": "default",
    "push_groups": [],
}


class GamePushDatabase:
    """Small SQLite store replacing the Yunzai Redis and remote database files."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS state (
              game TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
              PRIMARY KEY (game, kind)
            );
            CREATE TABLE IF NOT EXISTS main_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL,
              version TEXT NOT NULL, size TEXT, created_at TEXT NOT NULL,
              UNIQUE(game, version)
            );
            CREATE TABLE IF NOT EXISTS pre_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL,
              version TEXT NOT NULL, old_version TEXT, size TEXT, created_at TEXT NOT NULL,
              UNIQUE(game, version, old_version)
            );
            """
        )
        self.conn.commit()

    async def get_state(self, game: str, kind: str) -> str | None:
        def query() -> str | None:
            row = self.conn.execute(
                "SELECT value FROM state WHERE game = ? AND kind = ?", (game, kind)
            ).fetchone()
            return row[0] if row else None

        return await asyncio.to_thread(query)

    async def set_state(self, game: str, kind: str, value: str) -> None:
        def write() -> None:
            self.conn.execute(
                "INSERT INTO state(game, kind, value) VALUES (?, ?, ?) "
                "ON CONFLICT(game, kind) DO UPDATE SET value = excluded.value",
                (game, kind, value),
            )
            self.conn.commit()

        await asyncio.to_thread(write)

    async def delete_state(self, game: str, kind: str) -> None:
        def delete() -> None:
            self.conn.execute("DELETE FROM state WHERE game = ? AND kind = ?", (game, kind))
            self.conn.commit()

        await asyncio.to_thread(delete)

    async def add_main(self, game: str, version: str, size: str | None) -> None:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        def write() -> None:
            self.conn.execute(
                "INSERT OR IGNORE INTO main_versions(game, version, size, created_at) VALUES (?, ?, ?, ?)",
                (game, version, size, now),
            )
            self.conn.commit()

        await asyncio.to_thread(write)

    async def add_pre(self, game: str, version: str, old_version: str | None, size: str | None) -> None:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        def write() -> None:
            self.conn.execute(
                "INSERT OR IGNORE INTO pre_versions(game, version, old_version, size, created_at) VALUES (?, ?, ?, ?, ?)",
                (game, version, old_version or "", size, now),
            )
            self.conn.commit()

        await asyncio.to_thread(write)

    async def history(self, game: str, version: str = "") -> tuple[list[tuple], list[tuple]]:
        def query() -> tuple[list[tuple], list[tuple]]:
            main_sql = "SELECT version, size, created_at FROM main_versions WHERE game = ?"
            pre_sql = "SELECT version, old_version, size, created_at FROM pre_versions WHERE game = ?"
            main_args: tuple[Any, ...] = (game,)
            pre_args: tuple[Any, ...] = (game,)
            if version:
                main_sql += " AND version = ?"
                pre_sql += " AND version = ?"
                main_args += (version,)
                pre_args += (version,)
            main = self.conn.execute(main_sql + " ORDER BY id DESC", main_args).fetchall()
            pre = self.conn.execute(pre_sql + " ORDER BY id DESC", pre_args).fetchall()
            return main, pre

        return await asyncio.to_thread(query)

    async def close(self) -> None:
        await asyncio.to_thread(self.conn.close)


def game_name(game: str) -> str:
    return GAME_CONFIG.get(game, {}).get("name", "未知游戏")


def format_size(value: Any) -> str | None:
    try:
        size = float(value)
    except (TypeError, ValueError):
        return None
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    return f"{size:.2f} {units[index]}"


def is_newer(current: str, old: str) -> bool:
    def key(version: str) -> tuple[list[int], str]:
        return ([int(x) for x in re.findall(r"\d+", version)], version.lower())

    current_numbers, current_text = key(current)
    old_numbers, old_text = key(old)
    length = max(len(current_numbers), len(old_numbers))
    current_numbers += [0] * (length - len(current_numbers))
    old_numbers += [0] * (length - len(old_numbers))
    return (current_numbers, current_text) > (old_numbers, old_text)


def _hyper_body(version: str) -> dict[str, Any]:
    return {
        "proxy_reqs": [
            {
                "kind": "get_latest_game",
                "get_latest_game_req": {
                    "appcode": "6LL0KJuqHBVz33WK",
                    "channel": "1",
                    "sub_channel": "1",
                    "version": version,
                    "launcher_appcode": "abYeZZ16BPluCFyT",
                    "launcher_sub_channel": "1",
                    "disk_type": 0,
                    "patch_encrypt": True,
                },
            }
        ]
    }


class GamePushService:
    def __init__(
        self,
        plugin_dir: Path,
        data_dir: Path,
        config: dict[str, Any],
        send_target: Callable[[dict[str, str], str, bool], Awaitable[None]],
        render_image: Callable[[str, dict[str, Any]], Awaitable[str]],
    ) -> None:
        self.plugin_dir = plugin_dir
        self.config = config
        self.db = GamePushDatabase(data_dir / "gamepush.sqlite3")
        self.send_target = send_target
        self.render_image = render_image
        self.session: aiohttp.ClientSession | None = None
        self.cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self.locks = {game: asyncio.Lock() for game in GAME_CONFIG}

    async def initialize(self) -> None:
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30), trust_env=True)

    async def close(self) -> None:
        if self.session:
            await self.session.close()
        await self.db.close()

    def game_config(self, game: str) -> dict[str, Any]:
        stored = self.config.get(game, {}) if isinstance(self.config, dict) else {}
        return DEFAULT_GAME_CONFIG | (stored if isinstance(stored, dict) else {})

    async def request(self, method: str, url: str, *, body: Any = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
        if not self.session:
            await self.initialize()
        assert self.session
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                async with self.session.request(method, url, json=body, headers=headers) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}: {(await response.text())[:200]}")
                    return await response.json(content_type=None)
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, RuntimeError) as error:
                last_error = error
                if attempt < 2:
                    await asyncio.sleep(attempt + 1)
        raise RuntimeError(f"请求失败: {last_error}")

    def check_url(self, game: str) -> str:
        if game == "ww":
            return WW_API
        if game == "zmd":
            return HYPERGRYPH_API
        return f"{CHECK_API}?launcher_id=jGHBHlcOq1&game_ids[]={GAME_CONFIG[game]['id']}"

    def package_url(self, game: str) -> str:
        if game == "ww":
            return WW_API
        return f"{API_BASE}?launcher_id=jGHBHlcOq1&game_ids[]={GAME_CONFIG[game]['id']}"

    async def check_version(self, game: str) -> str:
        if game not in GAME_CONFIG:
            raise ValueError("无效的游戏标识")
        async with self.locks[game]:
            if game == "zmd":
                await self._check_hypergryph(game)
            else:
                payload = await self.request("GET", self.check_url(game))
                if game == "ww":
                    await self._process_versions(
                        game,
                        payload.get("default", {}).get("config", {}).get("version"),
                        payload.get("predownload", {}).get("config", {}).get("version"),
                    )
                else:
                    branch = payload.get("data", {}).get("game_branches", [{}])[0]
                    if not branch:
                        raise RuntimeError("游戏数据解析失败")
                    await self._process_versions(
                        game,
                        branch.get("main", {}).get("tag"),
                        branch.get("pre_download", {}).get("tag"),
                    )
        return f"{game_name(game)}检查完成"

    async def _check_hypergryph(self, game: str) -> None:
        headers = {
            "x-hg-launcher-device-id": "83a5d5ca-7f0e-4277-ba71-c9e66dafd7e4",
            "x-hg-user-token": "",
            "User-Agent": "Mozilla/5.0",
        }
        latest = await self.request("POST", HYPERGRYPH_API, body=_hyper_body(""), headers=headers)
        response = latest.get("proxy_rsps", [{}])[0].get("get_latest_game_rsp", {})
        main = response.get("version")
        if not main:
            raise RuntimeError("终末地版本数据解析失败")
        old = await self.db.get_state(game, "main") or ""
        detail = await self.request("POST", HYPERGRYPH_API, body=_hyper_body(old), headers=headers)
        detail_response = detail.get("proxy_rsps", [{}])[0].get("get_latest_game_rsp", {})
        pre = detail_response.get("pre_patch", {}).get("version")
        await self._process_versions(game, main, pre)

    async def _process_versions(self, game: str, main: str | None, pre: str | None) -> None:
        if main:
            old_main = await self.db.get_state(game, "main") or "0.0.0"
            if is_newer(main, old_main):
                if old_main != "0.0.0":
                    await self.notify("main", game, main, old_main)
                await self.db.set_state(game, "main", main)

        old_pre = await self.db.get_state(game, "pre")
        if pre and pre != old_pre:
            await self.db.set_state(game, "pre", pre)
            await self.notify("pre", game, pre, old_pre or "")
        elif not pre and old_pre:
            await self.db.delete_state(game, "pre")
            await self.notify("pre-remove", game, "", old_pre)

    async def notify(self, kind: str, game: str, new_version: str, old_version: str) -> None:
        total, incremental = await self.size_info(game, kind)
        if kind == "main":
            await self.db.add_main(game, new_version, total)
        elif kind == "pre":
            await self.db.add_pre(game, new_version, old_version, incremental)

        targets = self.targets(game)
        if not targets:
            logger.debug(f"[{game_name(game)}] 未配置推送群组")
            return
        text = self.notification_text(kind, game, new_version, old_version, total, incremental)
        cfg = self.game_config(game)
        image_path = ""
        if kind != "pre-remove" and str(cfg.get("push_change_type")) == "1":
            try:
                icon = await self.game_icon(game)
                image_path = await self.render_image(str(cfg.get("html", "default")), {
                    "gameName": game_name(game), "type": kind, "newVersion": new_version,
                    "oldVersion": old_version, "formattedTotalSize": total or "",
                    "incrementalSize": incremental or "", "date": datetime.now().strftime("%Y-%m-%d"),
                    "icon": icon,
                })
            except Exception as error:
                logger.warning(f"[{game_name(game)}] 图片渲染失败，改为文本推送: {error}")
        for target in targets:
            try:
                await self.send_target(target, image_path or text, bool(image_path))
            except Exception as error:
                logger.error(f"[{game_name(game)}] 推送失败: {error}")

    def notification_text(self, kind: str, game: str, new: str, old: str, total: str | None, incremental: str | None) -> str:
        name = game_name(game)
        if kind == "pre-remove":
            return f"{name}预下载资源已关闭\n正式版本 {old} 即将上线"
        lines = [f"{name}{'预下载资源已开放' if kind == 'pre' else '游戏版本更新通知'}"]
        lines.append(f"新版本：{new}" if kind == "pre" else f"版本变更：{old} -> {new}")
        if total:
            lines.append(f"完整大小（含中文语音）：{total}")
        if incremental:
            lines.append(f"增量更新大小：约 {incremental}")
        lines.append("请提前下载游戏资源" if kind == "pre" else "请及时更新客户端")
        return "\n".join(lines)

    def targets(self, game: str) -> list[dict[str, str]]:
        values = self.game_config(game).get("push_groups", [])
        result: list[dict[str, str]] = []
        for value in values if isinstance(values, list) else []:
            if isinstance(value, dict):
                target = {key: str(item) for key, item in value.items() if item is not None}
            elif isinstance(value, str):
                group_id = value.rsplit(":", 1)[-1]
                target = {"group_id": group_id, "platform": "aiocqhttp"}
            else:
                continue
            if target.get("umo") or target.get("group_id"):
                result.append(target)
        return result

    async def get_download_data(self, game: str, kind: str = "main") -> dict[str, Any]:
        cache_key = f"{game}:{kind}"
        cached = self.cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 30:
            return cached[1]
        if game == "zmd":
            data = await self._hyper_download(kind)
        elif game == "ww":
            data = self._ww_download(await self.request("GET", WW_API), kind)
        else:
            data = self._mhy_download(await self.request("GET", self.package_url(game)), kind)
        self.cache[cache_key] = (time.monotonic(), data)
        return data

    def _mhy_download(self, response: dict[str, Any], kind: str) -> dict[str, Any]:
        package = response.get("data", {}).get("game_packages", [{}])[0]
        section = package.get("pre_download" if kind == "pre" else "main", {})
        return {"data": section.get("major") or None, "patch": (section.get("patches") or [{}])[0]}

    def _ww_download(self, response: dict[str, Any], kind: str) -> dict[str, Any]:
        config = response.get("predownload" if kind == "pre" else "default", {}).get("config")
        if not config:
            return {"data": None, "patch": {"game_pkgs": []}}
        cdn = (response.get("cdnList") or [{}])[0].get("url", "https://pcdownload-huoshan.aki-game.com").rstrip("/")
        major = {
            "version": config.get("version", ""),
            "game_pkgs": [{"url": f"{cdn}/{str(config.get('indexFile', '')).lstrip('/')}", "size": config.get("size", 0)}],
            "audio_pkgs": [],
        }
        patches = [
            {"url": f"{cdn}/{str(item.get('indexFile', '')).lstrip('/')}", "size": item.get("size", 0), "version": item.get("version", "")}
            for item in config.get("patchConfig", []) if item.get("indexFile")
        ]
        return {"data": major, "patch": {"game_pkgs": patches, "audio_pkgs": []}}

    async def _hyper_download(self, kind: str) -> dict[str, Any]:
        headers = {"x-hg-launcher-device-id": "83a5d5ca-7f0e-4277-ba71-c9e66dafd7e4", "User-Agent": "Mozilla/5.0"}
        latest = await self.request("POST", HYPERGRYPH_API, body=_hyper_body(""), headers=headers)
        latest_version = latest.get("proxy_rsps", [{}])[0].get("get_latest_game_rsp", {}).get("version", "")
        version = latest_version if kind == "pre" else (await self.db.get_state("zmd", "main") or "")
        result = await self.request("POST", HYPERGRYPH_API, body=_hyper_body(version), headers=headers)
        response = result.get("proxy_rsps", [{}])[0].get("get_latest_game_rsp", {})
        patch = response.get("pre_patch" if kind == "pre" else "patch", {})
        packs = response.get("pkg", {}).get("packs", [])
        patch_packs = patch.get("patches", [])
        return {
            "data": {"version": latest_version, "game_pkgs": [{"url": item.get("url", ""), "size": item.get("package_size", 0)} for item in packs], "audio_pkgs": [], "total_size": sum(int(item.get("package_size", 0)) for item in packs)},
            "patch": {"game_pkgs": [{"url": item.get("url", ""), "size": item.get("package_size", 0), "version": patch.get("version", latest_version)} for item in patch_packs], "audio_pkgs": [], "total_size": sum(int(item.get("package_size", 0)) for item in patch_packs)},
        }

    async def size_info(self, game: str, kind: str) -> tuple[str | None, str | None]:
        try:
            download = await self.get_download_data(game, "pre" if kind == "pre" else "main")
            data, patch = download.get("data") or {}, download.get("patch") or {}
            total = data.get("total_size") or sum(float(item.get("size", 0) or 0) for item in data.get("game_pkgs", []))
            incremental = patch.get("total_size") or sum(float(item.get("size", 0) or 0) for item in patch.get("game_pkgs", []))
            return format_size(total), format_size(incremental)
        except Exception as error:
            logger.warning(f"[{game_name(game)}] 获取资源大小失败: {error}")
            return None, None

    def download_text(self, game: str, kind: str, download: dict[str, Any]) -> str:
        data, patch = download.get("data"), download.get("patch", {})
        if not data:
            return f"当前没有可用的{'预下载' if kind == 'pre' else '正式版本'}下载"
        title = f"{game_name(game)} {'预下载' if kind == 'pre' else '正式版'}下载信息\n版本：{data.get('version', '未知')}"
        blocks = [title]
        for label, packages in (("游戏包", data.get("game_pkgs", [])), ("音频包", data.get("audio_pkgs", [])), ("增量包", patch.get("game_pkgs", [])), ("音频增量包", patch.get("audio_pkgs", []))):
            if not packages:
                continue
            lines = [label]
            for index, package in enumerate(packages, 1):
                lines.append(f"{index}. {package.get('url', '')}\n大小：{format_size(package.get('size', 0)) or '未知'}")
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks)

    async def game_icon(self, game: str) -> str:
        if game == "ww":
            return "https://cn.bing.com/th?id=OSK.d2e8b2efa5867fba330b354d0472f5e5&w=120&h=120&qlt=120&c=6&rs=1&cdv=1&pid=RS"
        if game == "zmd":
            return "https://bbs.hycdn.cn/asset/endfield.png"
        try:
            response = await self.request("GET", f"{GAME_API}?launcher_id=jGHBHlcOq1&language=zh-cn")
            target_id = GAME_CONFIG[game].get("id")
            for item in response.get("data", {}).get("games", []):
                if item.get("id") == target_id:
                    return item.get("display", {}).get("icon", {}).get("url", "")
        except Exception as error:
            logger.warning(f"[{game_name(game)}] 获取图标失败: {error}")
        return ""

    def template(self, style: str) -> str:
        style = "Simple" if style.lower() == "simple" else "default"
        html_path = self.plugin_dir / "resources" / "html" / "GamePush-Plugin" / f"GamePush-Plugin-{style}.html"
        css_path = html_path.with_suffix(".css")
        html = html_path.read_text(encoding="utf-8")
        css = css_path.read_text(encoding="utf-8")
        for font in ("NotoColorEmoji.ttf", "HYWenHei-55W.ttf"):
            font_path = self.plugin_dir / "resources" / "fonts" / font
            if font_path.exists():
                payload = base64.b64encode(font_path.read_bytes()).decode("ascii")
                css = css.replace(f'url("../../fonts/{font}")', f'url("data:font/ttf;base64,{payload}")')
        html = re.sub(r'<link[^>]+href="\{\{pluResPath\}\}html/GamePush-Plugin/[^>]+>', f"<style>{css}</style>", html)
        return self._legacy_template_to_jinja(html)

    def _legacy_template_to_jinja(self, html: str) -> str:
        def convert_expression(expression: str) -> str:
            expression = expression.strip().replace("===", "==").replace("!==", "!=")
            question = expression.find("?")
            if question < 0:
                return expression
            depth = 0
            quote = ""
            colon = -1
            for index, character in enumerate(expression[question + 1 :], question + 1):
                if character in "'\"" and (index == 0 or expression[index - 1] != "\\"):
                    quote = "" if quote == character else (character if not quote else quote)
                elif not quote:
                    if character == "?":
                        depth += 1
                    elif character == ":":
                        if depth == 0:
                            colon = index
                            break
                        depth -= 1
            if colon < 0:
                return expression
            condition = expression[:question].strip()
            truthy = expression[question + 1 : colon].strip()
            falsey = expression[colon + 1 :].strip()
            return f"({convert_expression(truthy)} if {condition} else {convert_expression(falsey)})"

        def replace(match: re.Match[str]) -> str:
            token = match.group(1).strip()
            if token.startswith("if "):
                return "{% if " + convert_expression(token[3:]) + " %}"
            if token.startswith("else if "):
                return "{% elif " + convert_expression(token[8:]) + " %}"
            if token == "else":
                return "{% else %}"
            if token == "/if":
                return "{% endif %}"
            return "{{ " + convert_expression(token) + " }}"

        return re.sub(r"\{\{(.*?)\}\}", replace, html, flags=re.DOTALL)
