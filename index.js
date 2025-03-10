process.on('uncaughtException', console.error)
import path from 'path';
import { spawn } from 'child_process';
import { watchFile, unwatchFile } from 'fs';

import treeKill from './lib/tree-kill.js';

let activeProcess = null;

function start(file) {
	if (activeProcess) {
		treeKill(activeProcess.pid, 'SIGTERM', err => {
			if (err) {
				console.error('Error stopping process:', err);
			} else {
				console.log('Process stopped.');
				activeProcess = null;
				start(file);
			}
		});
	} else {
		console.log('Starting . . .');
		let args = [path.join(process.cwd(), file), ...process.argv.slice(2)];
		let p = spawn(process.argv[0], args, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
			.on('message', data => {
				console.log('[RECEIVED]', data);
				switch (data) {
					case 'reset':
						start(file);
						break;
					case 'uptime':
						p.send(process.uptime());
						break;
				}
			})
			.on('exit', code => {
				console.error('Exited with code:', code);
				if (Number(code) && code === 0) return;
				watchFile(args[0], () => {
					unwatchFile(args[0]);
					start(file);
				});
			});

		activeProcess = p;
	}
}

start('wilykun.js');

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
