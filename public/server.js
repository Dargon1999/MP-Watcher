import fetch from "node-fetch";
import admin from "firebase-admin";
import { JSDOM } from "jsdom";

// === НАСТРОЙКИ ===
const WEBHOOK = "https://discord.com/api/webhooks/1434291872540393484/pWjHaE071X7DjEmfTU1rC0CG4c0ZtHYsnEYVitXEsWX6D2RKtMQ53Rd8aMiSo-FAXwI-";
const ROLES = "<@&860246345343959050> <@&1018540333547663401>";
const FORUM = "https://forum.gta5rp.com/forums/meroprijatija-servera.425/";
const BASE_URL = "https://forum.gta5rp.com";
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 час

// === Firebase ===
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://mpgta5rp-fb175-default-rtdb.firebaseio.com",
});

const db = admin.database();
const sentRef = db.ref("sent_topics");

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function extractDate(title) {
  const m = title.match(/(\d{1,2})[.:](\d{1,2})[.:]?(\d{4})\s*[вВ]?\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const [_, d, mth, y, h, min] = m;
    return `${d.padStart(2, "0")}.${mth.padStart(2, "0")}.${y} в ${h.padStart(2, "0")}:${min}`;
  }
  return "Дата не указана";
}

function parseDate(dateStr) {
  const m = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4}) в (\d{2}):(\d{2})/);
  if (m) {
    const [_, d, mth, y, h, min] = m;
    return new Date(y, mth - 1, d, h, min);
  }
  return new Date(0);
}

async function sendToDiscord(topic) {
  const text = `${ROLES}\n**${topic.title}**\n${topic.date}\n${topic.url}`;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    await sentRef.child(topic.id).set(true);
    log(`✅ Отправлено в Discord: ${topic.title}`);
  } catch (e) {
    log(`❌ Ошибка Discord: ${e.message}`);
  }
}

async function checkForum() {
  log("🔍 Проверяю форум...");

  try {
    const proxy = "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(FORUM);
    const res = await fetch(proxy);
    const html = await res.text();
    const doc = new JSDOM(html).window.document;

    const topics = [];
    doc.querySelectorAll(".structItem").forEach(el => {
      const a = el.querySelector(".structItem-title a:last-child");
      if (!a) return;
      let href = a.getAttribute("href");
      if (!href.startsWith("http")) href = BASE_URL + href;
      const idParts = href.split(".");
      const id = idParts[idParts.length - 1].split("/")[0];
      const title = a.textContent.trim();
      if (title.includes("МП") || title.includes("ГМП")) {
        const date = extractDate(title);
        topics.push({ id, title, url: href, date });
      }
    });

    topics.sort((a, b) => parseDate(a.date) - parseDate(b.date));

    const snap = await sentRef.once("value");
    const sent = snap.val() || {};
    const now = new Date();
    let newCnt = 0;

    for (const t of topics) {
      const mpDate = parseDate(t.date);
      if (mpDate > now && !sent[t.id]) {
        await sendToDiscord(t);
        newCnt++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    log(newCnt ? `✨ Отправлено ${newCnt} новых МП` : "Нет новых мероприятий");
  } catch (e) {
    log(`❌ Ошибка при парсинге форума: ${e.message}`);
  }
}

// === ЗАПУСК ===
(async () => {
  log("🚀 Бот запущен и работает 24/7");
  await checkForum();
  setInterval(checkForum, CHECK_INTERVAL);
})();
