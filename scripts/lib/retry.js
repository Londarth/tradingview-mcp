// scripts/lib/retry.js

export async function retry(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * baseDelay;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}