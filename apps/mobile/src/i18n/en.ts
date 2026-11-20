/** English strings. Telugu (te.ts) must provide every key. */
export const en = {
  common: {
    appName: 'Mana Village',
    retry: 'Try again',
    loading: 'Loading…',
    save: 'Save',
    cancel: 'Cancel',
    continue: 'Continue',
    pleaseWait: 'Please wait…',
  },
  language: { label: 'Language', te: 'తెలుగు', en: 'English' },
  login: {
    title: 'Sign in',
    subtitle: 'Report and follow village problems. We will send a code to your mobile number.',
    phoneLabel: 'Mobile number',
    phonePlaceholder: '98765 43210',
    sendCode: 'Send code',
    invalidPhone: 'Enter a valid 10-digit mobile number.',
  },
  otp: {
    title: 'Enter code',
    sentTo: 'We sent a 6-digit code to {phone}.',
    codeLabel: '6-digit code',
    verify: 'Verify',
    resend: 'Resend code',
    resent: 'A new code has been sent.',
    changeNumber: 'Change number',
    invalidCode: 'Enter the 6-digit code.',
    wrongCode: 'The code is wrong or expired.',
  },
  profileSetup: {
    title: 'Your details',
    subtitle:
      'Only Panchayat staff can see your name and number. Other residents see "A resident".',
    nameLabel: 'Full name',
    villageLabel: 'Your village',
    noVillages: 'No villages are available yet. Please try again later.',
    submit: 'Save and continue',
    nameRequired: 'Enter your name (at least 2 letters).',
    villageRequired: 'Choose your village.',
  },
  tabs: { home: 'Home', myIssues: 'My Issues', notifications: 'Alerts', profile: 'Profile' },
  home: {
    greeting: 'Namaste, {name}',
    village: 'Village: {village}',
    reportTitle: 'Report a problem',
    reportComingSoon: 'Reporting issues with photos is coming in the next update.',
  },
  myIssues: {
    emptyTitle: 'No issues yet',
    emptyBody: 'Problems you report will appear here with their progress.',
  },
  notifications: {
    emptyTitle: 'No alerts',
    emptyBody: 'You will be told here when your issues are updated.',
  },
  profile: {
    title: 'Profile',
    phone: 'Mobile number',
    village: 'Village',
    changeVillage: 'Change village',
    villageChanged: 'Village changed.',
    editName: 'Name',
    saved: 'Saved.',
    signOut: 'Sign out',
    privacy: 'Your phone number is never shown to other residents.',
  },
  suspended: {
    title: 'Account suspended',
    body: 'Your account has been suspended by the Panchayat. Please contact the Panchayat office.',
  },
  config: {
    title: 'App not configured',
    body: 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
  },
  errors: {
    NETWORK: 'No internet connection. Check your network and try again.',
    AUTH_REQUIRED: 'Please sign in again.',
    FORBIDDEN: 'You are not allowed to do this.',
    NOT_FOUND: 'Not found.',
    VALIDATION: 'Please check the details you entered.',
    INVALID_TRANSITION: 'This action is no longer possible. Refresh and try again.',
    CONFLICT: 'Someone else changed this. Refresh and try again.',
    RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
    UPLOAD_FAILED: 'The photo could not be uploaded. Try again.',
    UNKNOWN: 'Something went wrong. Please try again.',
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Strings = Widen<typeof en>;
