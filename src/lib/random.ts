// Hermes has no Web Crypto. The SSH client's crypto (@noble) draws randomness from
// crypto.getRandomValues, so provide it from the platform's secure generator.
import { getRandomValues } from 'expo-crypto';

const globalCrypto = (globalThis as { crypto?: Partial<Crypto> }).crypto;
if (typeof globalCrypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalCrypto, getRandomValues },
    configurable: true,
  });
}
