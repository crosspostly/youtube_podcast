import { safeLower } from './utils/safeLower';
export function safeLower(val: unknown): string {
  return String(val ?? '').toLowerCase();
}
