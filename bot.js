const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const BOT_TOKEN      = process.env.BOT_TOKEN;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;   // @CryptoBot токен
const WIZARD_API_KEY = process.env.WIZARD_API_KEY;     // wizard-bot.com API ключ
const ADMIN_ID       = process.env.ADMIN_ID;           // Твой Telegram ID
const PORT           = process.env.PORT || 3000;
const WEBHOOK_URL    = process.env.WEBHOOK_URL;        // https://твой-домен.railway.app

// ─── ПАКЕТЫ STARS (настрой цены под себя) ──────────────────────────────────
const PACKAGES = [
  { id: 'stars_50',   stars: 50,   price: 0.55,  label: '⭐ 50 Stars — $0.55'  },
  { id: 'stars_100',  stars: 100,  price: 1.00,  label: '⭐ 100 Stars — $1.00' },
  { id: 'stars_500',  stars: 500,  price: 4.50,  label: '⭐ 500 Stars — $4.50' },
  { id: 'stars_1000', stars: 1000, price: 8.50,  label: '⭐ 1000 Stars — $8.50'},
];

// ─── CRYPTOBOT API ─────────────────────────────────────────────────────────
const cryptoApi = axios.create({
  baseURL: 'https://pay.crypt.bot/api',
  headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN }
});

async function createInvoice(stars, amount, userId) {
  const res = await cryptoApi.post('/createInvoice', {
    asset: 'USDT',
    amount: amount.toFixed(2),
    description: `${stars} Telegram Stars для @пользователя`,
    payload: JSON.stringify({ stars, userId }),
    expires_in: 3600
  });
  return res.data.result;
}

// ─── WIZARD-BOT API ────────────────────────────────────────────────────────
const wizardApi = axios.create({
  baseURL: 'https://api.wizard-bot.com/v1',
  headers: { 'X-API-KEY': WIZARD_API_KEY }
});

async function getWizardBalance() {
  const res = await wizardApi.get('/user/profile');
  return res.data;
}

async function sendStars(telegramId, stars) {
  const res = await wizardApi.post('/orders/create', {
    telegram_id: telegramId,
    amount: stars,
    type: 'stars'
  });
  return res.data;
}

// ─── BOT ───────────────────────────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);

// /start
bot.start(async (ctx) => {
  const name = ctx.from.first_name || 'друг';
  await ctx.reply(
    `✨ Привет, ${name}!\n\n` +
    `Здесь можно купить <b>Telegram Stars</b> по выгодной цене.\n\n` +
    `Stars нужны для:\n` +
    `• 🎁 Отправки подарков\n` +
    `• 💎 Поддержки авторов\n` +
    `• 🔓 Доступа к эксклюзивному контенту\n\n` +
    `Выбери пакет:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...PACKAGES.map(p => [Markup.button.callback(p.label, `buy_${p.id}`)]),
        [Markup.button.callback('💬 Поддержка', 'support')]
      ])
    }
  );
});

// Выбор пакета
for (const pkg of PACKAGES) {
  bot.action(`buy_${pkg.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `⭐ <b>${pkg.stars} Telegram Stars</b>\n\n` +
      `💵 Цена: <b>$${pkg.price} USDT</b>\n\n` +
      `Нажми кнопку ниже чтобы перейти к оплате:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Оплатить', `pay_${pkg.id}`)],
          [Markup.button.callback('◀️ Назад', 'back_main')]
        ])
      }
    );
  });
}

// Создать инвойс
for (const pkg of PACKAGES) {
  bot.action(`pay_${pkg.id}`, async (ctx) => {
    await ctx.answerCbQuery('⏳ Создаём счёт...');
    try {
      const invoice = await createInvoice(pkg.stars, pkg.price, ctx.from.id);
      await ctx.editMessageText(
        `💳 <b>Счёт создан!</b>\n\n` +
        `⭐ ${pkg.stars} Stars → <b>$${pkg.price} USDT</b>\n\n` +
        `После оплаты Stars придут <b>автоматически</b> на твой аккаунт.\n\n` +
        `⏳ Счёт действителен 60 минут.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('💳 Оплатить через CryptoBot', invoice.pay_url)],
            [Markup.button.callback('◀️ Назад', 'back_main')]
          ])
        }
      );
    } catch (e) {
      console.error('Invoice error:', e.message);
      await ctx.reply('❌ Ошибка при создании счёта. Попробуй позже.');
    }
  });
}

// Назад в меню
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⭐ <b>Купить Telegram Stars</b>\n\nВыбери пакет:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...PACKAGES.map(p => [Markup.button.callback(p.label, `buy_${p.id}`)]),
        [Markup.button.callback('💬 Поддержка', 'support')]
      ])
    }
  );
});

// Поддержка
bot.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📩 По вопросам обращайся: @ТВОЙ_ЮЗЕРНЕЙМ');
});

// Команда /balance (только для админа)
bot.command('balance', async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  try {
    const profile = await getWizardBalance();
    await ctx.reply(
      `📊 <b>Баланс Wizard API:</b>\n\n` +
      `💰 ${JSON.stringify(profile, null, 2)}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await ctx.reply('❌ Ошибка: ' + e.message);
  }
});

// ─── EXPRESS + CRYPTOBOT WEBHOOK ───────────────────────────────────────────
const app = express();
app.use(express.json());

// Telegram webhook
app.use(bot.webhookCallback('/webhook'));

// CryptoBot webhook — вызывается когда оплата прошла
app.post('/cryptobot-webhook', async (req, res) => {
  res.sendStatus(200); // отвечаем сразу

  try {
    const update = req.body;
    if (update.update_type !== 'invoice_paid') return;

    const invoice = update.payload;
    if (invoice.status !== 'paid') return;

    // Парсим payload который мы задали при создании инвойса
    const { stars, userId } = JSON.parse(invoice.payload);

    console.log(`✅ Оплата: ${stars} Stars для user ${userId}`);

    // Уведомляем пользователя что ждём
    await bot.telegram.sendMessage(userId,
      `✅ <b>Оплата получена!</b>\n\n⏳ Отправляем ${stars} Stars на твой аккаунт...`,
      { parse_mode: 'HTML' }
    );

    // Отправляем Stars через wizard-bot API
    const order = await sendStars(userId, stars);
    console.log('Wizard order:', order);

    // Уведомляем об успехе
    await bot.telegram.sendMessage(userId,
      `🎉 <b>${stars} Stars успешно отправлены!</b>\n\nСпасибо за покупку! ⭐`,
      { parse_mode: 'HTML' }
    );

    // Уведомляем админа
    if (ADMIN_ID) {
      await bot.telegram.sendMessage(ADMIN_ID,
        `💰 <b>Новая продажа!</b>\n\n` +
        `Stars: ${stars}\n` +
        `User ID: ${userId}\n` +
        `Сумма: $${invoice.amount} ${invoice.asset}`,
        { parse_mode: 'HTML' }
      );
    }

  } catch (e) {
    console.error('Webhook error:', e.message);
    // Попытаться уведомить пользователя об ошибке
    try {
      const { userId, stars } = JSON.parse(req.body?.payload?.payload || '{}');
      if (userId) {
        await bot.telegram.sendMessage(userId,
          `❌ Ошибка при отправке Stars. Обратись в поддержку — мы всё исправим.`
        );
      }
    } catch {}
  }
});

// ─── ЗАПУСК ────────────────────────────────────────────────────────────────
async function start() {
  if (WEBHOOK_URL) {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    console.log(`✅ Webhook set: ${WEBHOOK_URL}/webhook`);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start().catch(console.error);
