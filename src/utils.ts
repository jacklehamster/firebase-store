import XXH from 'xxhashjs';

export function hashString(input: string): string {
  return XXH.h64(input, 0xABCD).toString(16); // 64-bit hash in hex
}
