import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import path from "path";
import os from "os";
import fs from "fs/promises";
import fsSync from "fs";
import { createRequire } from "module";
import * as cheerio from "cheerio";
import { spawn } from "child_process";

const app = express();
const PORT = 3000;
const TOKEN_DIR = path.join(process.cwd(), ".auth");
const TOKEN_FILE = path.join(TOKEN_DIR, "google-calendar-token.json");
const USAGE_DB_FILE = path.join(TOKEN_DIR, "jeeves-usage.sqlite");
const DISCORD_BOT_LOG_FILE = path.join(TOKEN_DIR, "discord-bot-log.json");
const DISCORD_ALERT_FILE = path.join(TOKEN_DIR, "discord-message-alerts.json");
const GMAIL_BRIEF_FILE = path.join(TOKEN_DIR, "baxter-gmail-briefs.json");
const GMAIL_LOW_PRIORITY_SENDERS_FILE = path.join(TOKEN_DIR, "baxter-gmail-low-priority-senders.json");
const GMAIL_TRIAGE_STATE_FILE = path.join(TOKEN_DIR, "baxter-gmail-triage-state.json");
const MET_ARTWORK_CACHE_FILE = path.join(TOKEN_DIR, "met-artwork-of-the-day.json");
const DEFAULT_WEATHER_LOCATION = {
  name: "Kloten, Švýcarsko",
  latitude: 47.4515,
  longitude: 8.5849,
};
const MET_USER_AGENT = "Jeeves 3.0 weather widget/1.0";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const USAGE_TIME_ZONE = process.env.JEEVES_USAGE_TIME_ZONE || "Europe/Zurich";
const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CELLO_TERMS = ["cello", "violoncello", "violoncelle", "violoncelo"];
const MKZ_JOBS_URL = "https://www.stadt-zuerich.ch/mkz/de/ueber-mkz/jobs.html?search=q%3D%26stellentyp%3D%26dienstabteilung%3DMusikschule%2BKonservatorium%2BZ%25C3%25BCrich%26beschaeftigungsgrad%3D%26lang%3Dde%26compResource%3D%252Fcontent%252Fbetriebssites%252Fmkz%252Fde%252Fueber-mkz%252Fjobs%252Fjcr%253Acontent%252Fmainparsys%252Fjobsearch%26variant%3Ddefault%26limit%3D1";
const DISCORD_LISTING_URL = "https://discord.com/channels/@me/1505505323723788329/1505854691026927686";
const DISCORD_LISTING_CHANNEL_ID = "1505505323723788329";
const DISCORD_LISTING_MESSAGE_ID = "1505854691026927686";
const MET_COLLECTION_API_URL = "https://collectionapi.metmuseum.org/public/collection/v1";
const ARTWORK_OF_THE_DAY_TIME_ZONE = process.env.JEEVES_ARTWORK_TIME_ZONE || "Europe/Zurich";
const NETFLIX_BROWSE_URL = "https://www.netflix.com/browse";
const NETFLIX_SEARCH_URL = "https://www.netflix.com/search";
const BAXTER_URL = "http://127.0.0.1:8765";
const BAXTER_HEALTH_URL = `${BAXTER_URL}/api/health`;
const BAXTER_ROOT = path.join(process.cwd(), "Baxter");
const BAXTER_PYTHON = path.join(BAXTER_ROOT, ".venv", "Scripts", "python.exe");
const GEMINI_APP_URL = "https://gemini.google.com/app";
const GEMINI_DESKTOP_SHORTCUT_NAME = "Google Gemini.lnk";
const AUNT_AGATHA_INSTRUCTION = [
  "Jsi Aunt Agatha, trpělivý, přísný a věcný německý tutor němčiny.",
  "Mluv se mnou primárně německy a veď se mnou živou konverzaci.",
  "Když udělám chybu v němčině, vždy mě oprav: krátce napiš nebo řekni správnou verzi a stručně vysvětli proč.",
  "Nepřerušuj každou větu dlouhou přednáškou; opravy drž krátké a praktické.",
  "Nepodlézej mi, nechval mě automaticky a nepoužívej prázdné povzbuzování.",
  "Buď trpělivý, jasný a důsledný. Když mluvím česky nebo anglicky, pomoz mi převést myšlenku do přirozené němčiny.",
  "Začni německy jednoduchou otázkou a pokračuj podle mých odpovědí.",
].join("\n");
let lastNetflixOpenAt = 0;
let lastNetflixUrl = "";
let lastBaxterOpenAt = 0;
let lastBaxterAdvertUrl = "";
let lastBaxterAdvertAt = 0;
let lastAuntAgathaOpenAt = 0;
let gmailTriageRunPromise: Promise<any> | null = null;
const GEMINI_LIVE_PRICING_USD_PER_1M = {
  input: {
    text: 0.75,
    audio: 3.00,
    image: 1.00,
    video: 1.00,
    unknown: 0.75,
  },
  output: {
    text: 4.50,
    audio: 12.00,
    image: 4.50,
    video: 4.50,
    unknown: 4.50,
  },
};

app.use(express.json());
app.use(cookieParser());

const require = createRequire(import.meta.url);
let usageDb: any = null;

const getUsageDb = () => {
  if (!usageDb) {
    const { DatabaseSync } = require("node:sqlite");
    fsSync.mkdirSync(TOKEN_DIR, { recursive: true });
    usageDb = new DatabaseSync(USAGE_DB_FILE);
    usageDb.exec(`
      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        month TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_token_count INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_sessions (
        session_id TEXT NOT NULL,
        month TEXT NOT NULL,
        model TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        prompt_text_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_audio_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_image_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_video_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_unknown_tokens INTEGER NOT NULL DEFAULT 0,
        response_text_tokens INTEGER NOT NULL DEFAULT 0,
        response_audio_tokens INTEGER NOT NULL DEFAULT 0,
        response_image_tokens INTEGER NOT NULL DEFAULT 0,
        response_video_tokens INTEGER NOT NULL DEFAULT 0,
        response_unknown_tokens INTEGER NOT NULL DEFAULT 0,
        total_token_count INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL,
        PRIMARY KEY (session_id, month)
      );
    `);
  }

  return usageDb;
};

const getMonthKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find(part => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const normalizeModality = (value: unknown) => {
  const modality = String(value || "unknown").toLowerCase();
  if (modality.includes("text")) return "text";
  if (modality.includes("audio")) return "audio";
  if (modality.includes("image")) return "image";
  if (modality.includes("video")) return "video";
  return "unknown";
};

const normalizeSearchText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const hasCelloTerm = (...values: unknown[]) => {
  const haystack = normalizeSearchText(values.filter(Boolean).join(" "));
  return CELLO_TERMS.some(term => haystack.includes(term));
};

const MET_ARTWORKS = [
  {
    objectID: 436535,
    description: "Van Gogh maloval tuto krajinu během pobytu v Saint-Rémy. Cypřiše a zvlněné pole patří k jeho nejrozpoznatelnějším motivům.",
    fact: "Zajímavost: existují tři blízké verze tohoto námětu; Met vlastní jednu z nejznámějších.",
  },
  {
    objectID: 436105,
    description: "Jacques-Louis David proměnil Platónovo vyprávění o Sókratově smrti v jeden z ikonických obrazů neoklasicismu.",
    fact: "Zajímavost: obraz vznikl roku 1787, těsně před Francouzskou revolucí, a často se čte jako oslava občanské odvahy.",
  },
  {
    objectID: 437881,
    description: "Vermeerova tichá scéna s mladou ženou a mapou je slavná pro průzračné světlo a téměř filmovou zdrženlivost.",
    fact: "Zajímavost: je to první Vermeerův obraz, který se dostal do americké sbírky.",
  },
  {
    objectID: 436575,
    description: "El Grecův pohled na Toledo je jednou z nejslavnějších krajin evropského malířství, dramatická a skoro vizionářská.",
    fact: "Zajímavost: krajina je v dějinách umění výjimečná, protože není jen pozadím, ale hlavním tématem obrazu.",
  },
  {
    objectID: 437394,
    description: "Rembrandt zde neukazuje Aristotela jako suchou autoritu, ale jako člověka přemýšlejícího o slávě, moudrosti a paměti.",
    fact: "Zajímavost: když Met obraz získal v roce 1961, šlo o jednu z nejsledovanějších akvizic muzea.",
  },
  {
    objectID: 438817,
    description: "Degasův taneční sál zachycuje balet jako práci: čekání, únava, trénink a drobné pohyby místo jevištního lesku.",
    fact: "Zajímavost: Degas byl posedlý zákulisím baletu a tanečnice kreslil znovu a znovu jako studii pohybu.",
  },
  {
    objectID: 12127,
    description: "Sargentův portrét Madame X patří k nejslavnějším společenským portrétům 19. století a zároveň k největším skandálům Salonu.",
    fact: "Zajímavost: původně spadlé ramínko šatů vyvolalo rozruch; Sargent ho později na obraze přemaloval.",
  },
  {
    objectID: 11417,
    description: "Leutzeho monumentální Washington se stal jedním z nejznámějších obrazů americké historické paměti.",
    fact: "Zajímavost: obraz vznikl v Německu, přesto se stal téměř učebnicovým symbolem Spojených států.",
  },
  {
    objectID: 435809,
    description: "Bruegelovi Ženci patří do cyklu ročních dob a ukazují venkovský svět s neobyčejnou šíří i lidskostí.",
    fact: "Zajímavost: obraz je často považován za jeden z vrcholů severní renesanční krajinomalby.",
  },
  {
    objectID: 436282,
    description: "Dvojice panelů Jana van Eycka spojuje Ukřižování a Poslední soud s mimořádně jemnou malířskou přesností.",
    fact: "Zajímavost: malé měřítko panelů kontrastuje s obrovskou hustotou detailu, typickou pro van Eyckovu dílnu.",
  },
  {
    objectID: 436947,
    description: "Manetovo Boating patří k obrazům, které pomohly modernímu malířství opustit akademickou vážnost a přiblížit se současnému životu.",
    fact: "Zajímavost: ploché barevné plochy a odvážné oříznutí obrazu ukazují Manetův moderní pohled.",
  },
  {
    objectID: 437980,
    description: "Van Goghův obraz Cypresses patří mezi jeho pozdní krajiny, v nichž se příroda mění v rytmus barev a tahů štětce.",
    fact: "Zajímavost: cypřiše Van Gogha fascinovaly podobně jako slunečnice; považoval je za silný, osobní motiv.",
  },
];

const getArtworkDayParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARTWORK_OF_THE_DAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find(part => part.type === "year")?.value || date.getUTCFullYear());
  const month = Number(parts.find(part => part.type === "month")?.value || date.getUTCMonth() + 1);
  const day = Number(parts.find(part => part.type === "day")?.value || date.getUTCDate());

  return { year, month, day };
};

