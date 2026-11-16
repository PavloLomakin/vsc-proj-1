# Google sign-in and cloud progress

The game continues to save progress locally without an account. Google sign-in
adds a private cloud copy that follows the signed-in account across devices.

## Firebase setup

1. Create a Firebase project and register a **Web app** in Project settings.
2. In **Authentication → Sign-in method**, enable **Google**. Add the deployed
   website domain and `localhost` to **Authorized domains**. For the GitHub
   Pages site, add `pavlolomakin.github.io`.
3. Create a **Cloud Firestore** database. In its **Rules** tab, publish the
   rules from [`firestore.rules`](./firestore.rules). They allow a signed-in
   user to read and write only their own progress document.
4. Copy [`.env.example`](./.env.example) to `.env.local`. It contains this
   project's Firebase Web app config; replace it if you use a different
   Firebase project. The Firebase web config is public app configuration, not
   an admin credential; never put a Firebase service account key in the app.
5. Restart the Expo server after changing `.env.local`.

The web version uses Firebase's Google popup flow. For native builds, also
create Android and iOS apps in the same Firebase project, download
`google-services.json` and `GoogleService-Info.plist`, and set the
`googleServicesFile` paths under the `android` and `ios` keys in `app.json`.
Add the OAuth client ID for a **Web application** to
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. A native development build
is required; Google Sign-In does not run in Expo Go. Rebuild the app after
adding native Firebase files or changing the app config.

For example, add these paths to the existing platform settings:

```json
{
  "android": {
    "googleServicesFile": "./google-services.json"
  },
  "ios": {
    "googleServicesFile": "./GoogleService-Info.plist"
  }
}
```

## Progress migration

The first Google account used on a device receives the existing local progress.
After that, local guest progress is not copied into another account. Each
account also has a separate local cache, and each completed game updates the
cloud copy when signed in.

If Firestore is unavailable, the game keeps saving locally and displays a sync
error instead of silently claiming the cloud save succeeded.
