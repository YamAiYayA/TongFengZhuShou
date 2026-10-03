const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

/**
 * Ensure RNBackgroundActionsTask is a specialUse FGS so Android 14+
 * allows a sticky keepalive service (shows under Xiaomi 后台活动).
 */
function withBackgroundService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Ensure tools namespace for tools:node / tools:replace
    if (!manifest.manifest.$) manifest.manifest.$ = {};
    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const perms = manifest.manifest['uses-permission'];
    const need = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.WAKE_LOCK',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    ];
    for (const name of need) {
      if (!perms.some((p) => p.$?.['android:name'] === name)) {
        perms.push({ $: { 'android:name': name } });
      }
    }

    if (!app.service) app.service = [];
    const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

    // Remove any prior declaration so we fully replace the library default
    app.service = app.service.filter(
      (s) =>
        s.$?.['android:name'] !== serviceName &&
        s.$?.['android:name'] !== '.RNBackgroundActionsTask',
    );

    app.service.push({
      $: {
        'android:name': serviceName,
        'android:foregroundServiceType': 'specialUse',
        'android:exported': 'false',
        'android:stopWithTask': 'false',
        'tools:replace': 'android:foregroundServiceType,android:exported',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value':
              'Keeps hydration reminder scheduling alive for gout water assistant',
          },
        },
      ],
    });

    return config;
  });
}

module.exports = withBackgroundService;
