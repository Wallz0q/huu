const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('database.json');
const db = low(adapter);

// Inisialisasi Database
db.defaults({ users: [], stocks: "" }).write();

const bot = new Telegraf(config.token);

// --- 🛡️ GLOBAL ANTI-CRASH ---
process.on('uncaughtException', (err) => console.error('Caught exception:', err));
process.on('unhandledRejection', (reason, p) => console.error('Unhandled Rejection:', reason));

// --- HELPER ---
const getUser = (id) => db.get('users').find({ id }).value();

const checkSubscription = async (ctx) => {
    for (const channel of config.channels) {
        try {
            const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
            if (['left', 'kicked'].includes(member.status)) return false;
        } catch (e) { return false; }
    }
    return true;
};

// --- ✨ PREMIUM INTERFACE ---
const mainMenu = async (ctx, isEdit = false) => {
    const user = getUser(ctx.from.id);
    const text = `<b>✨ PREMIUM OTP  ✨</b>\n\n` +
                 `<blockquote><b>👤 USER INFORMATION</b>\n` +
                 `🆔 ID: <code>${user.id}</code>\n` +
                 `🔋 Limit: <b>${user.limit}</b>\n` +
                 `👥 Referral: <b>${user.refCount}</b></blockquote>\n\n` +
                 `<i>Silahkan pilih layanan di bawah ini:</i>`;
    
    const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('📦 GET STOK', 'get_stok'), Markup.button.callback('📲 GET OTP', 'get_otp')],
        [Markup.button.callback('🔗 REFERRAL', 'refeal'), Markup.button.callback('👑 OWNER', 'owner_info')]
    ]);

    try {
        if (isEdit) {
            await ctx.editMessageCaption(text, { parse_mode: 'HTML', ...buttons });
        } else {
            await ctx.replyWithPhoto(config.photoUrl, { caption: text, parse_mode: 'HTML', ...buttons });
        }
    } catch (e) { console.log("Menu Error"); }
};

// --- COMMANDS ---
bot.start(async (ctx) => {
    const refBy = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    let user = getUser(ctx.from.id);

    if (!user) {
        user = { id: ctx.from.id, username: ctx.from.username || "Guest", limit: 2, refCount: 0, invitedBy: refBy };
        db.get('users').push(user).write();
    }

    const isSub = await checkSubscription(ctx);
    if (!isSub) {
        return ctx.reply("⚠️ <b>WAJIB JOIN CHANNEL!</b>\n\nSilahkan bergabung ke channel kami untuk melanjutkan.", {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📣 Channel 1', 'https://t.me/+AqcdsWwPL9k4NjI9')],
                [Markup.button.url('📣 Channel 2', 'https://t.me/+P7LBsHIDjoRjNDg1')],
                [Markup.button.url('📣 Testimoni', 'https://t.me/+63lDBfDeBT84NDBl')],
                [Markup.button.callback('✅ SAYA SUDAH JOIN', 'check_sub')]
            ])
        });
    }
    mainMenu(ctx);
});

// --- ACTIONS ---
bot.action('check_sub', async (ctx) => {
    const isSub = await checkSubscription(ctx);
    if (isSub) {
        const user = getUser(ctx.from.id);
        if (user && user.invitedBy) {
            const inviter = db.get('users').find({ id: user.invitedBy }).value();
            if (inviter) {
                db.get('users').find({ id: inviter.id }).assign({ limit: inviter.limit + 5, refCount: inviter.refCount + 1 }).write();
                ctx.telegram.sendMessage(inviter.id, `🎉 <b>+5 Limit!</b> Seseorang join via referral Anda.`, { parse_mode: 'HTML' }).catch(() => {});
            }
            db.get('users').find({ id: ctx.from.id }).assign({ invitedBy: null }).write();
        }
        await ctx.deleteMessage().catch(() => {});
        mainMenu(ctx);
    } else {
        await ctx.answerCbQuery("❌ Join dulu semua channel!", { show_alert: true });
    }
});

bot.action('get_stok', async (ctx) => {
    const stocks = db.get('stocks').value();
    if (!stocks) return ctx.answerCbQuery("❌ Stok Kosong!", { show_alert: true });
    
    const tempFile = `stok_${ctx.from.id}.txt`;
    fs.writeFileSync(tempFile, stocks);
    await ctx.replyWithDocument({ source: tempFile, filename: 'STOK_WHATSAPP.txt' });
    fs.unlinkSync(tempFile);
});