const getArtworkDayKey = (date = new Date()) => {
  const { year, month, day } = getArtworkDayParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const getArtworkForDate = (date = new Date()) => {
  const { year, month, day } = getArtworkDayParts(date);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return MET_ARTWORKS[dayNumber % MET_ARTWORKS.length];
};

const readCachedMetArtwork = async () => {
  try {
    return JSON.parse(await fs.readFile(MET_ARTWORK_CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
};

const writeCachedMetArtwork = async (artwork: any) => {
  try {
    await fs.mkdir(TOKEN_DIR, { recursive: true });
    await fs.writeFile(MET_ARTWORK_CACHE_FILE, JSON.stringify(artwork, null, 2), "utf8");
  } catch (error: any) {
    console.warn("Met artwork cache write failed", error.message);
  }
};

const fetchMetArtwork = async () => {
  const curatedArtwork = getArtworkForDate();
  const dayKey = getArtworkDayKey();
  const response = await fetch(`${MET_COLLECTION_API_URL}/objects/${curatedArtwork.objectID}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Jeeves 3.0 artwork of the day/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Met API error: ${response.status}`);
  }

  const object: any = await response.json();
  const image = object.primaryImage || object.primaryImageSmall || "";
  if (!image) {
    throw new Error("Met API nevrátil obrázek pro dnešní dílo.");
  }

  return {
    objectID: object.objectID,
    title: object.title || "Bez názvu",
    artist: object.artistDisplayName || "Neznámý autor",
    date: object.objectDate || "",
    medium: object.medium || "",
    department: object.department || "",
    image,
    imageSmall: object.primaryImageSmall || image,
    metUrl: object.objectURL || `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    description: curatedArtwork.description,
    fact: curatedArtwork.fact,
    dayKey,
    source: "The Metropolitan Museum of Art Collection API",
  };
};

const isBaxterRunning = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(BAXTER_HEALTH_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const openUrlInWindows = (url: string) => {
  const opener = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
};

const toPowerShellSingleQuoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const runDetachedPowerShell = (script: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) reject(new Error(`PowerShell skončil s kódem ${code}.`));
      else resolve();
    });
  });

const getGeminiDesktopShortcutPath = () => {
  const userDesktop = path.join(process.env.USERPROFILE || os.homedir(), "Desktop", GEMINI_DESKTOP_SHORTCUT_NAME);
  if (fsSync.existsSync(userDesktop)) return userDesktop;

  const publicDesktop = path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop", GEMINI_DESKTOP_SHORTCUT_NAME);
  if (fsSync.existsSync(publicDesktop)) return publicDesktop;

  return "";
};

const openAuntAgatha = async () => {
  const now = Date.now();
  if (now - lastAuntAgathaOpenAt < 3000) {
    return {
      result: "Aunt Agatha se už otevírá. Instrukce jsou připravené ve schránce.",
      url: GEMINI_APP_URL,
    };
  }
  lastAuntAgathaOpenAt = now;

  const shortcutPath = getGeminiDesktopShortcutPath();
  const encodedInstruction = Buffer.from(AUNT_AGATHA_INSTRUCTION, "utf16le").toString("base64");
  const shortcutLiteral = shortcutPath ? toPowerShellSingleQuoted(shortcutPath) : "$null";
  const geminiUrlLiteral = toPowerShellSingleQuoted(GEMINI_APP_URL);
  const script = `
$instruction = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedInstruction}'))
Set-Clipboard -Value $instruction
$shortcut = ${shortcutLiteral}
if ($shortcut -and (Test-Path -LiteralPath $shortcut)) {
  Start-Process -LiteralPath $shortcut
} else {
  Start-Process ${geminiUrlLiteral}
}
`.trim();

  await runDetachedPowerShell(script);

  return {
    result: shortcutPath
      ? "Otevřel jsem Google Gemini. Instrukce Aunt Agatha jsou ve schránce."
      : "Otevřel jsem Gemini v prohlížeči. Instrukce Aunt Agatha jsou ve schránce.",
    url: GEMINI_APP_URL,
    shortcutFound: Boolean(shortcutPath),
  };
};

const buildNetflixUrl = (title?: string) => {
  const cleanTitle = String(title || "").trim().replace(/^film\s+/i, "").trim();
  if (!cleanTitle) return { url: NETFLIX_BROWSE_URL, title: "" };

  const url = new URL(NETFLIX_SEARCH_URL);
  url.searchParams.set("q", cleanTitle);
  return { url: url.toString(), title: cleanTitle };
};

const openNetflix = (title?: string) => {
  const { url, title: cleanTitle } = buildNetflixUrl(title);
  const now = Date.now();
  if (url === lastNetflixUrl && now - lastNetflixOpenAt < 3000) {
    return {
      url,
      title: cleanTitle,
      result: cleanTitle
        ? `Netflix se už otevírá s hledáním: ${cleanTitle}`
        : `Netflix se už otevírá: ${NETFLIX_BROWSE_URL}`,
    };
  }

  lastNetflixOpenAt = now;
  lastNetflixUrl = url;
  openUrlInWindows(url);

  return {
    url,
    title: cleanTitle,
    result: cleanTitle
      ? `Otevřel jsem Netflix a vyhledal "${cleanTitle}".`
      : `Otevřel jsem Netflix: ${NETFLIX_BROWSE_URL}`,
  };
};

const ensureBaxterRunning = async () => {
  let startedNow = false;
  if (!(await isBaxterRunning())) {
    if (!fsSync.existsSync(BAXTER_PYTHON)) {
      throw new Error(`Nenašel jsem lokální Python pro Baxtera: ${BAXTER_PYTHON}`);
    }

    const child = spawn(
      BAXTER_PYTHON,
      ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8765"],
      {
        cwd: BAXTER_ROOT,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    );
    child.unref();
    startedNow = true;

    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await isBaxterRunning()) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!(await isBaxterRunning())) {
      throw new Error("Baxter se spustil, ale health endpoint nezačal odpovídat.");
    }
  }

  return startedNow;
};

const openBaxter = async () => {
  const now = Date.now();
  if (now - lastBaxterOpenAt < 4000) {
    return `Baxter se už otevírá: ${BAXTER_URL}`;
  }
  lastBaxterOpenAt = now;

  const startedNow = await ensureBaxterRunning();

  openUrlInWindows(BAXTER_URL);
  return startedNow
    ? `Spustil jsem Baxtera a otevřel jeho aplikaci: ${BAXTER_URL}`
    : `Baxter už běžel, otevřel jsem jeho aplikaci: ${BAXTER_URL}`;
};

const toBaxterAbsoluteUrl = (value: unknown) => {
  const url = String(value || "");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${BAXTER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

const enrichBaxterApplicationResponse = (payload: any) => {
  const details = payload?.details && typeof payload.details === "object" ? { ...payload.details } : {};
  for (const key of ["pdf_url", "draft_file_url"]) {
    if (details[key]) details[key] = toBaxterAbsoluteUrl(details[key]);
  }
  return {
    ...payload,
    details,
    url: BAXTER_URL,
  };
};

const normalizeBriefItems = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === "object")
    .map((item: any) => ({
      id: String(item.id || item.messageId || item.message_id || item.url || "").trim(),
      sender: String(item.sender || item.from || item.from_ || "").trim(),
      subject: String(item.subject || item.title || "").trim(),
      summary: String(item.summary || item.reason || item.why || item.body || "").trim(),
      nextAction: String(item.nextAction || item.next_action || item.action || "").trim(),
      bucket: String(item.bucket || item.category || "").trim(),
      url: String(item.url || item.display_url || "").trim(),
      date: String(item.date || item.receivedAt || item.received_at || "").trim(),
      audit: String(item.audit || item.auditNote || item.audit_note || item.status || "").trim(),
    }));
};

const briefSummaryToText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return normalizeBriefItems(value)
      .map(item => [item.sender, item.subject, item.summary || item.nextAction].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");
  }
  if (value && typeof value === "object") {
    const item = normalizeBriefItems([value])[0];
    return item ? [item.sender, item.subject, item.summary || item.nextAction].filter(Boolean).join(": ") : "";
  }
  return "";
};

const normalizeGmailBriefPayload = (payload: any) => {
  const source = payload?.brief && typeof payload.brief === "object" ? payload.brief : payload || {};
  const timestamp = String(source.timestamp || source.runTimestamp || source.run_timestamp || new Date().toISOString());
  const attentionNeeded = normalizeBriefItems(source.attentionNeeded || source.attention_needed || source.needsAttention);
  const draftsCreated = normalizeBriefItems(source.draftsCreated || source.drafts_created || source.drafts);
  const lowPriorityActions = normalizeBriefItems(source.lowPriorityActions || source.low_priority_actions || source.lowPriority);
  const uncertainItems = normalizeBriefItems(source.uncertainItems || source.uncertain_items || source.risks);
  const counts = source.counts && typeof source.counts === "object" ? source.counts : {};

  return {
    id: String(source.id || `gmail-${Date.parse(timestamp) || Date.now()}`),
    timestamp,
    source: String(source.source || "gmail-attention-brief"),
    counts: {
      scanned: Number(counts.scanned ?? counts.messagesScanned ?? source.scanned ?? 0),
      attentionNeeded: Number(counts.attentionNeeded ?? counts.attention_needed ?? attentionNeeded.length),
      draftsCreated: Number(counts.draftsCreated ?? counts.drafts_created ?? draftsCreated.length),
      lowPriorityActions: Number(counts.lowPriorityActions ?? counts.low_priority_actions ?? lowPriorityActions.length),
      uncertainItems: Number(counts.uncertainItems ?? counts.uncertain_items ?? uncertainItems.length),
    },
    attentionNeeded,
    draftsCreated,
    lowPriorityActions,
    uncertainItems,
    nextFollowUps: normalizeBriefItems(source.nextFollowUps || source.next_follow_ups),
    summary: briefSummaryToText(source.summary || source.finalOutput || source.final_output),
  };
};

const readGmailBriefs = async () => {
  try {
    const raw = await fs.readFile(GMAIL_BRIEF_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.briefs) ? parsed.briefs : [];
  } catch {
    return [];
  }
};

const getLocalDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find(part => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find(part => part.type === "day")?.value || String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const readGmailTriageState = async () => {
  try {
    const raw = await fs.readFile(GMAIL_TRIAGE_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const storeGmailTriageState = async (state: any) => {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(GMAIL_TRIAGE_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  return state;
};

const getHeaderValue = (headers: any[] | undefined, name: string) =>
  headers?.find(header => String(header?.name || "").toLowerCase() === name.toLowerCase())?.value || "";

const gmailMessageUrl = (messageId: string) => `https://mail.google.com/mail/#all/${encodeURIComponent(messageId)}`;

const classifyGmailMessage = (message: any, lowPrioritySenders: string[]) => {
  const headers = message.payload?.headers || [];
  const sender = String(getHeaderValue(headers, "From")).trim();
  const subject = String(getHeaderValue(headers, "Subject") || "(Bez předmětu)").trim();
  const date = String(getHeaderValue(headers, "Date")).trim();
  const snippet = String(message.snippet || "").trim();
  const haystack = normalizeSearchText([sender, subject, snippet].join(" "));
  const senderRuleMatched = lowPrioritySenders.some(senderRule =>
    senderRule && haystack.includes(normalizeSearchText(senderRule))
  );
  const isUnread = Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD");
  const securityTerms = ["otp", "one-time", "security", "verification", "overeni", "ověření", "password", "heslo", "kod", "kód"];
  const actionTerms = ["invoice", "rechnung", "payment", "zahlung", "reminder", "erinnerung", "deadline", "frist", "termin", "invitation", "einladung", "confirm", "potvr", "reply", "antwort", "bewerbung", "order", "objednavka"];
  const newsletterTerms = ["newsletter", "sale", "sleva", "aktion", "angebot", "digest", "unsubscribe", "promo", "marketing"];
  const uncertainTerms = ["maybe", "depends", "frage", "question", "angebot", "nabidka", "nabídka", "information", "info"];
  const item = {
    id: String(message.id || ""),
    sender,
    subject,
    summary: snippet,
    nextAction: "",
    bucket: "",
    date,
    url: gmailMessageUrl(String(message.id || "")),
    audit: "Read-only daily triage; no Gmail labels were changed.",
  };

  if (senderRuleMatched || newsletterTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "lowPriorityActions",
      item: {
        ...item,
        bucket: senderRuleMatched ? "sender rule" : "newsletter",
        nextAction: "Suggested low priority; left unchanged in Gmail.",
      },
    };
  }

  if (securityTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "attentionNeeded",
      item: {
        ...item,
        bucket: "security",
        nextAction: "Verify whether this security or verification message was expected.",
      },
    };
  }

  if (isUnread || actionTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "attentionNeeded",
      item: {
        ...item,
        bucket: isUnread ? "unread/action" : "action",
        nextAction: "Review and decide whether a reply or concrete action is needed.",
      },
    };
  }

  if (uncertainTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "uncertainItems",
      item: {
        ...item,
        bucket: "uncertain",
        nextAction: "Check context before filing or replying.",
      },
    };
  }

  return {
    bucket: "lowPriorityActions",
    item: {
      ...item,
      bucket: "can wait",
      nextAction: "No immediate action detected; left unchanged in Gmail.",
    },
  };
};

