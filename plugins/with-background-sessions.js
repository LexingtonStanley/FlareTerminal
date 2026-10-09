// Keeps SSH sessions connected while the app is in the background on Android, through
// react-native-background-actions' foreground service (the "sessions connected"
// notification). Android 14+ requires a foreground service type. "specialUse" fits a
// terminal and, unlike "dataSync", has no daily time limit; Google Play asks for the
// reason given in the subtype property.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  // HeadlessJsTaskService holds a wake lock while the task runs.
  'android.permission.WAKE_LOCK',
];
const SUBTYPE =
  'Keeps the SSH terminal sessions the user opened connected while the app is in the background, so programs they are running keep reporting to them.';

module.exports = function withBackgroundSessions(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.service = (application.service ?? []).filter(
      (service) => service.$['android:name'] !== SERVICE
    );
    application.service.push({
      $: {
        'android:name': SERVICE,
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': SUBTYPE,
          },
        },
      ],
    });
    return config;
  });
};
