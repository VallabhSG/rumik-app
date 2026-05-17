import { Redis } from 'ioredis';
import logger from './logger.js';

let _redis: Redis | null = null;
let _subscriber: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (_redis) return _redis;
  _redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });
  _redis.on('error', (err) => logger.warn({ err }, 'Redis connection error'));
  return _redis;
}

export function getRedisSubscriber(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (_subscriber) return _subscriber;
  _subscriber = new Redis(process.env.REDIS_URL, { lazyConnect: true });
  _subscriber.on('error', (err) => logger.warn({ err }, 'Redis subscriber error'));
  return _subscriber;
}

export const KILL_SWITCH_CHANNEL = 'rumik:kill_switch';

export async function closeRedis(): Promise<void> {
  await _redis?.quit().catch(() => {});
  await _subscriber?.quit().catch(() => {});
  _redis = null;
  _subscriber = null;
}