const runGmailDailyTriageNow = async ({ force = false, source = "manual" } = {}) => {
  if (gmailTriageRunPromise) return gmailTriageRunPromise;

  gmailTriageRunPromise = (async () => {
    const today = getLocalDateKey();
    const state = await readGmailTriageState();
    if (!force && state.lastSuccessfulDay === today) {
      const briefs = await readGmailBriefs();
      return {
        skipped: true,
        reason: "Gmail triage už dnes proběhla.",
        day: today,
        latest: briefs[0] || null,
      };
    }

    const oauth2Client = await getAuthenticatedClient();
    if (!oauth2Client) {
      throw new Error("Google účet není připojený. Připoj Google znovu, aby Jeeves mohl číst Gmail.");
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 30,
      q: "newer_than:14d",
    });
    const messageRefs = listResponse.data.messages || [];
    const messages = await Promise.all(
      messageRefs.map(async ref => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: String(ref.id),
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return response.data;
      })
    );
    const buckets: Record<string, any[]> = {
      attentionNeeded: [],
      draftsCreated: [],
      lowPriorityActions: [],
      uncertainItems: [],
    };

    for (const message of messages) {
      const classified = classifyGmailMessage(message, lowPrioritySenders);
      buckets[classified.bucket].push(classified.item);
    }

    const attentionTop = buckets.attentionNeeded.slice(0, 5);
    const brief = await storeGmailBrief({
      id: `gmail-daily-${today}`,
      timestamp: new Date().toISOString(),
      source: `jeeves-daily-gmail-triage:${source}`,
      counts: {
        scanned: messages.length,
        attentionNeeded: buckets.attentionNeeded.length,
        draftsCreated: buckets.draftsCreated.length,
        lowPriorityActions: buckets.lowPriorityActions.length,
        uncertainItems: buckets.uncertainItems.length,
      },
      attentionNeeded: buckets.attentionNeeded,
      draftsCreated: buckets.draftsCreated,
      lowPriorityActions: buckets.lowPriorityActions,
      uncertainItems: buckets.uncertainItems,
      nextFollowUps: attentionTop.map(item => `${item.subject}: ${item.nextAction}`),
      summary: `Daily Gmail triage scanned ${messages.length} recent messages. No Gmail labels were changed.`,
    });
    const baxter = await forwardGmailBriefToBaxter(brief);
    await storeGmailTriageState({
      lastSuccessfulDay: today,
      lastSuccessfulAt: new Date().toISOString(),
      lastBriefId: brief.id,
      scanned: messages.length,
      source,
    });

    return { skipped: false, day: today, brief, baxter };
  })().finally(() => {
    gmailTriageRunPromise = null;
  });

  return gmailTriageRunPromise;
};

const runGmailDailyTriageOnStartup = () => {
  setTimeout(() => {
    runGmailDailyTriageNow({ force: false, source: "startup" })
      .then(result => {
        if (result?.skipped) {
          console.log(`Gmail triage skipped: ${result.reason}`);
        } else {
          console.log(`Gmail triage completed for ${result.day}`);
        }
      })
      .catch(error => console.warn("Gmail daily triage did not run", error.message));
  }, 2500);
};

const buildGmailQuickBrief = (brief: any) => {
  if (!brief) return null;

  const counts = brief.counts || {};
  const attentionNeeded = Array.isArray(brief.attentionNeeded) ? brief.attentionNeeded : [];
  const uncertainItems = Array.isArray(brief.uncertainItems) ? brief.uncertainItems : [];
  const draftsCreated = Array.isArray(brief.draftsCreated) ? brief.draftsCreated : [];
  const lowPriorityActions = Array.isArray(brief.lowPriorityActions) ? brief.lowPriorityActions : [];
  const nextFollowUps = Array.isArray(brief.nextFollowUps) ? brief.nextFollowUps : [];
  const topItems = attentionNeeded.slice(0, 5).map((item: any) => ({
    id: item.id,
    sender: item.sender,
    subject: item.subject || "Bez předmětu",
    summary: item.nextAction || item.summary || "Zkontrolovat a rozhodnout další krok.",
    url: item.url,
  }));
  const nextActions = nextFollowUps.slice(0, 3);
  const attentionCount = Number(counts.attentionNeeded ?? attentionNeeded.length);
  const uncertainCount = Number(counts.uncertainItems ?? uncertainItems.length);
  const draftsCount = Number(counts.draftsCreated ?? draftsCreated.length);
  const lowPriorityCount = Number(counts.lowPriorityActions ?? lowPriorityActions.length);
  const scannedCount = Number(counts.scanned ?? 0);
  const headlineParts = [];

  if (attentionCount > 0) headlineParts.push(`${attentionCount} věcí chce pozornost`);
  if (draftsCount > 0) headlineParts.push(`${draftsCount} návrhů čeká na kontrolu`);
  if (uncertainCount > 0) headlineParts.push(`${uncertainCount} nejisté`);
  if (headlineParts.length === 0) headlineParts.push("Inbox je bez rychlé akce");

  return {
    id: brief.id,
    lastRunAt: brief.timestamp,
    headline: headlineParts.join(", ") + ".",
    summary: String(brief.summary || "").trim(),
    counts: {
      scanned: scannedCount,
      attentionNeeded: attentionCount,
      draftsCreated: draftsCount,
      lowPriorityActions: lowPriorityCount,
      uncertainItems: uncertainCount,
    },
    topItems,
    nextActions,
    baxterUrl: BAXTER_URL,
  };
};

const normalizeSenderRule = (value: unknown) =>
  String(value || "")
    .replace(/^from:\s*/i, "")
    .trim();

const readGmailLowPrioritySenders = async () => {
  try {
    const raw = await fs.readFile(GMAIL_LOW_PRIORITY_SENDERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const senders = Array.isArray(parsed?.senders) ? parsed.senders : [];
    return senders
      .map(normalizeSenderRule)
      .filter(Boolean)
      .filter((sender: string, index: number, all: string[]) =>
        all.findIndex(item => item.toLowerCase() === sender.toLowerCase()) === index
      );
  } catch {
    return [];
  }
};

const storeGmailLowPrioritySenders = async (senders: string[]) => {
  const cleanSenders = senders
    .map(normalizeSenderRule)
    .filter(Boolean)
    .filter((sender, index, all) =>
      all.findIndex(item => item.toLowerCase() === sender.toLowerCase()) === index
    )
    .sort((a, b) => a.localeCompare(b, "cs"));

  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(
    GMAIL_LOW_PRIORITY_SENDERS_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), senders: cleanSenders }, null, 2),
    "utf-8"
  );
  return cleanSenders;
};

const addGmailLowPrioritySender = async (sender: unknown) => {
  const cleanSender = normalizeSenderRule(sender);
  if (!cleanSender) {
    throw new Error("Chybí odesílatel pro uklízení.");
  }

  const currentSenders = await readGmailLowPrioritySenders();
  return storeGmailLowPrioritySenders([...currentSenders, cleanSender]);
};

const storeGmailBrief = async (payload: any) => {
  const brief = normalizeGmailBriefPayload(payload);
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  const briefs = [brief, ...(await readGmailBriefs()).filter((item: any) => item?.id !== brief.id)].slice(0, 20);
  await fs.writeFile(GMAIL_BRIEF_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), briefs }, null, 2), "utf-8");
  return brief;
};

