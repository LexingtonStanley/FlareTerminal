import type { AgentBackend } from './agent';
import { equalBytes } from './bytes';
import { describeKeyRequest, type KeyRequest } from './key-request';
import { loadKey, publicHalf, savedKeys } from './keys';
import { trustedHostWith } from './known-hosts';

/**
 * The agent a connection forwards (its "Forward SSH agent" setting): it lists every one of
 * the person's keys, the app's first, and signs with one only once `ask` says the person
 * allowed it. The private key is read from the vault then, for that one signature.
 */
export function forwardedAgent(
  ask: (request: KeyRequest, signal: AbortSignal) => Promise<boolean>
): AgentBackend {
  return {
    keys: () => savedKeys().map(publicHalf),
    async approve(request, signal) {
      const key = savedKeys().find((saved) => equalBytes(publicHalf(saved).blob, request.key));
      if (!key) return null;
      const allowed = await ask(describeKeyRequest(request, key, trustedHostWith), signal);
      return allowed && !signal.aborted ? loadKey(key.id) : null;
    },
  };
}
