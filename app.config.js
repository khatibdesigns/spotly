// Dynamic Expo config so the Google iOS URL scheme can be injected from .env.
// Replaces app.json. Google sign-in stays inert until a real REVERSED_CLIENT_ID
// is set in EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME (and the Google client IDs in .env).
const googleIosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.PLACEHOLDER';

export default {
  expo: {
    name: 'Spotly',
    slug: 'spotly',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'spotly',
    userInterfaceStyle: 'light',
    backgroundColor: '#fcfaf6',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.khd.spotly',
      buildNumber: '36',
      usesAppleSignIn: true,
      googleServicesFile: './GoogleService-Info.plist', // Firebase (FCM + Analytics)
      // Universal Links — tapping https://meetspotly.com/join?code=… opens the
      // app (family invites). Requires the AASA file hosted at that domain.
      associatedDomains: ['applinks:meetspotly.com'],
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Allow the cleartext-HTTP call to the EC2 Claude proxy (AI planner).
        // Same exception the Caption app uses. Move to HTTPS before launch.
        NSAppTransportSecurity: {
          NSExceptionDomains: {
            '16.16.79.251': {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: false,
            },
          },
        },
      },
    },
    android: {
      package: 'com.khd.spotly',
      versionCode: 36,
      googleServicesFile: './google-services.json', // Firebase (FCM + Analytics)
      // Allow the cleartext-HTTP call to the EC2 Claude proxy (AI planner).
      usesCleartextTraffic: true,
      // App Links — tapping https://meetspotly.com/join?code=… opens the app
      // (family invites). autoVerify uses the hosted assetlinks.json.
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: 'meetspotly.com', pathPrefix: '/join' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      config: {
        googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY },
      },
      adaptiveIcon: {
        backgroundColor: '#fa7959',
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-font',
      'expo-apple-authentication',
      '@react-native-firebase/app', // FCM + Analytics native config
      ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Spotly uses your location to show kid-friendly places near you.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Spotly needs access to your photos so you can add family memories.',
          cameraPermission: 'Spotly needs camera access so you can take photos for memories and profiles.',
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission: 'Spotly adds your plans and bookings to your calendar.',
        },
      ],
      [
        'expo-build-properties',
        {
          // Allow cleartext HTTP in release builds (EC2 Claude proxy / AI planner).
          android: { usesCleartextTraffic: true },
          // @react-native-firebase needs static frameworks on iOS.
          ios: { useFrameworks: 'static' },
        },
      ],
      'expo-notifications',
    ],
  },
};