const forwardGmailBriefToBaxter = async (brief: any) => {
  try {
    await ensureBaxterRunning();
    const response = await fetch(`${BAXTER_URL}/api/gmail-briefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    });
    const data = await response.json().catch(() => ({}));
    return { forwarded: response.ok, status: response.status, data };
  } catch (error: any) {
    return { forwarded: false, reason: error.message };
  }
};

const sendAdvertToBaxter = async (advertUrl: string) => {
  const cleanUrl = advertUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error("URL inzerátu musí začínat http:// nebo https://.");
  }

  const now = Date.now();
  if (cleanUrl === lastBaxterAdvertUrl && now - lastBaxterAdvertAt < 5000) {
    return {
      status: "done",
      message: "Tenhle inzerát už Baxter zpracovává.",
      details: { source_url: cleanUrl },
      url: BAXTER_URL,
    };
  }
  lastBaxterAdvertUrl = cleanUrl;
  lastBaxterAdvertAt = now;

  await ensureBaxterRunning();

  const response = await fetch(`${BAXTER_URL}/api/applications/from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: cleanUrl }),
  });
  const data = await response.json().catch(() => ({}));
  const enriched = enrichBaxterApplicationResponse(data);

  if (!response.ok || data.status === "failed") {
    throw new Error(data.message || `Baxter vrátil chybu ${response.status}.`);
  }

  return enriched;
};

const startOfLocalDay = (date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const toAbsoluteUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const addTokenDetails = (target: Record<string, number>, details: any[] | undefined, fallbackTokens = 0, fallbackModality = "unknown") => {
  if (Array.isArray(details) && details.length > 0) {
    for (const detail of details) {
      const modality = normalizeModality(detail?.modality);
      target[modality] = (target[modality] || 0) + Number(detail?.tokenCount || 0);
    }
    return;
  }

  if (fallbackTokens > 0) {
    target[fallbackModality] = (target[fallbackModality] || 0) + fallbackTokens;
  }
};

const calculateUsageCost = (usageMetadata: any) => {
  const inputTokens = { text: 0, audio: 0, image: 0, video: 0, unknown: 0 };
  const outputTokens = { text: 0, audio: 0, image: 0, video: 0, unknown: 0 };

  addTokenDetails(inputTokens, usageMetadata.promptTokensDetails, Number(usageMetadata.promptTokenCount || 0), "unknown");
  addTokenDetails(inputTokens, usageMetadata.toolUsePromptTokensDetails, Number(usageMetadata.toolUsePromptTokenCount || 0), "text");
  addTokenDetails(outputTokens, usageMetadata.responseTokensDetails, Number(usageMetadata.responseTokenCount || usageMetadata.candidatesTokenCount || 0), "audio");

  const thoughtsTokenCount = Number(usageMetadata.thoughtsTokenCount || 0);
  if (thoughtsTokenCount > 0) {
    outputTokens.text += thoughtsTokenCount;
  }

  const inputCostUsd = Object.entries(inputTokens).reduce((sum, [modality, tokens]) => {
    return sum + (tokens / 1_000_000) * GEMINI_LIVE_PRICING_USD_PER_1M.input[modality as keyof typeof GEMINI_LIVE_PRICING_USD_PER_1M.input];
  }, 0);
  const outputCostUsd = Object.entries(outputTokens).reduce((sum, [modality, tokens]) => {
    return sum + (tokens / 1_000_000) * GEMINI_LIVE_PRICING_USD_PER_1M.output[modality as keyof typeof GEMINI_LIVE_PRICING_USD_PER_1M.output];
  }, 0);

  return {
    inputTokens,
    outputTokens,
    totalTokenCount: Number(usageMetadata.totalTokenCount || 0),
    costUsd: inputCostUsd + outputCostUsd,
  };
};

const getMonthlyUsage = (month = getMonthKey()) => {
  const db = getUsageDb();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) AS costUsd,
      COALESCE(SUM(total_token_count), 0) AS totalTokenCount,
      COALESCE(SUM(prompt_text_tokens), 0) AS promptTextTokens,
      COALESCE(SUM(prompt_audio_tokens), 0) AS promptAudioTokens,
      COALESCE(SUM(prompt_image_tokens), 0) AS promptImageTokens,
      COALESCE(SUM(prompt_video_tokens), 0) AS promptVideoTokens,
      COALESCE(SUM(prompt_unknown_tokens), 0) AS promptUnknownTokens,
      COALESCE(SUM(response_text_tokens), 0) AS responseTextTokens,
      COALESCE(SUM(response_audio_tokens), 0) AS responseAudioTokens,
      COALESCE(SUM(response_image_tokens), 0) AS responseImageTokens,
      COALESCE(SUM(response_video_tokens), 0) AS responseVideoTokens,
      COALESCE(SUM(response_unknown_tokens), 0) AS responseUnknownTokens
    FROM usage_sessions
    WHERE month = ?
  `).get(month) as any;

  return {
    month,
    currency: "USD",
    totalCostUsd: Number(row?.costUsd || 0),
    totalTokenCount: Number(row?.totalTokenCount || 0),
    promptTokens: {
      text: Number(row?.promptTextTokens || 0),
      audio: Number(row?.promptAudioTokens || 0),
      image: Number(row?.promptImageTokens || 0),
      video: Number(row?.promptVideoTokens || 0),
      unknown: Number(row?.promptUnknownTokens || 0),
    },
    responseTokens: {
      text: Number(row?.responseTextTokens || 0),
      audio: Number(row?.responseAudioTokens || 0),
      image: Number(row?.responseImageTokens || 0),
      video: Number(row?.responseVideoTokens || 0),
      unknown: Number(row?.responseUnknownTokens || 0),
    },
  };
};

const getRedirectUri = () => {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
  return `${appUrl}/auth/callback`;
};

const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
};

const readStoredTokens = async () => {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
};

const hasUsableGoogleTokens = (tokens: any) => {
  if (!tokens) return false;
  if (tokens.refresh_token) return true;
  return false;
};

const hasAnyGoogleTokens = (tokens: any) => !!tokens?.refresh_token || !!tokens?.access_token;
const hasGoogleScope = (tokens: any, scope: string) => String(tokens?.scope || "").split(/\s+/).includes(scope);

const storeTokens = async (tokens: any) => {
  const existingTokens = await readStoredTokens();
  const mergedTokens = {
    ...existingTokens,
    ...tokens,
    refresh_token: tokens.refresh_token || existingTokens?.refresh_token,
  };

  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(mergedTokens, null, 2), "utf8");
  return mergedTokens;
};

const getAuthenticatedClient = async () => {
  const storedTokens = await readStoredTokens();
  if (!storedTokens) return null;
  if (!hasUsableGoogleTokens(storedTokens)) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(storedTokens);
  oauth2Client.on("tokens", (tokens) => {
    storeTokens(tokens).catch((error) => console.error("Failed to store refreshed Google tokens", error));
  });

  return oauth2Client;
};

app.get("/api/auth/url", (req, res) => {
  const oauth2Client = getOAuth2Client();
  const forceConsent = req.query.force === "true";
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    scope: [
      GOOGLE_CALENDAR_READONLY_SCOPE,
      GOOGLE_CALENDAR_EVENTS_SCOPE
    ],
    ...(forceConsent ? { prompt: "consent" } : {})
  });
  res.json({ url });
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    await storeTokens(tokens);
    res.cookie("google_tokens", JSON.stringify(tokens), {
      secure: true,
      sameSite: "none",
      httpOnly: true,
    });
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autentizace proběhla úspěšně. Toto okno se automaticky zavře.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/status", (req, res) => {
  readStoredTokens()
    .then((tokens) => {
      const cookieTokens = req.cookies.google_tokens ? JSON.parse(req.cookies.google_tokens) : null;
      const connected = hasUsableGoogleTokens(tokens) || hasUsableGoogleTokens(cookieTokens);
      res.json({
        connected,
        reconnectRequired: !connected && (hasAnyGoogleTokens(tokens) || hasAnyGoogleTokens(cookieTokens)),
      });
    })
    .catch(() => res.json({ connected: false, reconnectRequired: true }));
});

app.post("/api/auth/disconnect", async (req, res) => {
  res.clearCookie("google_tokens", { secure: true, sameSite: "none", httpOnly: true });
  await fs.rm(TOKEN_FILE, { force: true });
  res.json({ success: true });
});

app.get("/api/usage/current-month", (req, res) => {
  try {
    res.json(getMonthlyUsage());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/baxter/open", async (req, res) => {
  try {
    const result = await openBaxter();
    res.json({ success: true, result, url: BAXTER_URL });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/open", async (req, res) => {
  try {
    const result = await openAuntAgatha();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/applications/from-url", async (req, res) => {
  try {
    const advertUrl = typeof req.body?.url === "string" ? req.body.url : "";
    const result = await sendAdvertToBaxter(advertUrl);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, status: "failed", message: error.message });
  }
});

app.get("/api/baxter/gmail-brief/latest", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({ latest: briefs[0] || null, briefs, lowPrioritySenders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief/quick", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({
      latest: buildGmailQuickBrief(briefs[0] || null),
      sourceBriefId: briefs[0]?.id || null,
      lowPrioritySenders,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/baxter/gmail-triage/run", async (req, res) => {
  res.status(410).json({
    success: false,
    error: "Lokální Gmail triage v Jeeves je vypnutá. Použij Codex Gmail automatizaci a pošli brief do Baxtera.",
  });
});

app.get("/api/baxter/gmail-triage/status", async (req, res) => {
  try {
    res.json(await readGmailTriageState());
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({ latest: briefs[0] || null, briefs, lowPrioritySenders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/gmail-brief", async (req, res) => {
  try {
    const brief = await storeGmailBrief(req.body);
    const baxter = await forwardGmailBriefToBaxter(brief);
    res.json({ success: true, brief, baxter });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief/low-priority-senders", async (req, res) => {
  try {
    res.json({ senders: await readGmailLowPrioritySenders() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/gmail-brief/low-priority-senders", async (req, res) => {
  try {
    const senders = await addGmailLowPrioritySender(req.body?.sender);
    res.json({ success: true, senders });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/netflix/open", (req, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title : "";
    const result = openNetflix(title);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/usage/live", (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const model = String(req.body?.model || "gemini-3.1-flash-live-preview").trim();
    const usageMetadata = req.body?.usageMetadata;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }
    if (!usageMetadata || typeof usageMetadata !== "object") {
      return res.status(400).json({ error: "Missing usageMetadata" });
    }

    const month = getMonthKey();
    const createdAt = new Date().toISOString();
    const summary = calculateUsageCost(usageMetadata);
    const metadataJson = JSON.stringify(usageMetadata);
    const db = getUsageDb();

    db.prepare(`
      INSERT INTO usage_snapshots (
        session_id,
        month,
        model,
        created_at,
        total_token_count,
        cost_usd,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      month,
      model,
      createdAt,
      summary.totalTokenCount,
      summary.costUsd,
      metadataJson
    );

    db.prepare(`
      INSERT INTO usage_sessions (
        session_id,
        month,
        model,
        updated_at,
        prompt_text_tokens,
        prompt_audio_tokens,
        prompt_image_tokens,
        prompt_video_tokens,
        prompt_unknown_tokens,
        response_text_tokens,
        response_audio_tokens,
        response_image_tokens,
        response_video_tokens,
        response_unknown_tokens,
        total_token_count,
        cost_usd,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, month) DO UPDATE SET
        model = excluded.model,
        updated_at = excluded.updated_at,
        prompt_text_tokens = excluded.prompt_text_tokens,
        prompt_audio_tokens = excluded.prompt_audio_tokens,
        prompt_image_tokens = excluded.prompt_image_tokens,
        prompt_video_tokens = excluded.prompt_video_tokens,
        prompt_unknown_tokens = excluded.prompt_unknown_tokens,
        response_text_tokens = excluded.response_text_tokens,
        response_audio_tokens = excluded.response_audio_tokens,
        response_image_tokens = excluded.response_image_tokens,
        response_video_tokens = excluded.response_video_tokens,
        response_unknown_tokens = excluded.response_unknown_tokens,
        total_token_count = excluded.total_token_count,
        cost_usd = excluded.cost_usd,
        metadata_json = excluded.metadata_json
    `).run(
      sessionId,
      month,
      model,
      createdAt,
      summary.inputTokens.text,
      summary.inputTokens.audio,
      summary.inputTokens.image,
      summary.inputTokens.video,
      summary.inputTokens.unknown,
      summary.outputTokens.text,
      summary.outputTokens.audio,
      summary.outputTokens.image,
      summary.outputTokens.video,
      summary.outputTokens.unknown,
      summary.totalTokenCount,
      summary.costUsd,
      metadataJson
    );

    res.json(getMonthlyUsage(month));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware to check auth
const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const storedClient = await getAuthenticatedClient();
    if (storedClient) {
      req.oauth2Client = storedClient;
      return next();
    }

    if (!req.cookies.google_tokens) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const tokens = JSON.parse(req.cookies.google_tokens);
    if (!hasUsableGoogleTokens(tokens)) {
      return res.status(401).json({ error: "Google Calendar needs reconnect", reconnectRequired: true });
    }

    req.oauth2Client = getOAuth2Client();
    req.oauth2Client.setCredentials(tokens);
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid tokens" });
  }
};

