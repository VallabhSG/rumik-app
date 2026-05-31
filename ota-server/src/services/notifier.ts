import logger from '../logger.js';

const ACTION_EMOJI: Record<string, string> = {
  created: '✅',
  deleted: '🗑️',
  activated: '🔴',
  deactivated: '🟢',
  updated: '✏️',
  promoted: '🏆',
};

export async function notifyAdminChange(
  entityType: string,
  key: string,
  action: string,
  detail?: string,
): Promise<void> {
  const webhookUrl = process.env.SLACK_ADMIN_WEBHOOK_URL;
  if (!webhookUrl) return;

  const emoji = ACTION_EMOJI[action] ?? '🔔';
  const payload: Record<string, unknown> = {
    text: `${emoji} *${entityType}* \`${key}\` — ${action}`,
  };

  if (detail) {
    payload.attachments = [{
      color: action === 'activated' ? 'danger' : 'good',
      text: detail,
      footer: 'rumik-app OTA Admin',
      ts: Math.floor(Date.now() / 1000),
    }];
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.warn({ err }, 'slack admin notification failed');
  }
}