bot.action('get_otp', async (ctx) => {
    const user = getUser(ctx.from.id);
    if (user.limit <= 0) return ctx.answerCbQuery("❌ Limit Habis!", { show_alert: true });
    
    await ctx.reply("💬 <b>Masukkan nomor WhatsApp:</b>\n<i>Contoh: +62858xxxx</i>", { parse_mode: 'HTML' });
    
    bot.on('text', async (msgCtx) => {
        if (msgCtx.from.id !== ctx.from.id) return;
        const phone = msgCtx.message.text;
        const msg = await msgCtx.reply(`⏳ <b>Sedang memproses OTP untuk ${phone}...</b>`, { parse_mode: 'HTML' });
        
        setTimeout(async () => {
            const otp = Math.floor(100000 + Math.random() * 900000);
            db.get('users').find({ id: ctx.from.id }).assign({ limit: user.limit - 1 }).write();
            
            await ctx.telegram.editMessageText(msgCtx.chat.id, msg.message_id, null, 
                `✅ <b>OTP BERHASIL!</b>\n\nNomor: <code>${phone}</code>\nOTP: <code>${otp}</code>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('📋 SALIN OTP', `copy_${otp}`)]])
            });
        }, 30000);
    }, { once: true });
});

bot.action(/copy_(.*)/, (ctx) => {
    ctx.answerCbQuery(`OTP ${ctx.match[1]} Berhasil Disalin!`, { show_alert: false });
});

bot.action('refeal', (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`🔗 <b>LINK REFERRAL</b>\n\n<code>${link}</code>\n\nDapatkan <b>5 Limit</b> setiap teman yang join!`, { parse_mode: 'HTML' });
});

// --- OWNER MENU ---
bot.action('owner_info', (ctx) => {
    if (ctx.from.id !== config.ownerId) return ctx.answerCbQuery("Akses Ditolak!", { show_alert: true });
    const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('➕ ADD STOK', 'add_stok'), Markup.button.callback('🗑️ HAPUS STOK', 'del_stok')],
        [Markup.button.callback('➕ ADD LIMIT', 'add_limit'), Markup.button.callback('📢 BROADCAST', 'bc')]
    ]);
    ctx.reply("👑 <b>OWNER PANEL</b>", { parse_mode: 'HTML', ...buttons });
});

bot.action('add_stok', (ctx) => {
    ctx.reply("📂 <b>Kirimkan file .txt stok Anda:</b>", { parse_mode: 'HTML' });
    bot.on('document', async (dCtx) => {
        if (dCtx.from.id !== config.ownerId) return;
        try {
            const fileLink = await dCtx.telegram.getFileLink(dCtx.message.document.file_id);
            const response = await axios.get(fileLink.href);
            db.set('stocks', response.data).write(); // DISIMPAN UTUH DI SINI
            dCtx.reply("✅ <b>Stok berhasil disimpan secara utuh!</b>", { parse_mode: 'HTML' });
        } catch (e) { dCtx.reply("❌ Gagal membaca file."); }
    }, { once: true });
});

bot.action('del_stok', (ctx) => {
    db.set('stocks', "").write();
    ctx.answerCbQuery("Stok dihapus!", { show_alert: true });
});

bot.action('add_limit', (ctx) => {
    ctx.reply("✍️ Jumlah limit untuk SEMUA user:");
    bot.on('text', (tCtx) => {
        if (tCtx.from.id !== config.ownerId) return;
        const amt = parseInt(tCtx.message.text);
        if (isNaN(amt)) return;
        db.get('users').value().forEach(u => {
            db.get('users').find({ id: u.id }).assign({ limit: (u.limit || 0) + amt }).write();
        });
        tCtx.reply(`✅ Berhasil tambah ${amt} limit ke semua user.`);
    }, { once: true });
});

bot.action('bc', (ctx) => {
    ctx.reply("✍️ Masukkan pesan broadcast:");
    bot.on('text', (tCtx) => {
        if (tCtx.from.id !== config.ownerId) return;
        db.get('users').value().forEach(u => {
            bot.telegram.sendMessage(u.id, tCtx.message.text, { parse_mode: 'HTML' }).catch(() => {});
        });
        tCtx.reply("✅ Broadcast terkirim!");
    }, { once: true });
});

bot.launch().then(() => console.log("Bot Running..."));