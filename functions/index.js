const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
admin.initializeApp();

// ⚙️ Настройки
const WEBHOOK = 'https://discord.com/api/webhooks/1434291872540393484/pWjHaE071X7DjEmfTU1rC0CG4c0ZtHYsnEYVitXEsWX6D2RKtMQ53Rd8aMiSo-FAXwI-';
const PING = '<@&1018540333547663401> <@&860246345343959050> <@&860247382456664104>';
const FORUM = 'https://forum.gta5rp.com/forums/meroprijatija-servera.425/';

// 🔁 Проверка форума каждые 5 минут
exports.checkMP = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  console.log('🔍 Проверяю форум...');
  try {
    const html = await (await fetch(FORUM)).text();
    const db = admin.firestore();
    const sent = new Set((await db.collection('sent').get()).docs.map(d => d.id));

    // Регулярка под HTML форума (обновлено 02.11.2025)
    const regex = /href="(threads\/(.*?\d+)\.([^"]+))"[^>]+PreviewTooltip[^>]+>([^<]+)<[^>]+>(\d{2}\.\d{2}\.\d{4}) в (\d{2}:\d{2})[^>]+>(Г?МП) от ([^|]+)\|([^<]+)/g;

    let match;
    let found = 0;

    while ((match = regex.exec(html)) !== null) {
      const threadId = match[2];
      if (sent.has(threadId)) continue;

      const url = `https://forum.gta5rp.com/${match[1]}`;
      const title = match[9].trim().replace(/^["«](.*)[»"]$/g, '$1');
      const type = match[7];
      const faction = match[8].trim();
      const date = match[5];
      const time = match[6];

      const embed = {
        title: `${type} от ${faction} | ${title}`,
        url,
        color: 0xFF6600,
        fields: [
          { name: 'Дата', value: date, inline: true },
          { name: 'Время', value: time, inline: true },
          { name: 'Форум', value: `[Открыть тему](${url})` }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'GTA5RP • Авто-уведомления' }
      };

      // 📤 Отправляем сообщение в Discord
      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: PING,
          embeds: [embed]
        })
      });

      // 💾 Сохраняем ID темы, чтобы не дублировать
      await db.collection('sent').doc(threadId).set({ sent: true });
      found++;
      console.log(`✅ Отправлено: ${type} ${title}`);
    }

    console.log(found ? `✅ Готово! Найдено ${found} новых МП.` : 'ℹ️ Новых тем нет.');
  } catch (err) {
    console.error('❌ Ошибка при проверке форума:', err);
  }
  return null;
});
