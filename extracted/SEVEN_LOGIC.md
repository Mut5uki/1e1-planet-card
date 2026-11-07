# 行星牌（Seven）解包笔记

## 为何之前解不出来

| 工具 | 结果 |
|------|------|
| Il2CppDumper 6.7.46 | 不支持 metadata **v108**（最高约 31） |
| Cpp2IL **pre-release.21** | 只支持 metadata **23–106** |
| Cpp2IL **development**（本机编译） | 支持 **23–108**，可解 |

游戏：Unity **6000.6.6f1** → IL2CPP metadata **108**。  
已用 development 分支 Cpp2IL 导出：

- `extracted/il2cpp/cpp2il_out/` — 符号/空壳 C#
- `extracted/il2cpp/cpp2il_il/Assembly-CSharp.dll` — IL 恢复 DLL
- `extracted/il2cpp/decompiled/Draw.decompiled.cs` — ILSpy 反编译（`imul` 除法还原较差）
- `extracted/il2cpp/cpp2il_isil/IsilDump/Assembly-CSharp/Draw.txt` — 汇编 + ISIL（以这份为准）
- `extracted/il2cpp/SevenReconstructed.cs` — 按汇编手写还原

`Draw.Update` / `UpdateText1` 体积极大（>50KB），Cpp2IL 跳过分析；UI 主循环仍在里面，但 **Seven\* 规则函数已完整还原**。

## 牌编码

牌 ID `n ∈ [0, 48]`：

- **元素** `n % 7`：`0 earth / 1 fire / 2 metal / 3 water / 4 warm / 5 ice / 6 weed`
- **点数** `n / 7`（0–6），显示为 `点数+1`；显示为 7 时字符串为 `"1e1"`（外星字形）

## 核心流程

```
ShuffleSeven
  → sevendeck = [0..48] 洗牌
  → sevenp1 / sevenp2 各发 9 张
  → sevendiscard = 再摸 1 张（公开弃牌）
  → sevengamestate = "player1"

玩家/AI 回合：
  选 sevendiscard 或 SevenDealCard()（牌堆顶）
  → 插入手牌某位、弃掉另一张 → 新的 sevendiscard
  → SevenCheckVictory → win / lose / tie / 换边
```

## ValidTriple(i, j, k)

任意相邻三张，满足其一即合法面子：

1. 同元素：`i%7 == j%7 == k%7`
2. 同点数：`i/7 == j/7 == k/7`
3. 点数连升：`i/7+1 == j/7 && j/7+1 == k/7`（**不要求同元素**）
4. 点数连降：`i/7-1 == j/7 && j/7-1 == k/7`

## SevenCheckVictory(hand[9])

先算 `flags[0..6]`，`flags[i] = ValidTriple(hand[i..i+2])`。  
再按牌位检查（官方硬编码，不是任意覆盖）：

| 牌位 | 条件 |
|------|------|
| 0 | `flags[0]` |
| 2 | `flags[1] \|\| flags[2]` |
| 3–5 | `flags[pos-1] \|\| (flags[pos-2] && flags[pos])` |
| 6 | `flags[4] \|\| flags[5]` |
| 8 | `flags[6]` |
| 1、7 | 不单独查（由邻窗覆盖） |

含义：9 张必须形成**互相重叠衔接**的合法三张窗，三坨互不重叠的面子不能赢。

## BestRes / SevenEnemyMove（AI）

- `BestRes(hand, newcard)`：对弃牌下标 `0..8` × 插入下标 `0..8` 穷举，复制手牌 → `RemoveAt` → `Insert` → `HandValue`，取最大，返回 `(score, discardIdx, insertIdx)`。
- `SevenEnemyMove`：先 `BestRes(七人机手牌, sevendiscard)`；若得分 **`>= HandValue(当前)+3`** 则拿公开牌，否则摸牌堆再 `BestRes`。胜利则 `sevengamestate="lose"`（相对玩家），牌堆空则 `"tie"`，否则 `"player1"`。

## HandValue

- 已 `SevenCheckVictory` → 返回 `1000000`
- 否则扫相邻窗，按连子/同素/同点给分（含 +12/+10/+3/+2 等），并有轻微随机扰动；细节见 `SevenReconstructed.cs` 注释与 ISIL。

## 与网页复刻对齐情况

现有 `game.js`：

- 牌：7×7、手牌 9、公开牌、摸/插/弃 — 一致
- `ValidTriple` 三类成组 — 一致（连子官方也不要求同元素）
- 胜利用「面子覆盖 + 连通」— 与官方硬编码窗检查**近似**；极端牌序可能略有差异，若要 1:1 可改成官方 `flags` 表
