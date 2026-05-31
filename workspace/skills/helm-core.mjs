// helm-core skill — Helm operational status and metadata

export const description = 'Get Helm core status: uptime, model, permission mode, version';

export async function execute(args = '') {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const status = {
    status: 'online',
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    model: process.env.MODEL || 'sonnet',
    permission_mode: process.env.PERMISSION_MODE || 'bypassPermissions',
    auth_mode: process.env.AUTH_MODE || 'subscription',
    node_version: process.version,
  };

  return JSON.stringify(status, null, 2);
}
