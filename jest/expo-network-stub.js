// expo-network needs its native module. In Jest the phone is on Wi-Fi until a test changes
// it with setNetworkState (src/test-utils/fake-network.ts), which tells every listener.
const NetworkStateType = {
  NONE: 'NONE',
  UNKNOWN: 'UNKNOWN',
  CELLULAR: 'CELLULAR',
  WIFI: 'WIFI',
  BLUETOOTH: 'BLUETOOTH',
  ETHERNET: 'ETHERNET',
  WIMAX: 'WIMAX',
  VPN: 'VPN',
  OTHER: 'OTHER',
};

const WIFI = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
let state = WIFI;
const listeners = new Set();

module.exports = {
  NetworkStateType,
  getNetworkStateAsync: async () => state,
  addNetworkStateListener(listener) {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
  setNetworkState(next) {
    state = next;
    listeners.forEach((listener) => listener(next));
  },
  resetNetworkState() {
    state = WIFI;
  },
};
