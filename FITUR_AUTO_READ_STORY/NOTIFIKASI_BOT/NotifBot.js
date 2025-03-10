import { jidNormalizedUser } from 'baileys';

export async function sendBotNotification(wilykun) {
    const targetNumber = '6289667923162@s.whatsapp.net';
    await wilykun.sendMessage(jidNormalizedUser(targetNumber), { text: `${wilykun.user?.name} telah Terhubung...` });
}
