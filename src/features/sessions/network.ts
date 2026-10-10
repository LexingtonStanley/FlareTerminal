import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType } from 'expo-network';
import type { NetworkState } from 'expo-network';

/** The phone's network, as sessions care about it. */
export type Network = {
  /** False only when there's surely no network; an unknown kind counts as online. */
  online: boolean;
  /** Wi-Fi, cellular, ethernet…: a change means connections over the old one are gone. */
  kind: string;
};

function toNetwork({ type }: NetworkState): Network {
  return { online: type !== NetworkStateType.NONE, kind: type ?? NetworkStateType.UNKNOWN };
}

/**
 * Calls `listener` with the network now, then whenever it changes (on the web, when the
 * browser goes on or offline). Returns a function that stops listening.
 */
export function watchNetwork(listener: (network: Network) => void): () => void {
  let stopped = false;
  // A change can arrive before the first reading, which is then out of date.
  let changed = false;
  const subscription = addNetworkStateListener((state) => {
    changed = true;
    listener(toNetwork(state));
  });
  getNetworkStateAsync().then(
    (state) => {
      if (!stopped && !changed) listener(toNetwork(state));
    },
    // Unknown: sessions behave as before, on timers alone.
    () => {}
  );
  return () => {
    stopped = true;
    subscription.remove();
  };
}
