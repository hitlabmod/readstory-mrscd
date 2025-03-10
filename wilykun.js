import 'dotenv/config';

import makeWASocket, {
	delay,
	useMultiFileAuthState,
	fetchLatestBaileysVersion,
	makeInMemoryStore,
	jidNormalizedUser,
	DisconnectReason,
	Browsers,
	makeCacheableSignalKeyStore,
} from 'baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';

import treeKill from './lib/tree-kill.js';
import serialize, { Client } from './lib/serialize.js';
import { formatSize, parseFileSize, sendTelegram } from './lib/function.js';
import handleStatusMessages from './FITUR_AUTO_READ_STORY/CodeAutoReadStory.js';
import config from './config.js';
import { sendBotNotification } from './FITUR_AUTO_READ_STORY/NOTIFIKASI_BOT/NotifBot.js';

const logger = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` }).child({ class: 'wilykun' });
logger.level = 'fatal';

const usePairingCode = process.env.PAIRING_NUMBER;
const store = makeInMemoryStore({ logger });

if (process.env.WRITE_STORE === 'true') store.readFromFile(`./${process.env.SESSION_NAME}/store.json`);

// check available file
const pathContacts = `./${process.env.SESSION_NAME}/contacts.json`;
const pathMetadata = `./${process.env.SESSION_NAME}/groupMetadata.json`;

const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState(`./${process.env.SESSION_NAME}`);
	const { version, isLatest } = await fetchLatestBaileysVersion();

	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

	/**
	 * @type {import('baileys').WASocket}
	 */
	const wilykun = makeWASocket.default({
		version,
		logger,
		printQRInTerminal: !usePairingCode,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		browser: Browsers.ubuntu('Chrome'),
		markOnlineOnConnect: config.autoOnline,
		generateHighQualityLinkPreview: true,
		syncFullHistory: true,
		retryRequestDelayMs: 10,
		transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 10 },
		defaultQueryTimeoutMs: undefined,
		maxMsgRetryCount: 15,
		appStateMacVerification: {
			patch: true,
			snapshot: true,
		},
		getMessage: async key => {
			const jid = jidNormalizedUser(key.remoteJid);
			const msg = await store.loadMessage(jid, key.id);

			return msg?.message || '';
		},
		shouldSyncHistoryMessage: msg => {
			console.log(`\x1b[32mMemuat Chat [${msg.progress}%]\x1b[39m`);
			return !!msg.syncType;
		},
	});

	store.bind(wilykun.ev);
	await Client({ wilykun, store });

	// login dengan pairing
	if (usePairingCode && !wilykun.authState.creds.registered) {
		try {
			let phoneNumber = usePairingCode.replace(/[^0-9]/g, '');

			await delay(3000);
			let code = await wilykun.requestPairingCode(phoneNumber);
			console.log(`\x1b[32m${code?.match(/.{1,4}/g)?.join('-') || code}\x1b[39m`);
		} catch {
			console.error('Gagal mendapatkan kode pairing');
			process.exit(1);
		}
	}

	// ngewei info, restart or close
	wilykun.ev.on('connection.update', async update => {
		const { lastDisconnect, connection } = update;
		if (connection) {
			console.info(`Status Koneksi : ${connection === 'connecting' ? 'menghubungkan' : connection === 'open' ? 'terbuka' : connection}`);
		}

		if (connection === 'close') {
			let reason = new Boom(lastDisconnect?.error)?.output.statusCode;

			switch (reason) {
				case DisconnectReason.multideviceMismatch:
				case DisconnectReason.loggedOut:
				case 403:
					console.error(lastDisconnect.error?.message);
					await wilykun.logout();
					fs.rmSync(`./${process.env.SESSION_NAME}`, { recursive: true, force: true });
					exec('npm run stop:pm2', err => {
						if (err) return treeKill(process.pid);
					});
					break;
				default:
					console.error(lastDisconnect.error?.message);
					await startSock();
			}
		}

		if (connection === 'open') {
			await sendBotNotification(wilykun);
			if (!config.autoOnline) {
				await wilykun.sendPresenceUpdate('unavailable');
			}
		}
	});

	// Auto Typing and Auto Record
	wilykun.ev.on('messages.upsert', async ({ messages }) => {
		if (messages.length > 0) {
			const m = messages[0];
			if (config.autoTyping) {
				await wilykun.sendPresenceUpdate('composing', m.key.remoteJid);
			}
			if (config.autoRecord) {
				await wilykun.sendPresenceUpdate('recording', m.key.remoteJid);
			}
		}
	});

	// write session kang
	wilykun.ev.on('creds.update', saveCreds);

	// contacts
	if (fs.existsSync(pathContacts)) {
		store.contacts = JSON.parse(fs.readFileSync(pathContacts, 'utf-8'));
	} else {
		fs.writeFileSync(pathContacts, JSON.stringify({}));
	}
	// group metadata
	if (fs.existsSync(pathMetadata)) {
		store.groupMetadata = JSON.parse(fs.readFileSync(pathMetadata, 'utf-8'));
	} else {
		fs.writeFileSync(pathMetadata, JSON.stringify({}));
	}

	// add contacts update to store
	wilykun.ev.on('contacts.update', update => {
		for (let contact of update) {
			let id = jidNormalizedUser(contact.id);
			if (store && store.contacts) store.contacts[id] = { ...(store.contacts?.[id] || {}), ...(contact || {}) };
		}
	});

	// add contacts upsert to store
	wilykun.ev.on('contacts.upsert', update => {
		for (let contact of update) {
			let id = jidNormalizedUser(contact.id);
			if (store && store.contacts) store.contacts[id] = { ...(contact || {}), isContact: true };
		}
	});

	// nambah perubahan grup ke store
	wilykun.ev.on('groups.update', updates => {
		for (const update of updates) {
			const id = update.id;
			if (store.groupMetadata[id]) {
				store.groupMetadata[id] = { ...(store.groupMetadata[id] || {}), ...(update || {}) };
			}
		}
	});

	// merubah status member
	wilykun.ev.on('group-participants.update', ({ id, participants, action }) => {
		const metadata = store.groupMetadata[id];
		if (metadata) {
			switch (action) {
				case 'add':
				case 'revoked_membership_requests':
					metadata.participants.push(...participants.map(id => ({ id: jidNormalizedUser(id), admin: null })));
					break;
				case 'demote':
				case 'promote':
					for (const participant of metadata.participants) {
						let id = jidNormalizedUser(participant.id);
						if (participants.includes(id)) {
							participant.admin = action === 'promote' ? 'admin' : null;
						}
					}
					break;
				case 'remove':
					metadata.participants = metadata.participants.filter(p => !participants.includes(jidNormalizedUser(p.id)));
					break;
			}
		}
	});

	// bagian pepmbaca status ono ng kene
	handleStatusMessages(wilykun, store);

	setInterval(async () => {
		// write contacts and metadata
		if (store.groupMetadata) fs.writeFileSync(pathMetadata, JSON.stringify(store.groupMetadata));
		if (store.contacts) fs.writeFileSync(pathContacts, JSON.stringify(store.contacts));

		// write store
		if (process.env.WRITE_STORE === 'true') store.writeToFile(`./${process.env.SESSION_NAME}/store.json`);

		// untuk auto restart ketika RAM sisa 300MB
		const memoryUsage = os.totalmem() - os.freemem();

		if (memoryUsage > os.totalmem() - parseFileSize(process.env.AUTO_RESTART, false)) {
			await wilykun.sendMessage(
				jidNormalizedUser(wilykun.user.id),
				{ text: `penggunaan RAM mencapai *${formatSize(memoryUsage)}* waktunya merestart...` },
				{ ephemeralExpiration: 24 * 60 * 60 * 1000 }
			);
			exec('npm run restart:pm2', err => {
				if (err) return process.send('reset');
			});
		}
	}, 10 * 1000); // tiap 10 detik

	process.on('uncaughtException', console.error);
	process.on('unhandledRejection', console.error);
};

startSock();

if (process.env.HANDLE_ERRORS === 'true') {
	process.on('uncaughtException', function (err) {
		let e = String(err);
		if (e.includes("Socket connection timeout")) return;
		if (e.includes("item-not-found")) return;
		if (e.includes("rate-overlimit")) return;
		if (e.includes("Connection Closed")) return;
		if (e.includes("Timed Out")) return;
		if (e.includes("Value not found")) return;
		if (e.includes("Failed to decrypt message with any known session") || e.includes("Bad MAC")) return;
		if (e.includes("Closing open session in favor of incoming prekey bundle")) return;
		if (e.includes("Closing session: SessionEntry")) return;
		console.log('Caught exception: ', err);
	});

	process.on('unhandledRejection', function (reason, promise) {
		let e = String(reason);
		if (e.includes("Socket connection timeout")) return;
		if (e.includes("item-not-found")) return;
		if (e.includes("rate-overlimit")) return;
		if (e.includes("Connection Closed")) return;
		if (e.includes("Timed Out")) return;
		if (e.includes("Value not found")) return;
		if (e.includes("Failed to decrypt message with any known session") || e.includes("Bad MAC")) return;
		if (e.includes("Closing open session in favor of incoming prekey bundle")) return;
		if (e.includes("Closing session: SessionEntry")) return;
		console.error('Unhandled rejection at:', promise, 'reason:', reason);
	});
}
