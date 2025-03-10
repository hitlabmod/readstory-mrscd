import serialize from '../lib/serialize.js';
import { jidNormalizedUser } from 'baileys';
import { sendTelegram } from '../lib/function.js';
import { logWithColor } from './warna.js';

export default async function handleStatusMessages(wilykun, store) {
    wilykun.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages[0].message) return;
        let m = await serialize(wilykun, messages[0], store);

        // nambah semua metadata ke store
        if (store.groupMetadata && Object.keys(store.groupMetadata).length === 0) store.groupMetadata = await wilykun.groupFetchAllParticipating();

        // untuk membaca pesan status
        if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
            if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;
            await wilykun.readMessages([m.key]);
            let id = m.key.participant;
            let name = wilykun.getName(id);

            logWithColor(`Melihat status dari: ${name} (${id.split('@')[0]})`);

            // react status
            const emojis = process.env.REACT_STATUS.split(',')
                .map(e => e.trim())
                .filter(Boolean);

            if (emojis.length) {
                await wilykun.sendMessage(
                    'status@broadcast',
                    {
                        react: { key: m.key, text: emojis[Math.floor(Math.random() * emojis.length)] },
                    },
                    {
                        statusJidList: [jidNormalizedUser(wilykun.user.id), jidNormalizedUser(id)],
                    }
                );
            }

            if (process.env.TELEGRAM_TOKEN && process.env.ID_TELEGRAM) {
                const caption = m.body ? m.body : 'tidak ada';
                const message = `DARI : ${name}\nNOMER : https://wa.me/${id.split('@')[0]}\nCAPTION : ${caption}`;
                
                if (m.isMedia) {
                    let media = await wilykun.downloadMediaMessage(m);
                    await sendTelegram(process.env.ID_TELEGRAM, media, { type: /audio/.test(m.msg.mimetype) ? 'document' : '', caption: message });
                } else {
                    await sendTelegram(process.env.ID_TELEGRAM, message);
                }
            }
        }
    });
}
