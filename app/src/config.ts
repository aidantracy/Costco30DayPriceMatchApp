/**
 * Backend address, set at build time with EXPO_PUBLIC_API_URL (see app/.env.example).
 * Expo inlines EXPO_PUBLIC_* variables into the bundle, so never put secrets in them.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
