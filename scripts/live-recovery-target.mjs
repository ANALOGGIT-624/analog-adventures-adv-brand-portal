export const LIVE_RECOVERY_URL = 'https://analog-portal-live-recovery-app-20261014.onrender.com';
export function assertLiveRecoveryTarget(env) {
const db = new URL(env.DATABASE_URL || 'https://invalid');
if (env.SHOPIFY_APP_URL !== LIVE_RECOVERY_URL ||
    env.PORTAL_DATA_BACKEND !== 'postgresql' ||
    db.hostname !== 'dpg-db7qsbjbc2fs738613s0-a' ||
    db.pathname !== '/analog_portal_live_recovery_20261014' ||
    db.username !== 'recovery_reader_20261014' ||
    db.searchParams.get('sslmode') !== 'require' ||
    db.searchParams.get('schema') !== 'recovery_app' ||
    env.ARTWORK_R2_BUCKET !== 'analog-portal-live-recovery-20261014') {
  throw new Error('Recovery target configuration refused');
}
}