app.get("/api/calendar/list", requireAuth, async (req: any, res: any) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.calendarList.list();
    res.json(response.data.items);
  } catch (error: any) {
    console.error("Calendar API Error:", error.message, error.code, error.response?.status);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary", timeMin, timeMax } = req.query;
    const defaultTimeMin = startOfLocalDay();
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.list({
      calendarId: calendarId as string,
      timeMin: timeMin ? new Date(timeMin as string).toISOString() : defaultTimeMin.toISOString(),
      timeMax: timeMax ? new Date(timeMax as string).toISOString() : undefined,
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json(response.data.items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary", summary, description, start, end } = req.body;
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
      },
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/calendar/events/:eventId", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary", summary, description, start, end } = req.body;
    const { eventId } = req.params;
    const requestBody: any = {};

    if (summary !== undefined) requestBody.summary = summary;
    if (description !== undefined) requestBody.description = description;
    if (start !== undefined) requestBody.start = { dateTime: new Date(start).toISOString() };
    if (end !== undefined) requestBody.end = { dateTime: new Date(end).toISOString() };

    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.patch({
      calendarId: calendarId as string,
      eventId: eventId as string,
      requestBody,
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/calendar/events/:eventId", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary" } = req.query;
    const { eventId } = req.params;
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    await calendar.events.delete({
      calendarId: calendarId as string,
      eventId: eventId as string,
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/met/artwork-of-the-day", async (_req, res) => {
  const dayKey = getArtworkDayKey();
  const cachedArtwork = await readCachedMetArtwork();

  if (cachedArtwork?.dayKey === dayKey) {
    return res.json(cachedArtwork);
  }

  try {
    const artwork = await fetchMetArtwork();
    await writeCachedMetArtwork(artwork);
    res.json(artwork);
  } catch (error: any) {
    console.warn("Met artwork unavailable", error.message);
    if (cachedArtwork) {
      return res.json({
        ...cachedArtwork,
        stale: true,
        warning: error.message,
      });
    }

    res.status(500).json({ error: error.message || "Nepodařilo se načíst obraz dne z Metu." });
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    const requestedLocation = String(req.query.location || "").trim();
    let location = DEFAULT_WEATHER_LOCATION;

    if (requestedLocation && !requestedLocation.toLowerCase().includes("kloten")) {
      const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
      geocodeUrl.searchParams.set("q", requestedLocation);
      geocodeUrl.searchParams.set("format", "json");
      geocodeUrl.searchParams.set("limit", "1");

      const geocodeRes = await fetch(geocodeUrl, {
        headers: { "User-Agent": MET_USER_AGENT },
      });
      if (!geocodeRes.ok) throw new Error(`Geocoding error: ${geocodeRes.status}`);

      const geocodeData: any[] = await geocodeRes.json();
      if (!geocodeData.length) {
        throw new Error(`Místo "${requestedLocation}" nebylo nalezeno.`);
      }

      location = {
        name: geocodeData[0].display_name || requestedLocation,
        latitude: Number(geocodeData[0].lat),
        longitude: Number(geocodeData[0].lon),
      };
    }

    const forecastUrl = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    forecastUrl.searchParams.set("lat", location.latitude.toFixed(4));
    forecastUrl.searchParams.set("lon", location.longitude.toFixed(4));

    const forecastRes = await fetch(forecastUrl, {
      headers: { "User-Agent": MET_USER_AGENT },
    });
    if (!forecastRes.ok) throw new Error(`MET Norway error: ${forecastRes.status}`);

    const forecast = await forecastRes.json();
    const current = forecast.properties?.timeseries?.[0];
    if (!current) throw new Error("Předpověď není dostupná.");

    const details = current.data?.instant?.details || {};
    const nextHour = current.data?.next_1_hours;
    const symbol = nextHour?.summary?.symbol_code || "neznámé";
    const precipitation = nextHour?.details?.precipitation_amount ?? 0;

    res.json({
      location: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      time: current.time,
      temperature: details.air_temperature,
      windSpeed: details.wind_speed,
      windDirection: details.wind_from_direction,
      humidity: details.relative_humidity,
      symbol,
      precipitation,
      source: "MET Norway Locationforecast",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/youtube/play", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing YouTube search query" });
  }

  const searchUrl = new URL("https://www.youtube.com/results");
  searchUrl.searchParams.set("search_query", query);

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`YouTube search error: ${response.status}`);

    const html = await response.text();
    const videoIds = [...html.matchAll(/"videoId":"([^"]{11})"/g)]
      .map(match => match[1])
      .filter((videoId, index, all) => all.indexOf(videoId) === index);
    const videoId = videoIds[0];

    if (!videoId) {
      return res.json({
        query,
        url: searchUrl.toString(),
        searchUrl: searchUrl.toString(),
        direct: false,
      });
    }

    const url = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
    res.json({
      query,
      videoId,
      url,
      searchUrl: searchUrl.toString(),
      direct: true,
    });
  } catch (error: any) {
    res.json({
      query,
      url: searchUrl.toString(),
      searchUrl: searchUrl.toString(),
      direct: false,
      warning: error.message,
    });
  }
});

app.get("/api/muvac/vacancies", async (req, res) => {
  try {
    const response = await fetch('https://api.muvac.com/browse/opportunities/vacancy', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.muvac.com',
        'Referer': 'https://www.muvac.com/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Muvac API error: ${response.status}`);
    }
    
    const json = await response.json();
    const items = Array.isArray(json?.data?.items)
      ? json.data.items
      : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
          ? json.data
          : [];
    
    const celloVacancies = items
      .filter((i: any) => !i.subType || ['temporary', 'permanent'].includes(i.subType))
      .filter((i: any) => {
        const expertiseText = Array.isArray(i.expertises)
          ? i.expertises.map((e: any) => [e.group, e.id, e.name, e.label, e.title].filter(Boolean).join(' ')).join(' ')
          : '';
        return hasCelloTerm(i.title, i.name, i.description, expertiseText);
      })
      .map((i: any) => ({
        id: i.id,
        title: i.title || i.name || 'Bez názvu',
        institution: i.profile?.name || i.organization?.name || i.institution?.name || 'Unknown',
        country: (i.profile?.countryCode || i.countryCode || '').toUpperCase(),
        city: i.profile?.city || i.city || '',
        subType: i.subType || 'permanent',
        applicationEnd: typeof i.applicationEnd === 'number' && i.applicationEnd < 1_000_000_000_000
          ? i.applicationEnd * 1000
          : i.applicationEnd,
        url: i.slug
          ? `https://www.muvac.com/en/vacancy/${i.slug}`
          : `https://www.muvac.com/en/browse/opportunities/vacancy/${i.id}`
      }))
      .sort((a: any, b: any) => {
        if (!a.applicationEnd) return 1;
        if (!b.applicationEnd) return -1;
        return a.applicationEnd - b.applicationEnd;
      });
      
    res.json(celloVacancies);
  } catch (error: any) {
    console.warn("Muvac unavailable", error.message);
    res.json([]);
  }
});

const parseMusikzeitungHtmlVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const results: any[] = [];

  $('a[href*="/stellen/"]').each((_, element) => {
    const rawUrl = $(element).attr('href') || '';
    if (!rawUrl || rawUrl.includes('?_sf_s') || rawUrl.replace(/\/$/, '').endsWith('/stellen')) return;

    const url = toAbsoluteUrl(rawUrl, 'https://www.musikzeitung.ch');
    const lines = $(element).text().split('\n').map(line => line.trim()).filter(Boolean);
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    const parentText = $(element).parent().text().replace(/\s+/g, ' ').trim();
    const cardText = $(element).closest('article, .post, .elementor-post, .jet-listing-grid__item, div').text().replace(/\s+/g, ' ').trim();
    const sourceText = [text, parentText, cardText].find(value => hasCelloTerm(value)) || '';

    if (!sourceText) return;
    if (results.some(item => item.url === url)) return;

    const date = sourceText.match(/\d{2}\.\d{2}\.\d{2,4}/)?.[0] || '';
    const title = lines.find(line => hasCelloTerm(line))
      || lines.find(line => !/Lehrpersonen|Dozentinnen|Orchestermusiker/i.test(line))
      || sourceText.replace(/\s*\|\s*\d{2}\.\d{2}\.\d{2,4}.*/, '').trim()
      || 'Inzerát Musikzeitung';
    const detailLine = lines[lines.length - 1] || '';
    const institution = detailLine.includes('|')
      ? detailLine.split('|')[0].trim()
      : 'Více na webu';

    results.push({
      id: url,
      title,
      url,
      institution,
      date,
    });
  });

  return results;
};

