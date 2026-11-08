# 七星牌（七个行星牌）

《外星来信》行星牌的网页复刻：12×9 字形棋盘、联机对战、观战与 Cloudflare Pages 部署。

**在线地址：** https://planet-cards-web.pages.dev

---

## 玩法概要

- **单人**：与本地 AI 对弈。
- **双人联机**：一人创建房间，另一人输入房间码加入。
- **观战**：第三人起输入同一房间码进入观战（只读，双方手牌可见）。
- 牌面与界面文案均用外星符号；可选隐藏英文标注（默认隐藏）。

### 联机流程

1. 主界面填写名字 → 进入 **pair player game**（房间页）。
2. **create game**：生成房间码，点码可复制分享。对方进房后房间码自动隐藏。
3. **join game**：输入已有房间码。若房间不存在（无人创建），拒绝进房并显示 `no`。
4. 准备房内可点座位旁的 **first / second** 选定先手；双方点 **yes** 后开局。
5. 终局后点 **again** 再来一局；此时牌堆下方可改 **home / guest** 先后手，改完双方需重新点 again。

### 座位与视角

| 角色 | 说明 |
|------|------|
| home（房主） | 座位 0，创建房间者 |
| guest（客机） | 座位 1，第二位加入者 |
| spectator（观战） | 第三人及以后；不能操作、不能点 again |

---

## 本地运行

```bash
npm install
npm start
```

浏览器打开提示的本机地址（默认 `http://127.0.0.1:5173`）。本地同样提供 `/ws` 中继。

可选公网调试：

```bash
npm run tunnel
```

---

## 部署（Cloudflare）

联机依赖两处：

1. **Worker `planet-cards`**：Durable Object 房间中继（`cf-worker/index.js`）
2. **Pages `planet-cards-web`**：静态站 + `/ws` 转发到 DO

```bash
npm run deploy:worker   # 先部署中继
npm run deploy          # 构建 _site 并部署 Pages
```

Pages 项目绑定 `ROOMS` → Worker `planet-cards` 的 `GameRoom`（见 `wrangler.toml`）。

---

## 目录结构

| 路径 | 说明 |
|------|------|
| `index.html` / `styles.css` / `main.js` | 页面与主逻辑 |
| `game.js` | 发牌、胜负、联机权威状态 |
| `net.js` | WebSocket 进房（`intent=join` 校验房间存在） |
| `icons.js` / `assets/` | 字形与资源 |
| `settings.js` | 名字、配色、隐藏英文等 |
| `server.mjs` | 本地静态 + WS 中继 |
| `cf-worker/` | Cloudflare DO 中继 |
| `functions/` | Pages Function：`/ws` → DO |
| `scripts/build-site.mjs` | 打包到 `_site`（控制体积） |

---

## 联机协议（摘要）

主机权威。常见消息：

- `hello` / `join` / `spectate-hello`：入座或观战报到
- `lobby`：准备房同步（名字、ready、先手、是否有客机）
- `start` / `state`：开局与权威状态快照
- `action`：客机操作 → 主机演算后广播 `state`
- `again` / `again-sync`：终局再来
- `first` / `first-sync`：改先后手（准备房或终局阶段）
- `leave`：离开（带 `role`，观战离开不影响对局）

进房：`wss://…/ws?room=CODE`；加入方加 `intent=join`，房间内无人则返回 `room-missing`。

---

## 许可与来源

玩法与符号灵感来自《Message From Aliens / 外星来信》；本仓库为爱好者复刻，非官方产品。
