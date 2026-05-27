// Simple in-memory rate limiter for edge runtime
// Each worker instance has its own store; not shared across instances

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();

  // Lazy cleanup: remove expired entry for this key
  const existing = store.get(key);
  if (existing && existing.resetAt < now) {
    store.delete(key);
  }

  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxAttempts) {
    return false;
  }

  entry.count++;
  return true;
}
