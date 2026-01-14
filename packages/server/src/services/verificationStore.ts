interface StoredCode {
  code: string;
  expiresAt: number;
}

// In-memory store for verification codes
const codeStore = new Map<string, StoredCode>();

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeCode(email: string, code: string): void {
  const normalizedEmail = email.toLowerCase();
  codeStore.set(normalizedEmail, {
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
  });
}

export function verifyCode(email: string, code: string): boolean {
  const normalizedEmail = email.toLowerCase();
  const stored = codeStore.get(normalizedEmail);

  if (!stored) {
    return false;
  }

  // Check if expired
  if (Date.now() > stored.expiresAt) {
    codeStore.delete(normalizedEmail);
    return false;
  }

  // Check if code matches
  if (stored.code !== code) {
    return false;
  }

  // Code is valid - remove it (one-time use)
  codeStore.delete(normalizedEmail);
  return true;
}

// Cleanup expired codes periodically (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [email, stored] of codeStore.entries()) {
    if (now > stored.expiresAt) {
      codeStore.delete(email);
    }
  }
}, 60 * 1000);
