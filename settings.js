/** 设置：word color / hide terran language（对应 GlobalData.color / hidetranslation） */

const STORAGE_KEY = "planet-cards-settings";

/**
 * FrontColor 选项（顺序对齐原版设置行）
 * terran：字形下地球人语言（英文）
 */
export const WORD_COLORS = [
  { id: "white", line: "#ffe6b3", bg: "#000000", terran: "white" },
  { id: "black", line: "#1a1208", bg: "#ffe6b3", terran: "black" },
  { id: "red2", line: "#1a1208", bg: "#ffe6b3", terran: "red2" },
  { id: "red", line: "#d9261a", bg: "#ffe6b3", terran: "red" },
  { id: "orange", line: "#ffb366", bg: "#4b3303", terran: "orange" },
  { id: "yellow", line: "#ffd926", bg: "#3a3008", terran: "yellow" },
  { id: "yellowgreen", line: "#66cc26", bg: "#243018", terran: "yellowgreen" },
  { id: "green", line: "#33b233", bg: "#1a3018", terran: "green" },
  { id: "infrablue", line: "#4d4d99", bg: "#1a1830", terran: "infrablue" },
];

/** @type {{ color: string, hideTerran: boolean, playerName: string }} */
export let settings = {
  color: "white",
  hideTerran: false,
  playerName: "",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (WORD_COLORS.some((c) => c.id === data.color)) settings.color = data.color;
    if (typeof data.hideTerran === "boolean") settings.hideTerran = data.hideTerran;
    if (typeof data.playerName === "string") {
      settings.playerName = data.playerName.slice(0, 16);
    }
  } catch (_) {
    /* ignore */
  }
}

export function saveSettings() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      color: settings.color,
      hideTerran: settings.hideTerran,
      playerName: settings.playerName,
    })
  );
}

export function setPlayerName(name) {
  settings.playerName = String(name ?? "")
    .replace(/[\r\n\t]/g, "")
    .slice(0, 16);
  saveSettings();
}

export function colorMeta(id = settings.color) {
  return WORD_COLORS.find((c) => c.id === id) || WORD_COLORS[0];
}

/** 应用到 :root（字形靠 mask + --line 上色） */
export function applySettings() {
  const c = colorMeta();
  const root = document.documentElement;
  root.style.setProperty("--line", c.line);
  root.style.setProperty("--bg", c.bg);
  root.style.setProperty("--frame", hexToRgba(c.line, 0.72));
  root.style.setProperty("--divider", c.line);
  root.style.setProperty("--hover", hexToRgba(c.line, 0.14));
  root.classList.toggle("hide-terran", settings.hideTerran);
  document.body.style.background = c.bg;
}

export function setWordColor(id) {
  if (!WORD_COLORS.some((c) => c.id === id)) return;
  settings.color = id;
  saveSettings();
  applySettings();
}

export function setHideTerran(hide) {
  settings.hideTerran = !!hide;
  saveSettings();
  applySettings();
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