const parseMusikzeitungFeedVacancies = (xml: string) => {
  const $ = cheerio.load(xml, { xmlMode: true });

  return $('item').toArray()
    .map((item) => {
      const element = $(item);
      const title = element.find('title').first().text().trim();
      const url = element.find('link').first().text().trim();
      const pubDate = element.find('pubDate').first().text().trim();
      const description = element.find('description').first().text();
      const content = element.find('content\\:encoded').first().text();

      return {
        id: url,
        title: title || 'Inzerát Musikzeitung',
        url,
        institution: 'Více na webu',
        date: pubDate ? new Date(pubDate).toLocaleDateString('cs-CZ') : '',
        searchText: [title, url, description, content].join(' '),
      };
    })
    .filter(item => item.url && hasCelloTerm(item.searchText))
    .map(({ searchText, ...item }) => item);
};

const parseVzmVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const textLines = $('body').text().split('\n').map(line => line.trim()).filter(Boolean);
  const startIndex = textLines.findIndex(line => line === 'Stellenanzeiger');
  const footerIndex = textLines.findIndex(line => line === 'Verband Zürcher Musikschulen');
  const lines = textLines.slice(
    startIndex === -1 ? 0 : startIndex + 1,
    footerIndex === -1 ? undefined : footerIndex
  );
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://vzm.ch'), label };
    })
    .filter(link =>
      /stellen|pdf|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label)
        && !/datenschutz/i.test(link.href + ' ' + link.label)
    );
  const vacancies: any[] = [];
  let linkIndex = 0;
  let index = 0;

  while (index < lines.length - 1) {
    const institution = lines[index];
    const title = lines[index + 1];
    if (!institution || !title || /^(Pensum|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):?$/.test(institution)) {
      index += 1;
      continue;
    }

    const details: string[] = [];
    index += 2;
    while (index < lines.length) {
      const line = lines[index];
      details.push(line);
      index += 1;
      if (line === 'Stelleninserat:') {
        if (index < lines.length && /^(pdf|Link)/i.test(lines[index])) index += 1;
        break;
      }
    }

    const detailText = details.join(' ');
    const workload = detailText.match(/Pensum:\s*(.*?)(?:\s+(?:Arbeitsort|Unterrichtsort|Unterrichtstage|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const deadline = detailText.match(/Bewerbung:\s*(.*?)(?:\s+(?:Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const location = detailText.match(/(?:Arbeitsort|Unterrichtsort):\s*(.*?)(?:\s+(?:Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const link = links[linkIndex];
    linkIndex += 1;

    vacancies.push({
      id: link?.href || `${institution}-${title}-${vacancies.length}`,
      title,
      institution,
      workload,
      location,
      deadline,
      url: link?.href || 'https://vzm.ch/stellenanzeiger/',
    });
  }

  return vacancies;
};

const parseMkzVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const lines = bodyText
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'), label };
    })
    .filter(link => /job|stellen|bewerb|smartrecruiters|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label));
  const vacancies: any[] = [];

  const addVacancy = (title: string, institution: string, date: string, url?: string) => {
    const cleanTitle = title.replace(/^#+\s*/, '').trim();
    if (!cleanTitle || /^Job$|^Jobs$|^Suchergebnis/i.test(cleanTitle)) return;
    if (vacancies.some(item => normalizeSearchText(item.title) === normalizeSearchText(cleanTitle))) return;

    const matchingLink = links.find(link =>
      normalizeSearchText(link.label).includes(normalizeSearchText(cleanTitle))
        || normalizeSearchText(cleanTitle).includes(normalizeSearchText(link.label))
    );

    vacancies.push({
      id: matchingLink?.href || url || `${cleanTitle}-${vacancies.length}`,
      title: cleanTitle,
      institution: institution || 'Musikschule Konservatorium Zürich',
      date,
      url: matchingLink?.href || url || MKZ_JOBS_URL,
    });
  };

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href') || '';
    const cardText = anchor.closest('article, li, .mod, .component, .teaser, div').text().replace(/\s+/g, ' ').trim();
    if (!/Musikschule Konservatorium Zürich|Lehrperson|Musikalische Leitung/i.test(cardText)) return;

    const title = anchor.text().replace(/\s+/g, ' ').trim()
      || cardText.match(/(?:Lehrperson|Musikalische Leitung)[^.!?]*(?:%|$)/i)?.[0]
      || '';
    const date = cardText.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(title, 'Musikschule Konservatorium Zürich', date, toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'));
  });

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    if (!/Musikschule Konservatorium Zürich/i.test(nextLine)) continue;
    if (!/(Lehrperson|Musikalische Leitung|Dozent|Leitung|Klavier|Violine|Cello|Saxophon|Querflöte|Orchester)/i.test(line)) continue;

    const date = lines[index + 2]?.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(line, nextLine, date);
  }

  return vacancies;
};

const stripDiscordMarkup = (value: unknown) =>
  String(value || "")
    .replace(/<@!?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseDiscordMessages = (messages: any[]) => {
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  return sortedMessages
    .map((message) => {
      const content = stripDiscordMarkup(message.content);
      const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
      const firstUrl = content.match(/https?:\/\/\S+/)?.[0] || attachment?.url || DISCORD_LISTING_URL;
      const cleanTitle = content.replace(/https?:\/\/\S+/g, "").trim();

      return {
        id: message.id,
        title: cleanTitle.slice(0, 140) || attachment?.filename || "Zpráva z Discord vlákna",
        author: message.author?.global_name || message.author?.username || "Discord",
        date: message.timestamp ? new Date(message.timestamp).toLocaleDateString("cs-CZ") : "",
        url: firstUrl,
        sourceUrl: DISCORD_LISTING_URL,
      };
    })
    .filter(item => item.title || item.url);
};

const fallbackDiscordListing = (note = "Otevřít vlákno v přihlášeném Discordu.") => ([{
  id: DISCORD_LISTING_MESSAGE_ID,
  title: "Discord vlákno s inzeráty",
  author: "Discord",
  date: "",
  url: DISCORD_LISTING_URL,
  sourceUrl: DISCORD_LISTING_URL,
  note,
}]);

app.get("/api/musikzeitung/vacancies", async (req, res) => {
  try {
    const htmlResponse = await fetch('https://www.musikzeitung.ch/stellen/?_sf_s=cello', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9,de;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!htmlResponse.ok) throw new Error(`Musikzeitung HTML error: ${htmlResponse.status}`);

    const html = await htmlResponse.text();
    let vacancies = parseMusikzeitungHtmlVacancies(html);

    if (vacancies.length === 0) {
      const feedResponse = await fetch('https://www.musikzeitung.ch/stellen/feed?_sf_s=cello', {
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'User-Agent': BROWSER_USER_AGENT,
        },
      });
      if (feedResponse.ok) {
        vacancies = parseMusikzeitungFeedVacancies(await feedResponse.text());
      }
    }

    res.json(vacancies);
  } catch (error: any) {
    console.warn("Musikzeitung unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/vzm/vacancies", async (req, res) => {
  try {
    const response = await fetch('https://vzm.ch/stellenanzeiger/', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`VZM error: ${response.status}`);

    res.json(parseVzmVacancies(await response.text()));
  } catch (error: any) {
    console.warn("VZM unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/mkz/vacancies", async (req, res) => {
  try {
    const response = await fetch(MKZ_JOBS_URL, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`MKZ error: ${response.status}`);

    res.json(parseMkzVacancies(await response.text()));
  } catch (error: any) {
    console.warn("MKZ unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/discord/vacancies", async (req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) {
    return res.json(fallbackDiscordListing());
  }

  try {
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_LISTING_CHANNEL_ID}/messages/${DISCORD_LISTING_MESSAGE_ID}`,
      {
        headers: {
          Authorization: token.startsWith("Bot ") ? token : `Bot ${token}`,
          "User-Agent": "Jeeves 3.0 Discord listing/1.0",
        },
      }
    );

    if (!messageResponse.ok) {
      if (messageResponse.status === 401 || messageResponse.status === 403) {
        return res.json(fallbackDiscordListing(
          "Bot nemá přístup k tomuto soukromému @me vláknu. Otevřít ručně v přihlášeném Discordu."
        ));
      }
      throw new Error(`Discord message error: ${messageResponse.status}`);
    }

    const messagesResponse = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_LISTING_CHANNEL_ID}/messages?limit=20`,
      {
        headers: {
          Authorization: token.startsWith("Bot ") ? token : `Bot ${token}`,
          "User-Agent": "Jeeves 3.0 Discord listing/1.0",
        },
      }
    );

    if (!messagesResponse.ok) {
      const message = await messageResponse.json();
      return res.json(parseDiscordMessages([message]));
    }

    const messages = await messagesResponse.json();
    const parsedMessages = parseDiscordMessages(Array.isArray(messages) ? messages : []);
    res.json(parsedMessages.length > 0 ? parsedMessages : fallbackDiscordListing());
  } catch (error: any) {
    console.info("Discord listing fallback", error.message);
    res.json(fallbackDiscordListing());
  }
});

app.get("/api/discord/bot-log", async (req, res) => {
  try {
    const rawLog = await fs.readFile(DISCORD_BOT_LOG_FILE, "utf8");
    const entries = JSON.parse(rawLog);
    res.json(Array.isArray(entries) ? entries.slice(-20).reverse() : []);
  } catch {
    res.json([]);
  }
});

app.get("/api/discord/alerts", async (req, res) => {
  try {
    const rawAlerts = await fs.readFile(DISCORD_ALERT_FILE, "utf8");
    const entries = JSON.parse(rawAlerts);
    res.json(Array.isArray(entries) ? entries.slice(-20).reverse() : []);
  } catch {
    res.json([]);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: false,
      root: process.cwd(),
      plugins: [react(), tailwindcss()],
      define: {
        "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY || ""),
      },
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "."),
        },
      },
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
