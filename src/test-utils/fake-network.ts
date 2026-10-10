import * as ExpoNetwork from 'expo-network';
import type { NetworkState } from 'expo-network';

/**
 * Drives expo-network's Jest stub (jest/expo-network-stub.js): the phone starts on Wi-Fi.
 *
 *   await act(() => setNetwork('NONE'));
 */
type Stub = { setNetworkState(state: NetworkState): void; resetNetworkState(): void };

const stub = ExpoNetwork as unknown as Stub;

export function setNetwork(type: 'NONE' | 'WIFI' | 'CELLULAR') {
  stub.setNetworkState({
    type: type as NetworkState['type'],
    isConnected: type !== 'NONE',
    isInternetReachable: type !== 'NONE',
  });
}

export const resetNetwork = () => stub.resetNetworkState();
