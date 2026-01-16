export const PROVIDERS = {
  GOOGLE: 'google.com',
  FACEBOOK: 'facebook.com',
  MICROSOFT: 'microsoft.com',
  APPLE: 'apple.com',
  PASSWORD: 'password',
} as const;

export type ProviderId = typeof PROVIDERS[keyof typeof PROVIDERS];
