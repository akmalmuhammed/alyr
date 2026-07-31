import { useMemo } from "react";

import type { AuthFailure } from "@/auth/types";
import type { FieldErrors } from "@/auth/validation";
import type { LanguageCode } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";

const english = {
  common: {
    back: "Back",
    dismiss: "Dismiss",
    continue: "Continue",
    showPassword: "Show password",
    hidePassword: "Hide password",
    useAnotherAccount: "Use another account",
    item: "item",
    items: "items",
    place: "Place",
    places: "Places",
    space: "space",
    spaces: "spaces",
    current: "Current",
    previous: "Previous",
    onDevice: "On this device",
    previewSession: "Private preview · this session only.",
    encryptedDevice: "Saved inside the encrypted on-device workspace."
  },
  activationProgress: {
    label: "Account activation",
    stages: {
      verifyAccount: "Verify account",
      privateRecord: "Private record",
      firstPassport: "First Passport"
    }
  },
  welcome: {
    createWorkspace: "Create private workspace",
    preparingSample: "Preparing sample…",
    exploreSample: "Explore sample",
    signIn: "Sign in",
    eyebrow: "PRIVATE HOUSEHOLD RECORD",
    title: "Know what you own. Know exactly where it is.",
    body: "Keep important items, places and proof connected in one household record you can actually use.",
    commandEyebrow: "ONE PRIVATE RECORD",
    commandOne: "Record the things that matter",
    commandTwo: "Place each one precisely",
    commandThree: "Keep the proof beside the item",
    sampleImageLabel: "Illustrative item in a private record",
    readyToRetrieve: "Ready to retrieve",
    previewNotice:
      "Private preview · records stay on this device for this session. No email is sent. Use non-sensitive information.",
    unavailableNotice: "This signed build has no account service configuration. The household vault opens after that connection is installed.",
    accountNotice: "Your account protects access. Family access is added deliberately after your private record exists.",
    languageAction: "العربية",
    languageHint: "Switch the interface to Arabic"
  },
  signIn: {
    submit: "Sign in",
    google: "Continue with Google",
    googleHint: "Opens Google's secure sign-in in your browser",
    orEmail: "OR USE EMAIL",
    createAccount: "Create an account",
    eyebrow: "WELCOME BACK",
    title: "Return to your record.",
    body: "Use the account that owns or can access your household record.",
    previewNotice: "Preview accounts exist only for this session. Account details stay on this device.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    password: "Password",
    passwordPlaceholder: "Your password",
    forgotPassword: "Forgot password?"
  },
  authErrors: {
    account_exists: "An account already uses this email.",
    confirmation_required: "Confirm this email before signing in.",
    invalid_credentials: "The email or password is not correct.",
    invalid_request: "Check the request and try again.",
    network_unavailable:
      "Heldat could not reach the account service. Check your connection.",
    pilot_access_denied:
      "This early access invitation does not match the email, has expired, or was already used.",
    pilot_access_required:
      "Enter the early access code from your invitation.",
    pilot_capacity_reached:
      "The current early access group is full. Ask the Heldat team about the next opening.",
    rate_limited: "Too many attempts. Wait a moment, then try again.",
    session_missing: "This account session is no longer available. Start again.",
    unsupported: "This account action is not available in this build.",
    unexpected: "The account service did not complete this request."
  },
  forgotPassword: {
    eyebrow: "ACCOUNT RECOVERY",
    title: "Reset your password.",
    body: "Enter the email for your Heldat account. We will send the next step without revealing whether an account exists.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    submit: "Send reset instructions",
    sentEyebrow: "REQUEST RECORDED",
    sentTitle: "If an account matches, use the latest reset message.",
    sentBody: "The provider accepted the request. Heldat does not reveal whether the address matched an account or whether a message arrived.",
    previewSentEyebrow: "PREVIEW RECOVERY",
    previewSentTitle: "Continue on this device.",
    previewBody: "Private preview does not send email. Continue on this device.",
    requestAccepted: "RESET REQUEST",
    previewRequestReady: "PREVIEW REQUEST",
    destinationNote: "This is the address you entered—not proof that an account exists.",
    openPreviewReset: "Set a new preview password",
    backToSignIn: "Back to sign in",
    differentEmail: "Use a different email",
    sendAgain: "Request again"
  },
  resetPassword: {
    eyebrow: "SECURE YOUR ACCOUNT",
    title: "Choose a new password.",
    body: "Use a password that is unique to Heldat. Your existing household record stays unchanged.",
    password: "New password",
    passwordDescription: "At least 10 characters. Password managers are supported.",
    passwordPlaceholder: "Create a strong password",
    confirmPassword: "Confirm new password",
    confirmPasswordPlaceholder: "Enter it again",
    submit: "Update password",
    checking: "Checking the recovery session",
    ending: "Closing this recovery session securely",
    incomplete: "Open the latest password reset link, or request a new one from sign in.",
    previewIncomplete: "Start password recovery in this preview before choosing a new password.",
    previewNotice: "This preview changes only the account held for this session.",
    completeTitle: "Password updated.",
    completeBody: "Use your new password the next time you sign in.",
    previewCompleteTitle: "Preview password updated.",
    previewCompleteBody: "This password works only for the current preview session.",
    completeStatus: "ACCOUNT ACCESS",
    previewCompleteStatus: "PREVIEW ACCOUNT",
    completeValue: "New password active",
    completeDetail: "The account provider accepted the update.",
    previewCompleteDetail: "Stored in this running preview only.",
    backToSignIn: "Return to sign in"
  },
  createAccount: {
    submit: "Create account",
    signedSubmit: "Verify access and create account",
    existingAccount: "I already have an account",
    eyebrow: "CREATE YOUR ACCOUNT",
    title: "Create your private account.",
    body: "Your private record starts with you. Share access later, one person at a time.",
    previewNotice: "This private preview keeps the account on this device for the session. No email is sent.",
    pilotNotice:
      "Heldat is in limited early access. We verify your email and access code before creating an account.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    pilotAccessCode: "Early access code",
    pilotAccessDescription:
      "Use the code included with your invitation.",
    pilotAccessPlaceholder: "Heldat-XXXX-XXXX-XXXX",
    password: "Password",
    passwordDescription: "At least 10 characters. Password managers are supported.",
    passwordPlaceholder: "Create a strong password",
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "Enter it again",
    legalAcknowledgement:
      "By creating an account, you agree to the early access terms and acknowledge the privacy notice.",
    privacyNotice: "Privacy notice",
    pilotTerms: "Early access terms"
  },
  confirmEmail: {
    continuePreview: "Open private preview",
    confirmed: "Check confirmation",
    differentEmail: "Use a different email",
    requestAgain: "Send a new confirmation link",
    previewBody:
      "Explore the private-record experience without creating or verifying an account. Preview details stay on this device for this session.",
    liveBody:
      "Open the secure link sent to your email. When you return to Heldat, we’ll check automatically.",
    previewEyebrow: "PRIVATE PREVIEW",
    liveEyebrow: "ACCOUNT SECURITY",
    previewTitle: "See how your private record works.",
    liveTitle: "Confirm it’s you.",
    testEmail: "PREVIEW EMAIL",
    deliveryAccepted: "CONFIRMATION EMAIL",
    previewNotice:
      "Preview details are temporary and clear when this session ends.",
    liveNotice:
      "For your security, use the newest confirmation link. Keep this screen open; Heldat will continue automatically when you return.",
    foregroundChecking:
      "Welcome back. Checking your email confirmation…",
    notConfirmedYet:
      "Your email is not confirmed yet. Use the newest link, then return here or check again.",
    resendAccepted:
      "A new confirmation link was requested. Use the newest email, then return to Heldat.",
    dismissStatus: "Got it"
  },
  callback: {
    returnToConfirmation: "Return to confirmation",
    retry: "Retry confirmation",
    retryInvite: "Retry household invitation",
    requestNewLink: "Request a new confirmation email",
    signInToResend: "Sign in to resend confirmation",
    signIn: "Sign in instead",
    resend: "Resend confirmation email",
    recover: "Recover account access",
    continue: "Continue to Heldat",
    otherOptions: "Other account access options",
    body: "Heldat is asking the account provider for a verified session. Nothing is marked complete until that session is returned.",
    failedBody: "The account provider did not return a verified session. Your household record is unchanged.",
    eyebrow: "ACCOUNT VERIFICATION",
    confirmedTitle: "Email confirmed.",
    checkingTitle: "Checking the confirmation link.",
    failedTitle: "Confirmation needs another try.",
    oauthConfirmedTitle: "Google account connected.",
    oauthCheckingTitle: "Finishing Google sign-in.",
    oauthFailedTitle: "Google sign-in needs another try.",
    oauthReturn: "Return to sign in",
    oauthBody:
      "Heldat is completing the protected account exchange. Your browser credentials never enter the app.",
    oauthFailedNotice:
      "Return to sign in and start a fresh Google session. Your household record is unchanged.",
    oauthComplete:
      "Google sign-in is complete. Continue to your private record.",
    inviteFailedTitle: "Email confirmed. Invitation needs another try.",
    checkingLabel: "Checking confirmation",
    waiting: "Waiting for a verified account session.",
    incompleteLink:
      "This confirmation link is incomplete. Return to Heldat and request a new one.",
    exchangeFailed:
      "This confirmation link did not return a verified account session.",
    failedNotice:
      "Retry this link, request a new confirmation email, or choose another account access path below.",
    inviteFailedBody:
      "Your verified account session is ready, but Heldat did not finish joining the household.",
    inviteFailedNotice:
      "Retry the household invitation, sign in instead, or use the account recovery options below.",
    complete:
      "A verified session was returned. Continue to your household record."
  },
  household: {
    eyebrow: "PRIVATE RECORD",
    title: "Create your private record.",
    body: "We suggested a name so you can start now. You can rename it at any time.",
    label: "Record name",
    defaultName: "My record",
    placeholder: "e.g. Family home",
    createAction: "Create private record",
    retryAccess: "Retry account access",
    ownerFact: "You are the only person with access until you deliberately invite someone.",
    setupMethodLabel: "Choose how to start the household record"
  },
  privacy: {
    addFirstPlace: "Add my first place",
    addFirstItem: "Add my first item",
    eyebrow: "QUICK PASSPORT",
    title: "Make one thing findable.",
    body: "An important item is selected. Choose a Place instead if that is where you want to begin.",
    chooseFirst: "Choose your first Passport",
    itemLabel: "Important item",
    itemDescription: "A watch, document, artwork, vehicle or another possession.",
    placeLabel: "Place or property",
    placeDescription: "A home, apartment, plot, office or storage location.",
    privateTitle: "Private by default",
    privateText: "Records begin private to this household.",
    locationTitle: "Location by intent",
    locationText: "Location is requested only when you choose to place something.",
    accessTitle: "Access is deliberate",
    accessText: "Family access is granted later, one role at a time.",
    previewNotice: "This test account and its records reset when the running preview ends. Use test photos, places and documents.",
    liveNotice: "The device record is created first. Cloud protection is shown as active only after a confirmed sync."
  },
  today: {
    title: "Today",
    openVault: "Open Vault",
    sampleMode: "SAMPLE WORKSPACE",
    personalMode: "PERSONAL WORKSPACE",
    portfolio: "PORTFOLIO",
    recordedValues: "recorded values",
    viewPortfolio: "Open portfolio",
    portfolioHint:
      "Opens recorded values, coverage and item-level history",
    viewPlaces: "View places",
    viewAllPlaces: "View all places",
    locationOverview: "LOCATION OVERVIEW",
    mappedPlaces: "Your confirmed Places",
    noMappedPlaces: "No confirmed Places yet",
    seeAll: "See all",
    viewAllItems: "View all Items",
    addFirstPlace: "Add your first Place",
    placesSection: "Places",
    itemsSection: "Recent items",
    demoHousehold: "Demo household",
    privateRegister: "Private register",
    sampleNextEyebrow: "MAKE IT YOURS",
    sampleNextTitle: "Start your private record",
    sampleNextBody:
      "Sample entries stay out of it. Begin with your own first Place and item.",
    startHere: "START HERE",
    emptyTitle: "Add one record you would hate to lose track of",
    emptyDetail: "Start with an item, owned property or liability. Save what you know and complete the visible gaps later.",
    addFirstItem: "Add first record",
    registerReady: "REGISTER READY",
    readyTitle: "Your core records are ready",
    readyDetail: "Your items, owned properties and liabilities have the current details needed to find and review them.",
    addAnotherItem: "Add another record",
    nextToProtect: "NEXT TO PROTECT",
    reviewNext: "Review the next item",
    reviewNextDetail: "Complete the next visible gap in this Passport.",
    reviewPassport: "Review Passport",
    noValues: "No values recorded yet",
    totalUnavailable: "total unavailable",
    needsAttention: "Needs attention",
    currenciesSeparate: "currencies stay separate",
    registerReadiness: "Register readiness",
    registerMapEmpty: "Your map begins with a Place",
    registerMapSuffix: "in your register",
    addPlaceDetail: "Add a home, apartment, plot or storage location",
    confirmedPins: "confirmed pins",
    needsConfirmation: "need confirmation",
    atlasHint: "Opens the globe overview and complete Place list",
    openAtlas: "Open Atlas",
    valueCoverage: "have a recorded value",
    locationGap: "Finish the location for",
    locationGapDetail: "Make it retrievable without relying on memory.",
    reviewLocation: "Review location",
    proofGap: "Add proof to",
    proofGapDetail: "Attach a receipt, appraisal, certificate or useful document.",
    addProof: "Add proof",
    photoGap: "Add a photo of",
    photoGapDetail: "A clear image makes the Passport faster to recognise.",
    addPhoto: "Add photo",
    identityGap: "Complete",
    identityGapDetail: "Add the missing identity details.",
    propertyPinGap: "Confirm the property pin for",
    propertyPinGapDetail:
      "Place this owned property precisely so its location is not inferred.",
    confirmPropertyPin: "Confirm property pin",
    liabilityBalanceGap: "Add the current balance for",
    liabilityBalanceGapDetail:
      "A liability stays incomplete until it has a dated balance you entered.",
    liabilityBalanceStale: "Review the balance for",
    liabilityBalanceStaleDetail:
      "The last recorded balance reached its review date.",
    reviewBalance: "Review balance",
    liabilityReviewGap: "Review your liability statement",
    liabilityReviewExpiredDetail:
      "Your earlier confirmation of no liabilities reached its review date.",
    liabilityReviewChangedDetail:
      "Liability activity changed after your earlier confirmation.",
    reviewLiabilities: "Review liabilities",
    recordedValueStale: "Review the recorded value for",
    recordedValueStaleDetail:
      "This optional value is still shown, but its recorded date is now old.",
    reviewRecordedValue: "Review value"
  },
  items: {
    title: "Assets",
    intro: "Browse your possessions, or switch to Places to see where they belong.",
    addItem: "Add an item",
    itemsTab: "Items",
    placesTab: "Places",
    yourPlaces: "Your places",
    addPlace: "Add place",
    locationConfirmed: "Location confirmed",
    pinAdjusted: "Pin adjusted by you",
    pinNeedsReview: "Pin needs review",
    addPlaceTitle: "Add a place you recognise",
    addPlaceBody: "A home, apartment, plot or storage location gives every item a reliable retrieval path.",
    addFirstPlace: "Add first Place",
    all: "All",
    needsLocation: "Needs location",
    needsProof: "Needs proof",
    needsValue: "Needs value",
    reviewProof: "Review proof",
    archived: "Archived",
    startTitle: "Start with one important item",
    startBody: "Save what you know now. Missing photos, proof and locations stay visible for later.",
    addFirstItem: "Add first item",
    noArchived: "No archived items",
    noItems: "No items in this view",
    noArchivedBody: "Archived Passports remain here until you restore them.",
    noItemsBody: "Choose another filter to return to the active register.",
    clearFilter: "Clear filter",
    gps: "Device GPS"
  },
  search: {
    title: "Search",
    intro: "Find items, places and spaces by name or retrieval clue.",
    label: "Search items, places and spaces",
    placeholder: "Try “study”, “watch” or “West Bay”",
    clear: "Clear search",
    glance: "Items at a glance",
    noActive: "No active items",
    nothing: "Nothing to search yet",
    archivedBody: "Archived Passports remain searchable by name, Place, room or retrieval clue.",
    nothingBody: "Your first saved item will appear here and remain searchable by its retrieval path.",
    noResults: "No results",
    noMatch: "No match for",
    noMatchBody: "Try an item, category, place, room or retrieval clue."
  },
  stack: {
    assetPassport: "Passport",
    evidence: "Evidence",
    updatePassport: "Update Passport",
    recordedValue: "Recorded value",
    place: "Place",
    propertyPin: "Property pin",
    editPlace: "Edit Place",
    placeSpace: "Place space",
    portfolio: "Portfolio",
    settings: "Settings",
    atlas: "Atlas",
    createRecoveryKit: "Create Recovery Kit",
    restoreRecoveryKit: "Restore Recovery Kit"
  },
  assetValue: {
    notFound: "Item not found",
    notFoundBody: "This item is not available in the current household.",
    discardTitle: "Discard this recorded value?",
    discardBody: "Your changes have not been saved to the private workspace.",
    keepEditing: "Keep editing",
    discard: "Discard changes",
    update: "Update recorded value",
    record: "Record value",
    updateHint: "Adds a new dated record and keeps the previous entries in history.",
    recordHint: "Adds this dated value to the private workspace.",
    passport: "ITEM PASSPORT",
    recordTitle: "Record an item value",
    intro: "Enter a value you know. Heldat keeps currencies separate and never fills in a price for you.",
    valueLabel: "RECORDED VALUE",
    currentEntry: "Current entry",
    asOf: "as of",
    noValue: "No value has been recorded for this item.",
    amount: "Amount",
    amountPlaceholder: "e.g. 12500.00",
    currency: "Currency",
    chooseCurrency: "choose one below",
    commonCurrencies: "Common currencies",
    otherCurrency: "Other currency",
    otherCurrencyHint: "Enter another three-letter currency code",
    other: "Other",
    isoDescription: "Use a three-letter ISO code, such as EUR or JPY.",
    date: "As-of date",
    day: "Day",
    month: "Month",
    year: "Year",
    datePreview: "Readable date",
    validDate: "enter a valid date",
    meaningTitle: "What this number means",
    meaningBody: "This is your dated item-value record. It is not a live market quote, formal appraisal or net worth. Liabilities, taxes, selling costs and currency conversion are excluded.",
    history: "Value history",
    historyBody: "Updating creates a new entry. Earlier records remain visible.",
    invalidDate: "Use a valid date in YYYY-MM-DD format.",
    futureDate: "The as-of date cannot be in the future.",
    currencyError: "Use exactly three letters, such as QAR.",
    amountHintStart: "Enter the amount in",
    amountHintEnd: "without a symbol or grouping commas."
  },
  family: {
    title: "Family",
    intro: "Review who can see and maintain your private register.",
    householdEyebrow: "YOUR HOUSEHOLD",
    peopleSection: "People",
    invited: "Invited",
    owner: "Owner",
    ownerDescription:
      "Controls the household, members, records and exports.",
    editor: "Editor",
    editorDescription: "Adds and maintains Places, items and proof.",
    viewer: "Viewer",
    viewerDescription:
      "Can read the shared register without changing it.",
    noticeTitle: "Session-only invitations",
    noticeBody:
      "Invitation codes work only in this test session and create no cloud membership."
  },
  vault: {
    title: "Vault",
    intro:
      "Proof, device protection, independent recovery and data portability.",
    settingsTitle: "Settings",
    settingsIntro:
      "Account, household, language, support and sync diagnostics.",
    settingsMeta:
      "Account, household, language, support and sync diagnostics.",
    settingsControls: "Account and app controls",
    settingsOpen: "Open",
    documentCurrent: "Current",
    privacySupport: "Privacy and support",
    privacyNotice: "Privacy notice",
    privacyNoticeDescription:
      "What Heldat stores and how household records are handled.",
    pilotTerms: "Early access terms",
    pilotTermsDescription:
      "Terms, responsibilities and service limits.",
    support: "Support",
    supportDescription:
      "Report an issue without exposing household data.",
    installedAppRequiredTitle: "Installed app required",
    installedAppRequiredBody:
      "A readable export can be shared from an installed native build. It is not an encrypted Recovery Kit.",
    shareDialogTitle: "Export readable Heldat snapshot",
    exportFailedTitle: "Readable copy not exported",
    exportFailedBody:
      "The export file was not created or shared. Your household records are unchanged. Keep Heldat open, then try the export again.",
    exportTryAgain: "Try export again",
    temporaryCopyCleanupTitle: "Temporary copy still on this device",
    temporaryCopyCleanupBody:
      "The readable copy was shared, but Heldat did not confirm removal of its temporary cache file. Keep this device private and clear Heldat’s app cache before handing it to someone else.",
    replaceDemoTitle: "Replace this demo?",
    replaceDemoBody:
      "This creates a new private household on this device. Export anything you need first.",
    cancel: "Cancel",
    createPrivateHousehold: "Create private household",
    signOutIncompleteTitle: "Sign-out not finished",
    signOutIncompleteBody:
      "Your account session is still open. Check the connection, then try again.",
    signOutConfirmTitle: "Sign out or switch account?",
    signOut: "Sign out",
    archiveStatus: "ARCHIVE STATUS",
    archiveSync: "Sync",
    deviceProtection: "DEVICE PROTECTION",
    sessionPreviewUnlockOff: "Session preview · device unlock off",
    deviceUnlockActive: "Device unlock active",
    protectedOnDevice: "Protected on this device",
    previewSessionOnly: "Preview session only",
    previewBypassBody:
      "Expo Go and web do not invoke Face ID or a device passcode. This session resets when it ends, so use test information only.",
    deviceUnlockBody:
      "Heldat asks this device to verify you before releasing the encrypted household vault. Device passcode fallback remains available.",
    protectedBody:
      "Your local register and attachments are stored in the protected app vault.",
    previewBody:
      "This preview resets when the session ends. Use test information only.",
    lockNow: "Lock Heldat now",
    language: "Language",
    english: "English",
    arabic: "العربية",
    languageReady: "English and Arabic are available. The selected language applies to account setup and the core record journey.",
    proofOnDevice: "Proof on this device",
    localProofStorageDescription:
      "Original files currently present on this device. This total is separate from cloud usage.",
    cloudPilotStorage: "Cloud storage",
    cloudPilotAllowance: "Household allowance",
    cloudUsed: "used",
    cloudUsageUnknown: "Usage unknown",
    cloudNotConnected: "Not connected",
    cloudUsageConfirmedDescription:
      "Server-confirmed usage measured on",
    cloudUsageUnknownDescription:
      "No server-confirmed usage total is available. Local proof size is not used as a substitute.",
    cloudNotConnectedDescription:
      "This workspace has no verified cloud storage. The household allowance appears after cloud access is confirmed.",
    cloudAllowanceDescription:
      "The allowance may include retained cloud files and exports, not only originals on this device.",
    recentProof: "Recent proof",
    recentProofIntro: "Newest files across Items and Places.",
    recentProofEmpty:
      "Receipts, appraisals and Place documents appear here after they are attached.",
    recentProofItem: "Item proof",
    recentProofPlace: "Place document",
    recentProofReviewed: "Reviewed",
    recentProofWaiting: "Needs review",
    recentProofOnDevice: "On this device",
    recentProofQueued: "Waiting to sync",
    recentProofSynced: "Cloud acknowledged",
    recentProofOpenHint:
      "Opens metadata, the stored original and review controls.",
    recentProofShowAll: "Show all",
    recentProofShowLess: "Show recent only",
    recentProofReference: "REF",
    recentProofRecord: "RECORD",
    recentProofState: "STATE",
    backupRecovery: "Independent recovery",
    cloudBackup: "Independent disaster backup",
    cloudBackupDescription:
      "Separate from day-to-day sync · keep an independent Recovery Kit",
    notSetUp: "Not set up",
    createRecoveryKit: "Create Recovery Kit",
    createRecoveryKitDescription:
      "Create a portable encrypted copy you control",
    recentRecoveryKits: "Recent local kits",
    recentRecoveryKitsDescription:
      "Encrypted files still inside Heldat on this device. File names, dates and backup state are shown; passphrases and contents stay hidden.",
    recoveryHistoryUnavailable:
      "Recent Recovery Kits could not be read from this device.",
    retryRecoveryHistory: "Try device storage again",
    localKitNeedsCopy: "Save another copy",
    externalCopyConfirmed: "Independent copy confirmed",
    ready: "Ready",
    signedBuildNeeded: "Signed build needed",
    restoreRecoveryKit: "Restore Recovery Kit",
    restoreRecoveryKitDescription:
      "Verify a kit before replacing this local workspace",
    chooseFile: "Choose file",
    dataPortability: "Data portability",
    exportReadable: "Export readable copy",
    exportReadableHint:
      "Shares a readable JSON copy containing private metadata",
    exportReadableMeta: "Private metadata · not encrypted",
    household: "Household",
    householdAccess: "Household access",
    householdAccessPending:
      "Waiting for verified household access before showing names or counts.",
    rolesInvitations: "roles and invitations",
    account: "Account",
    signedIn: "SIGNED IN",
    verifiedAccount: "Verified account",
    signingOut: "Signing out…",
    signOutSwitch: "Sign out or switch account",
    signOutExplanation:
      "Switching accounts starts by signing out. This locks the current account vault on this device; it does not erase the household.",
    sampleWorkspace: "Sample workspace",
    exitSample: "Exit sample",
    exitingSample: "Exiting sample…",
    exitSampleHint:
      "Removes this device-local sample and returns to Welcome.",
    exitSampleMeta:
      "Return to Welcome and remove this sample’s items, Places and files from this device. Signed accounts are not changed.",
    exitSampleConfirmTitle: "Exit this sample?",
    exitSampleConfirmBody:
      "Heldat will remove this sample workspace, its local files and unfinished sample changes from this device, then return to Welcome. This does not sign out, delete or change any account.",
    exitSampleFailedTitle: "Sample reset not finished",
    exitSampleFailedBody:
      "Heldat did not confirm removal of every local sample record. Account data was not touched. Restart Heldat, then try again.",
    advancedDiagnostics: "Advanced diagnostics",
    diagnosticsMeta: "Local queue and sync details",
    deviceQueue: "Device queue",
    waiting: "Waiting",
    upToDate: "Up to date",
    diagnosticWarning:
      "Queue details help diagnose local sync state without changing any record.",
    createMyPrivateHousehold: "Start my personal record"
  }
} as const;

type WidenStrings<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : WidenStrings<T[K]>;
};

const arabic = {
  common: {
    back: "رجوع",
    dismiss: "إخفاء",
    continue: "متابعة",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    useAnotherAccount: "استخدام حساب آخر",
    item: "غرض",
    items: "أغراض",
    place: "مكان",
    places: "أماكن",
    space: "مساحة",
    spaces: "مساحات",
    current: "الحالي",
    previous: "السابق",
    onDevice: "على هذا الجهاز",
    previewSession: "معاينة خاصة · لهذه الجلسة فقط.",
    encryptedDevice: "محفوظ في المساحة المشفّرة على الجهاز."
  },
  activationProgress: {
    label: "تفعيل الحساب",
    stages: {
      verifyAccount: "تأكيد الحساب",
      privateRecord: "السجل الخاص",
      firstPassport: "الجواز الأول"
    }
  },
  welcome: {
    createWorkspace: "أنشئ مساحتك الخاصة",
    preparingSample: "جارٍ تجهيز النموذج…",
    exploreSample: "استكشف نموذجًا",
    signIn: "تسجيل الدخول",
    eyebrow: "سجل منزلي خاص",
    title: "اعرف ما تملك. واعرف مكانه بدقة.",
    body: "اجمع أغراضك المهمة وأماكنها وإثباتاتها في سجل منزلي واحد يسهل الرجوع إليه.",
    commandEyebrow: "سجل خاص واحد",
    commandOne: "وثّق ما يهمك",
    commandTwo: "حدّد مكان كل غرض بدقة",
    commandThree: "احفظ الإثبات مع الغرض",
    sampleImageLabel: "صورة توضيحية لغرض في السجل",
    readyToRetrieve: "جاهز للاسترجاع",
    previewNotice:
      "معاينة خاصة · تبقى السجلات على هذا الجهاز خلال الجلسة. لا يُرسل بريد إلكتروني. استخدم معلومات غير حساسة.",
    unavailableNotice: "هذه النسخة غير مرتبطة بخدمة الحسابات بعد. تفتح خزنة المنزل عند تثبيت الاتصال.",
    accountNotice: "يحمي الحساب الوصول إلى سجلك. ويمكنك منح أفراد الأسرة صلاحيات محددة لاحقًا.",
    languageAction: "English",
    languageHint: "تبديل الواجهة إلى الإنجليزية"
  },
  signIn: {
    submit: "تسجيل الدخول",
    google: "المتابعة باستخدام Google",
    googleHint: "يفتح تسجيل الدخول الآمن من Google في المتصفح",
    orEmail: "أو استخدم البريد الإلكتروني",
    createAccount: "إنشاء حساب",
    eyebrow: "مرحبًا بعودتك",
    title: "عُد إلى سجلك.",
    body: "استخدم الحساب المالك للسجل المنزلي أو المخوّل بالوصول إليه.",
    previewNotice:
      "حسابات المعاينة متاحة لهذه الجلسة فقط. تبقى بيانات الحساب على هذا الجهاز.",
    email: "البريد الإلكتروني",
    emailPlaceholder: "name@example.com",
    password: "كلمة المرور",
    passwordPlaceholder: "كلمة المرور",
    forgotPassword: "هل نسيت كلمة المرور؟"
  },
  authErrors: {
    account_exists: "يوجد حساب يستخدم هذا البريد بالفعل.",
    confirmation_required: "أكّد هذا البريد قبل تسجيل الدخول.",
    invalid_credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    invalid_request: "راجع الطلب وحاول مرة أخرى.",
    network_unavailable:
      "تعذر على Heldat الوصول إلى خدمة الحسابات. تحقق من اتصالك.",
    pilot_access_denied:
      "لا تتطابق دعوة الوصول المبكر مع البريد الإلكتروني، أو انتهت صلاحيتها، أو استُخدمت من قبل.",
    pilot_access_required:
      "أدخل رمز الوصول المبكر من دعوتك.",
    pilot_capacity_reached:
      "اكتملت مجموعة الوصول المبكر الحالية. تواصل مع فريق Heldat لمعرفة موعد الإتاحة التالي.",
    rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
    session_missing: "لم تعد جلسة الحساب متاحة. ابدأ من جديد.",
    unsupported: "إجراء الحساب هذا غير متاح في هذه النسخة.",
    unexpected: "لم تُكمل خدمة الحسابات هذا الطلب."
  },
  forgotPassword: {
    eyebrow: "استعادة الحساب",
    title: "أعد تعيين كلمة المرور.",
    body: "أدخل البريد المرتبط بحساب Heldat. سنرسل الخطوة التالية من دون الكشف عن وجود حساب مطابق.",
    email: "البريد الإلكتروني",
    emailPlaceholder: "name@example.com",
    submit: "إرسال تعليمات التعيين",
    sentEyebrow: "تم تسجيل الطلب",
    sentTitle: "إذا وُجد حساب مطابق، فاستخدم أحدث رسالة لإعادة التعيين.",
    sentBody: "قبل مزوّد الحساب الطلب. لا يكشف Heldat ما إذا كان العنوان يطابق حسابًا أو ما إذا وصلت رسالة.",
    previewSentEyebrow: "استعادة المعاينة",
    previewSentTitle: "تابع على هذا الجهاز.",
    previewBody:
      "لا ترسل المعاينة الخاصة بريدًا إلكترونيًا. تابع على هذا الجهاز.",
    requestAccepted: "طلب إعادة التعيين",
    previewRequestReady: "طلب معاينة",
    destinationNote: "هذا هو العنوان الذي أدخلته، وليس دليلًا على وجود حساب.",
    openPreviewReset: "تعيين كلمة مرور للمعاينة",
    backToSignIn: "العودة إلى تسجيل الدخول",
    differentEmail: "استخدام بريد إلكتروني آخر",
    sendAgain: "طلب مرة أخرى"
  },
  resetPassword: {
    eyebrow: "تأمين الحساب",
    title: "اختر كلمة مرور جديدة.",
    body: "استخدم كلمة مرور مخصصة لـ Heldat. سيبقى سجل منزلك الحالي من دون تغيير.",
    password: "كلمة المرور الجديدة",
    passwordDescription: "10 أحرف على الأقل. يدعم التطبيق برامج إدارة كلمات المرور.",
    passwordPlaceholder: "أنشئ كلمة مرور قوية",
    confirmPassword: "تأكيد كلمة المرور الجديدة",
    confirmPasswordPlaceholder: "أدخلها مرة أخرى",
    submit: "تحديث كلمة المرور",
    checking: "جارٍ التحقق من جلسة الاستعادة",
    ending: "جارٍ إغلاق جلسة الاستعادة بأمان",
    incomplete: "افتح أحدث رابط لإعادة تعيين كلمة المرور، أو اطلب رابطًا جديدًا من شاشة تسجيل الدخول.",
    previewIncomplete:
      "ابدأ استعادة كلمة المرور في هذه المعاينة قبل اختيار كلمة مرور جديدة.",
    previewNotice:
      "تغيّر هذه المعاينة الحساب المحفوظ لهذه الجلسة فقط.",
    completeTitle: "تم تحديث كلمة المرور.",
    completeBody: "استخدم كلمة المرور الجديدة عند تسجيل الدخول في المرة القادمة.",
    previewCompleteTitle: "تم تحديث كلمة مرور المعاينة.",
    previewCompleteBody:
      "تعمل كلمة المرور خلال جلسة المعاينة الحالية فقط.",
    completeStatus: "الوصول إلى الحساب",
    previewCompleteStatus: "حساب المعاينة",
    completeValue: "كلمة المرور الجديدة مفعّلة",
    completeDetail: "قبل مزوّد الحساب التحديث.",
    previewCompleteDetail: "محفوظة في هذه المعاينة الحالية فقط.",
    backToSignIn: "العودة إلى تسجيل الدخول"
  },
  createAccount: {
    submit: "إنشاء الحساب",
    signedSubmit: "التحقق من الوصول وإنشاء الحساب",
    existingAccount: "لدي حساب بالفعل",
    eyebrow: "إنشاء حسابك",
    title: "أنشئ حسابك الخاص.",
    body:
      "يبدأ سجلك الخاص بك. شارك الوصول لاحقًا مع كل شخص على حدة.",
    previewNotice:
      "تحتفظ هذه المعاينة الخاصة بالحساب على هذا الجهاز خلال الجلسة. لا يُرسل بريد إلكتروني.",
    pilotNotice:
      "Heldat متاح حاليًا ضمن وصول مبكر محدود. نتحقق من البريد ورمز الوصول قبل إنشاء الحساب.",
    email: "البريد الإلكتروني",
    emailPlaceholder: "name@example.com",
    pilotAccessCode: "رمز الوصول المبكر",
    pilotAccessDescription:
      "استخدم الرمز المرفق بدعوتك.",
    pilotAccessPlaceholder: "Heldat-XXXX-XXXX-XXXX",
    password: "كلمة المرور",
    passwordDescription: "10 أحرف على الأقل. يدعم التطبيق برامج إدارة كلمات المرور.",
    passwordPlaceholder: "أنشئ كلمة مرور قوية",
    confirmPassword: "تأكيد كلمة المرور",
    confirmPasswordPlaceholder: "أدخلها مرة أخرى",
    legalAcknowledgement:
      "بإنشاء الحساب، فإنك توافق على شروط الوصول المبكر وتقر بإشعار الخصوصية.",
    privacyNotice: "إشعار الخصوصية",
    pilotTerms: "شروط الوصول المبكر"
  },
  confirmEmail: {
    continuePreview: "فتح المعاينة الخاصة",
    confirmed: "التحقق من التأكيد",
    differentEmail: "استخدام بريد إلكتروني آخر",
    requestAgain: "إرسال رابط تأكيد جديد",
    previewBody:
      "استكشف تجربة السجل الخاص من دون إنشاء حساب أو تأكيده. تبقى بيانات المعاينة على هذا الجهاز خلال هذه الجلسة.",
    liveBody:
      "افتح الرابط الآمن الذي أُرسل إلى بريدك. عند عودتك إلى Heldat، سنتحقق تلقائيًا.",
    previewEyebrow: "معاينة خاصة",
    liveEyebrow: "أمان الحساب",
    previewTitle: "تعرّف على طريقة عمل سجلك الخاص.",
    liveTitle: "أكّد هويتك.",
    testEmail: "بريد المعاينة",
    deliveryAccepted: "رسالة التأكيد",
    previewNotice:
      "بيانات المعاينة مؤقتة وتُحذف عند انتهاء هذه الجلسة.",
    liveNotice:
      "لأمانك، استخدم أحدث رابط تأكيد. اترك هذه الشاشة مفتوحة؛ سيتابع Heldat تلقائيًا عند عودتك.",
    foregroundChecking:
      "مرحبًا بعودتك. جارٍ التحقق من تأكيد بريدك…",
    notConfirmedYet:
      "لم يتم تأكيد بريدك بعد. استخدم أحدث رابط، ثم عُد إلى هنا أو تحقق مرة أخرى.",
    resendAccepted:
      "طُلب رابط تأكيد جديد. استخدم أحدث رسالة، ثم عُد إلى Heldat.",
    dismissStatus: "حسنًا"
  },
  callback: {
    returnToConfirmation: "العودة إلى تأكيد البريد",
    retry: "إعادة محاولة التأكيد",
    retryInvite: "إعادة محاولة دعوة المنزل",
    requestNewLink: "طلب رسالة تأكيد جديدة",
    signInToResend: "سجّل الدخول لإعادة إرسال التأكيد",
    signIn: "تسجيل الدخول بدلاً من ذلك",
    resend: "إعادة إرسال رسالة التأكيد",
    recover: "استعادة الوصول إلى الحساب",
    continue: "المتابعة إلى Heldat",
    otherOptions: "خيارات أخرى للوصول إلى الحساب",
    body: "يطلب Heldat جلسة مؤكدة من مزوّد الحساب. ولا يكتمل أي إجراء قبل استلامها.",
    failedBody: "لم يُرجع مزوّد الحساب جلسة مؤكدة. لم يتغير سجل منزلك.",
    eyebrow: "التحقق من الحساب",
    confirmedTitle: "تم تأكيد البريد الإلكتروني.",
    checkingTitle: "جارٍ التحقق من رابط التأكيد.",
    failedTitle: "يحتاج التأكيد إلى محاولة أخرى.",
    oauthConfirmedTitle: "تم ربط حساب Google.",
    oauthCheckingTitle: "جارٍ إكمال تسجيل الدخول باستخدام Google.",
    oauthFailedTitle: "يحتاج تسجيل الدخول باستخدام Google إلى محاولة أخرى.",
    oauthReturn: "العودة إلى تسجيل الدخول",
    oauthBody:
      "يكمل Heldat تبادل الحساب المحمي. لا تدخل بيانات اعتماد المتصفح إلى التطبيق.",
    oauthFailedNotice:
      "عُد إلى تسجيل الدخول وابدأ جلسة Google جديدة. لم يتغير سجلك الخاص.",
    oauthComplete:
      "اكتمل تسجيل الدخول باستخدام Google. تابع إلى سجلك الخاص.",
    inviteFailedTitle:
      "تم تأكيد البريد. تحتاج دعوة المنزل إلى محاولة أخرى.",
    checkingLabel: "جارٍ التحقق من التأكيد",
    waiting: "في انتظار جلسة حساب مؤكدة.",
    incompleteLink:
      "رابط التأكيد غير مكتمل. عُد إلى Heldat واطلب رابطًا جديدًا.",
    exchangeFailed:
      "لم يُرجع رابط التأكيد هذا جلسة حساب مؤكدة.",
    failedNotice:
      "أعد محاولة هذا الرابط، أو اطلب رسالة تأكيد جديدة، أو اختر مسارًا آخر للوصول إلى الحساب أدناه.",
    inviteFailedBody:
      "جلسة حسابك المؤكدة جاهزة، لكن Heldat لم يُكمل الانضمام إلى المنزل.",
    inviteFailedNotice:
      "أعد محاولة دعوة المنزل، أو سجّل الدخول بدلاً من ذلك، أو استخدم خيارات استعادة الحساب أدناه.",
    complete: "تم استلام جلسة مؤكدة. تابع إلى سجلك المنزلي."
  },
  household: {
    eyebrow: "السجل الخاص",
    title: "أنشئ سجلك الخاص.",
    body: "اقترحنا اسمًا لتبدأ الآن، ويمكنك تغييره في أي وقت.",
    label: "اسم السجل",
    defaultName: "سجلي",
    placeholder: "مثال: منزل العائلة",
    createAction: "إنشاء السجل الخاص",
    retryAccess: "إعادة محاولة الوصول إلى الحساب",
    ownerFact: "أنت الشخص الوحيد الذي يملك صلاحية الوصول حتى تدعو شخصًا عن قصد.",
    setupMethodLabel: "اختر طريقة بدء سجل المنزل"
  },
  privacy: {
    addFirstPlace: "إضافة أول مكان",
    addFirstItem: "إضافة أول غرض",
    eyebrow: "الجواز السريع",
    title: "اجعل شيئًا واحدًا سهل العثور عليه.",
    body: "تم اختيار غرض مهم. اختر مكانًا بدلًا منه إذا أردت أن تبدأ به.",
    chooseFirst: "اختر جوازك الأول",
    itemLabel: "غرض مهم",
    itemDescription: "ساعة أو مستند أو عمل فني أو مركبة أو مقتنى آخر.",
    placeLabel: "مكان أو عقار",
    placeDescription: "منزل أو شقة أو أرض أو مكتب أو مخزن.",
    privateTitle: "خاص افتراضيًا",
    privateText: "يبدأ السجل خاصًا بهذا المنزل.",
    locationTitle: "الموقع عند الحاجة",
    locationText: "لا يُطلب الموقع إلا عندما تختار تحديد مكان غرض.",
    accessTitle: "صلاحيات مقصودة",
    accessText: "تُمنح صلاحيات الأسرة لاحقًا، دورًا واحدًا في كل مرة.",
    previewNotice: "يُصفّر هذا الحساب التجريبي وسجلاته عند انتهاء المعاينة. استخدم صورًا وأماكن ومستندات تجريبية.",
    liveNotice: "يُنشأ سجل الجهاز أولًا، ولا تظهر الحماية السحابية كفعالة إلا بعد مزامنة مؤكدة."
  },
  today: {
    title: "اليوم",
    openVault: "فتح الخزنة",
    sampleMode: "مساحة تجريبية",
    personalMode: "مساحة شخصية",
    portfolio: "المحفظة",
    recordedValues: "قيم مسجلة",
    viewPortfolio: "فتح المحفظة",
    portfolioHint: "يفتح القيم المسجلة والتغطية وسجل كل غرض",
    viewPlaces: "عرض الأماكن",
    viewAllPlaces: "عرض كل الأماكن",
    locationOverview: "نظرة على المواقع",
    mappedPlaces: "الأماكن المؤكدة",
    noMappedPlaces: "لا توجد أماكن مؤكدة بعد",
    seeAll: "عرض الكل",
    viewAllItems: "عرض كل الأغراض",
    addFirstPlace: "إضافة أول مكان",
    placesSection: "الأماكن",
    itemsSection: "أحدث الأغراض",
    demoHousehold: "منزل تجريبي",
    privateRegister: "سجل خاص",
    sampleNextEyebrow: "اجعله سجلك",
    sampleNextTitle: "ابدأ سجلك الخاص",
    sampleNextBody:
      "لن تنتقل السجلات التجريبية إليه. ابدأ بأول مكان وغرض يخصانك.",
    startHere: "ابدأ هنا",
    emptyTitle: "أضف سجلًا واحدًا لا تريد أن تفقد أثره",
    emptyDetail: "ابدأ بغرض أو عقار مملوك أو التزام. احفظ ما تعرفه الآن وأكمل النواقص الظاهرة لاحقًا.",
    addFirstItem: "إضافة أول سجل",
    registerReady: "السجل جاهز",
    readyTitle: "اكتملت السجلات الأساسية",
    readyDetail: "تتضمن أغراضك وعقاراتك المملوكة والتزاماتك التفاصيل الحالية اللازمة للعثور عليها ومراجعتها.",
    addAnotherItem: "إضافة سجل آخر",
    nextToProtect: "التالي للتوثيق",
    reviewNext: "راجع الغرض التالي",
    reviewNextDetail: "أكمل النقص الظاهر التالي في هذا الجواز.",
    reviewPassport: "مراجعة الجواز",
    noValues: "لا توجد قيم مسجلة بعد",
    totalUnavailable: "المجموع غير متاح",
    needsAttention: "يحتاج إلى انتباه",
    currenciesSeparate: "تظل العملات منفصلة",
    registerReadiness: "جاهزية السجل",
    registerMapEmpty: "تبدأ خريطتك بإضافة مكان",
    registerMapSuffix: "في سجلك",
    addPlaceDetail: "أضف منزلًا أو شقة أو أرضًا أو مخزنًا",
    confirmedPins: "دبابيس مؤكدة",
    needsConfirmation: "تحتاج إلى تأكيد",
    atlasHint: "يفتح عرض الكرة الأرضية وقائمة الأماكن الكاملة",
    openAtlas: "فتح الأطلس",
    valueCoverage: "لها قيمة مسجلة",
    locationGap: "أكمل موقع",
    locationGapDetail: "اجعل الوصول إليه ممكنًا من دون الاعتماد على الذاكرة.",
    reviewLocation: "مراجعة الموقع",
    proofGap: "أضف إثباتًا إلى",
    proofGapDetail: "أرفق إيصالًا أو تقييمًا أو شهادة أو مستندًا مفيدًا.",
    addProof: "إضافة إثبات",
    photoGap: "أضف صورة لـ",
    photoGapDetail: "تساعد الصورة الواضحة على تمييز الجواز بسرعة.",
    addPhoto: "إضافة صورة",
    identityGap: "أكمل",
    identityGapDetail: "أضف بيانات الهوية الناقصة.",
    propertyPinGap: "أكّد دبوس العقار لـ",
    propertyPinGapDetail: "حدّد هذا العقار المملوك بدقة حتى لا يُستنتج موقعه.",
    confirmPropertyPin: "تأكيد دبوس العقار",
    liabilityBalanceGap: "أضف الرصيد الحالي لـ",
    liabilityBalanceGapDetail: "يبقى الالتزام غير مكتمل حتى تسجّل له رصيدًا مؤرخًا.",
    liabilityBalanceStale: "راجع رصيد",
    liabilityBalanceStaleDetail: "بلغ آخر رصيد مسجّل موعد مراجعته.",
    reviewBalance: "مراجعة الرصيد",
    liabilityReviewGap: "راجع إقرار الالتزامات",
    liabilityReviewExpiredDetail: "بلغ تأكيدك السابق بعدم وجود التزامات موعد مراجعته.",
    liabilityReviewChangedDetail: "تغيّر نشاط الالتزامات بعد تأكيدك السابق.",
    reviewLiabilities: "مراجعة الالتزامات",
    recordedValueStale: "راجع القيمة المسجّلة لـ",
    recordedValueStaleDetail: "ما زالت هذه القيمة الاختيارية ظاهرة، لكن تاريخ تسجيلها أصبح قديمًا.",
    reviewRecordedValue: "مراجعة القيمة"
  },
  items: {
    title: "الأصول",
    intro: "تصفّح مقتنياتك أو انتقل إلى الأماكن لمعرفة موضع كل غرض.",
    addItem: "إضافة غرض",
    itemsTab: "الأغراض",
    placesTab: "الأماكن",
    yourPlaces: "أماكنك",
    addPlace: "إضافة مكان",
    locationConfirmed: "الموقع مؤكد",
    pinAdjusted: "عدّلت الدبوس بنفسك",
    pinNeedsReview: "يحتاج الدبوس إلى مراجعة",
    addPlaceTitle: "أضف مكانًا تعرفه",
    addPlaceBody: "يمنح المنزل أو الشقة أو الأرض أو المخزن كل غرض مسارًا واضحًا للعثور عليه.",
    addFirstPlace: "إضافة أول مكان",
    all: "الكل",
    needsLocation: "ينقصه الموقع",
    needsProof: "ينقصه الإثبات",
    needsValue: "تنقصه القيمة",
    reviewProof: "مراجعة الإثبات",
    archived: "المؤرشف",
    startTitle: "ابدأ بغرض واحد مهم",
    startBody: "احفظ ما تعرفه الآن، وأكمل الصور والإثباتات والمواقع لاحقًا.",
    addFirstItem: "إضافة أول غرض",
    noArchived: "لا توجد أغراض مؤرشفة",
    noItems: "لا توجد أغراض في هذا العرض",
    noArchivedBody: "تبقى الجوازات المؤرشفة هنا حتى تستعيدها.",
    noItemsBody: "اختر عامل تصفية آخر للعودة إلى السجل النشط.",
    clearFilter: "مسح التصفية",
    gps: "GPS الجهاز"
  },
  search: {
    title: "بحث",
    intro: "ابحث عن الأغراض والأماكن والمساحات بالاسم أو بدليل الوصول.",
    label: "البحث في الأغراض والأماكن والمساحات",
    placeholder: "جرّب «المكتب» أو «الساعة» أو «الخليج الغربي»",
    clear: "مسح البحث",
    glance: "أغراض بنظرة سريعة",
    noActive: "لا توجد أغراض نشطة",
    nothing: "لا يوجد ما تبحث فيه بعد",
    archivedBody: "تبقى الجوازات المؤرشفة قابلة للبحث بالاسم أو المكان أو الغرفة أو دليل الوصول.",
    nothingBody: "سيظهر أول غرض تحفظه هنا، ويمكن البحث عنه بمسار الوصول إليه.",
    noResults: "لا توجد نتائج",
    noMatch: "لا توجد نتيجة لـ",
    noMatchBody: "جرّب اسم غرض أو فئة أو مكان أو غرفة أو دليل وصول."
  },
  stack: {
    assetPassport: "جواز الغرض",
    evidence: "الإثبات",
    updatePassport: "تحديث الجواز",
    recordedValue: "القيمة المسجلة",
    place: "المكان",
    propertyPin: "تحديد موقع العقار",
    editPlace: "تعديل المكان",
    placeSpace: "مساحة داخل المكان",
    portfolio: "المحفظة",
    settings: "الإعدادات",
    atlas: "الأطلس",
    createRecoveryKit: "إنشاء حزمة الاستعادة",
    restoreRecoveryKit: "الاستعادة من حزمة"
  },
  assetValue: {
    notFound: "الغرض غير موجود",
    notFoundBody: "هذا الغرض غير متاح في المنزل الحالي.",
    discardTitle: "تجاهل القيمة المسجلة؟",
    discardBody: "لم تُحفظ تغييراتك في المساحة الخاصة.",
    keepEditing: "متابعة التعديل",
    discard: "تجاهل التغييرات",
    update: "تحديث القيمة المسجلة",
    record: "تسجيل القيمة",
    updateHint: "يضيف سجلًا جديدًا مؤرخًا ويُبقي السجلات السابقة في التاريخ.",
    recordHint: "يضيف هذه القيمة المؤرخة إلى المساحة الخاصة.",
    passport: "جواز الغرض",
    recordTitle: "سجّل قيمة الغرض",
    intro: "أدخل قيمة تعرفها. يحفظ Heldat كل عملة على حدة ولا يقدّر السعر نيابة عنك.",
    valueLabel: "القيمة المسجلة",
    currentEntry: "السجل الحالي",
    asOf: "بتاريخ",
    noValue: "لم تُسجّل قيمة لهذا الغرض.",
    amount: "المبلغ",
    amountPlaceholder: "مثال: ١٢٥٠٠٫٠٠",
    currency: "العملة",
    chooseCurrency: "اختر عملة أدناه",
    commonCurrencies: "العملات الشائعة",
    otherCurrency: "عملة أخرى",
    otherCurrencyHint: "أدخل رمز عملة آخر من ثلاثة أحرف",
    other: "أخرى",
    isoDescription: "استخدم رمز ISO من ثلاثة أحرف، مثل EUR أو JPY.",
    date: "تاريخ القيمة",
    day: "اليوم",
    month: "الشهر",
    year: "السنة",
    datePreview: "التاريخ المقروء",
    validDate: "أدخل تاريخًا صحيحًا",
    meaningTitle: "ماذا يعني هذا الرقم",
    meaningBody: "هذه قيمة دوّنتها للغرض في تاريخ محدد. ليست سعر سوق مباشرًا ولا تقييمًا رسميًا ولا صافي ثروة. لا تشمل الالتزامات أو الضرائب أو تكاليف البيع أو تحويل العملات.",
    history: "سجل القيم",
    historyBody: "ينشئ التحديث سجلًا جديدًا وتبقى السجلات السابقة ظاهرة.",
    invalidDate: "استخدم تاريخًا صحيحًا بصيغة YYYY-MM-DD.",
    futureDate: "لا يمكن أن يكون تاريخ القيمة في المستقبل.",
    currencyError: "استخدم ثلاثة أحرف بالضبط، مثل QAR.",
    amountHintStart: "أدخل المبلغ بعملة",
    amountHintEnd: "من دون رمز العملة أو فواصل الآلاف."
  },
  family: {
    title: "الأسرة",
    intro: "راجع من يمكنه الاطلاع على سجلك الخاص والمحافظة عليه.",
    householdEyebrow: "منزلك",
    peopleSection: "أفراد الأسرة",
    invited: "مدعو",
    owner: "المالك",
    ownerDescription:
      "يتحكم في المنزل وأفراده وسجلاته وعمليات التصدير.",
    editor: "المحرّر",
    editorDescription: "يضيف الأماكن والأغراض والإثباتات ويحافظ عليها.",
    viewer: "المشاهد",
    viewerDescription: "يمكنه قراءة السجل المشترك من دون تغييره.",
    noticeTitle: "دعوات لجلسة الاختبار فقط",
    noticeBody:
      "تعمل رموز الدعوة خلال جلسة الاختبار الحالية فقط ولا تُنشئ عضوية سحابية."
  },
  vault: {
    documentCurrent: "ساري",
    title: "الخزنة",
    intro:
      "الإثباتات وحماية الجهاز والتعافي المستقل ونقل البيانات.",
    settingsTitle: "الإعدادات",
    settingsIntro:
      "الحساب والأسرة واللغة والدعم وتشخيصات المزامنة.",
    settingsMeta:
      "الحساب والأسرة واللغة والدعم وتشخيصات المزامنة.",
    settingsControls: "ضوابط الحساب والتطبيق",
    settingsOpen: "فتح",
    privacySupport: "الخصوصية والدعم",
    privacyNotice: "إشعار الخصوصية",
    privacyNoticeDescription:
      "ما الذي يحفظه Heldat وكيف تُدار السجلات.",
    pilotTerms: "شروط الوصول المبكر",
    pilotTermsDescription:
      "الشروط والمسؤوليات وحدود الخدمة.",
    support: "الدعم",
    supportDescription:
      "الإبلاغ عن مشكلة من دون كشف بيانات المنزل.",
    installedAppRequiredTitle: "يلزم تثبيت التطبيق",
    installedAppRequiredBody:
      "يمكن مشاركة نسخة مقروءة من التطبيق المثبّت. هذه النسخة ليست حزمة استعادة مشفّرة.",
    shareDialogTitle: "تصدير نسخة Heldat المقروءة",
    exportFailedTitle: "لم تُصدَّر النسخة المقروءة",
    exportFailedBody:
      "لم يُنشأ ملف التصدير أو لم تتم مشاركته. لم تتغير سجلات المنزل. أبقِ Heldat مفتوحًا ثم حاول التصدير مرة أخرى.",
    exportTryAgain: "محاولة التصدير مرة أخرى",
    temporaryCopyCleanupTitle: "لا تزال النسخة المؤقتة على هذا الجهاز",
    temporaryCopyCleanupBody:
      "تمت مشاركة النسخة المقروءة، لكن Heldat لم يؤكد إزالة ملفها المؤقت. حافظ على خصوصية هذا الجهاز وامسح ذاكرة التخزين المؤقتة لـ Heldat قبل تسليمه لشخص آخر.",
    replaceDemoTitle: "استبدال هذا النموذج؟",
    replaceDemoBody:
      "سيؤدي ذلك إلى إنشاء منزل خاص جديد على هذا الجهاز. صدّر ما تحتاج إليه أولًا.",
    cancel: "إلغاء",
    createPrivateHousehold: "إنشاء منزل خاص",
    signOutIncompleteTitle: "لم يكتمل تسجيل الخروج",
    signOutIncompleteBody:
      "لا تزال جلسة حسابك مفتوحة. تحقق من الاتصال ثم حاول مرة أخرى.",
    signOutConfirmTitle: "تسجيل الخروج أو تبديل الحساب؟",
    signOut: "تسجيل الخروج",
    archiveStatus: "حالة الأرشيف",
    archiveSync: "المزامنة",
    deviceProtection: "حماية الجهاز",
    sessionPreviewUnlockOff: "معاينة الجلسة · قفل الجهاز غير مفعّل",
    deviceUnlockActive: "قفل الجهاز مفعّل",
    protectedOnDevice: "محمي على هذا الجهاز",
    previewSessionOnly: "جلسة معاينة فقط",
    previewBypassBody:
      "لا تستدعي Expo Go ونسخة الويب بصمة الوجه أو رمز قفل الجهاز. تُصفّر هذه الجلسة عند انتهائها، لذا استخدم بيانات تجريبية فقط.",
    deviceUnlockBody:
      "يتحقق هذا الجهاز من هويتك قبل أن يفتح Heldat الخزنة المنزلية المشفّرة. ويبقى رمز قفل الجهاز خيارًا متاحًا.",
    protectedBody:
      "سجلك المحلي ومرفقاته محفوظان داخل خزنة التطبيق المحمية.",
    previewBody:
      "تُصفّر هذه المعاينة عند انتهاء الجلسة. استخدم بيانات تجريبية فقط.",
    lockNow: "قفل Heldat الآن",
    language: "اللغة",
    english: "English",
    arabic: "العربية",
    languageReady: "الإنجليزية والعربية متاحتان. تُطبّق اللغة المختارة على إعداد الحساب ومسار السجل الأساسي.",
    proofOnDevice: "الإثباتات على هذا الجهاز",
    localProofStorageDescription:
      "هذه هي الملفات الأصلية الموجودة حاليًا على هذا الجهاز. هذا الإجمالي منفصل عن الاستخدام السحابي.",
    cloudPilotStorage: "التخزين السحابي",
    cloudPilotAllowance: "حصة الأسرة",
    cloudUsed: "مستخدمة",
    cloudUsageUnknown: "الاستخدام غير معروف",
    cloudNotConnected: "غير متصل",
    cloudUsageConfirmedDescription:
      "استخدام مؤكد من الخادم بتاريخ",
    cloudUsageUnknownDescription:
      "لا يتوفر إجمالي استخدام مؤكد من الخادم. لا يُستخدم حجم الإثباتات المحلية بديلًا عنه.",
    cloudNotConnectedDescription:
      "لا تتوفر لهذا السجل مساحة تخزين سحابية موثقة. تظهر حصة الأسرة بعد تأكيد الوصول السحابي.",
    cloudAllowanceDescription:
      "قد تشمل الحصة الملفات السحابية وملفات التصدير المحتفظ بها، وليس فقط النسخ الأصلية الموجودة على هذا الجهاز.",
    recentProof: "أحدث الإثباتات",
    recentProofIntro:
      "أحدث الملفات المرتبطة بالأغراض والأماكن، من الأحدث إلى الأقدم.",
    recentProofEmpty:
      "تظهر هنا الإيصالات والتقييمات ومستندات الأماكن بعد إرفاقها.",
    recentProofItem: "إثبات غرض",
    recentProofPlace: "مستند مكان",
    recentProofReviewed: "تمت مراجعته",
    recentProofWaiting: "يحتاج إلى مراجعة",
    recentProofOnDevice: "على هذا الجهاز",
    recentProofQueued: "بانتظار المزامنة",
    recentProofSynced: "تأكيد سحابي",
    recentProofOpenHint:
      "يفتح البيانات الوصفية والنسخة الأصلية المحفوظة وأدوات المراجعة.",
    recentProofShowAll: "عرض الكل",
    recentProofShowLess: "عرض الأحدث فقط",
    recentProofReference: "المرجع",
    recentProofRecord: "السجل",
    recentProofState: "الحالة",
    backupRecovery: "التعافي المستقل",
    cloudBackup: "نسخة مستقلة للتعافي من الكوارث",
    cloudBackupDescription:
      "منفصلة عن المزامنة اليومية · احتفظ بحزمة استعادة مستقلة",
    notSetUp: "غير مُعدّ",
    createRecoveryKit: "إنشاء حزمة استعادة",
    createRecoveryKitDescription:
      "أنشئ نسخة مشفّرة محمولة تتحكم بها",
    recentRecoveryKits: "حزم محلية حديثة",
    recentRecoveryKitsDescription:
      "ملفات مشفّرة ما زالت داخل Heldat على هذا الجهاز. تظهر أسماء الملفات والتواريخ وحالة النسخ فقط؛ وتبقى عبارات المرور والمحتويات مخفية.",
    recoveryHistoryUnavailable:
      "تعذّرت قراءة حزم الاستعادة الحديثة من هذا الجهاز.",
    retryRecoveryHistory: "إعادة محاولة تخزين الجهاز",
    localKitNeedsCopy: "احفظ نسخة أخرى",
    externalCopyConfirmed: "تم تأكيد نسخة مستقلة",
    ready: "جاهزة",
    signedBuildNeeded: "تتطلب نسخة موقّعة",
    restoreRecoveryKit: "الاستعادة من حزمة",
    restoreRecoveryKitDescription:
      "تحقق من الحزمة قبل استبدال المساحة المحلية",
    chooseFile: "اختيار ملف",
    dataPortability: "نقل البيانات",
    exportReadable: "تصدير نسخة مقروءة",
    exportReadableHint:
      "يشارك نسخة JSON مقروءة تحتوي على بيانات وصفية خاصة",
    exportReadableMeta: "بيانات وصفية خاصة · غير مشفّرة",
    household: "المنزل",
    householdAccess: "صلاحيات الأسرة",
    householdAccessPending:
      "بانتظار توثيق صلاحيات الأسرة قبل عرض الأسماء أو الأعداد.",
    rolesInvitations: "الأدوار والدعوات",
    account: "الحساب",
    signedIn: "تم تسجيل الدخول",
    verifiedAccount: "حساب موثّق",
    signingOut: "جارٍ تسجيل الخروج…",
    signOutSwitch: "تسجيل الخروج أو تبديل الحساب",
    signOutExplanation:
      "يبدأ تبديل الحساب بتسجيل الخروج. يؤدي ذلك إلى قفل خزنة الحساب الحالي على هذا الجهاز من دون حذف بيانات المنزل.",
    sampleWorkspace: "المساحة التجريبية",
    exitSample: "إنهاء التجربة",
    exitingSample: "جارٍ إنهاء التجربة…",
    exitSampleHint:
      "يزيل بيانات التجربة المحلية من هذا الجهاز ويعيدك إلى شاشة الترحيب.",
    exitSampleMeta:
      "العودة إلى شاشة الترحيب وإزالة أغراض التجربة وأماكنها وملفاتها من هذا الجهاز. لن تتغير أي حسابات مسجّلة.",
    exitSampleConfirmTitle: "إنهاء هذه التجربة؟",
    exitSampleConfirmBody:
      "سيزيل Heldat مساحة التجربة وملفاتها المحلية والتغييرات غير المكتملة من هذا الجهاز، ثم يعيدك إلى شاشة الترحيب. لن يسجّل الخروج من أي حساب ولن يحذف أي حساب أو يغيّره.",
    exitSampleFailedTitle: "لم تكتمل إعادة ضبط التجربة",
    exitSampleFailedBody:
      "لم يؤكد Heldat إزالة جميع سجلات التجربة المحلية. لم تتأثر بيانات الحساب. أعد تشغيل Heldat ثم حاول مرة أخرى.",
    advancedDiagnostics: "التشخيصات المتقدمة",
    diagnosticsMeta: "تفاصيل قائمة الانتظار والمزامنة المحلية",
    deviceQueue: "قائمة الجهاز",
    waiting: "قيد الانتظار",
    upToDate: "محدّث",
    diagnosticWarning:
      "تساعد تفاصيل قائمة الانتظار على تشخيص حالة المزامنة المحلية من دون تغيير أي سجل.",
    createMyPrivateHousehold: "بدء سجلي الشخصي"
  }
} as const satisfies WidenStrings<typeof english>;

export const CORE_JOURNEY_COPY = { en: english, ar: arabic } as const;

export type CoreJourneyCopy =
  (typeof CORE_JOURNEY_COPY)[LanguageCode];

export function useCoreJourneyCopy() {
  const locale = useLocale();
  return useMemo(
    () => ({
      ...locale,
      copy: CORE_JOURNEY_COPY[locale.language]
    }),
    [locale]
  );
}

export function localeTag(language: LanguageCode): "en-QA" | "ar-QA" {
  return language === "ar" ? "ar-QA" : "en-QA";
}

export function formatLocalizedNumber(
  value: number,
  language: LanguageCode,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeTag(language), options).format(value);
}

export function formatLocalizedPercent(
  value: number,
  language: LanguageCode
): string {
  return new Intl.NumberFormat(localeTag(language), {
    style: "percent",
    maximumFractionDigits: 0
  }).format(value / 100);
}

export function formatLocalizedDate(
  value: string,
  language: LanguageCode,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric"
  }
): string {
  const normalized = value.slice(0, 10);
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? normalized
    : new Intl.DateTimeFormat(localeTag(language), options).format(date);
}

export function localizedWorkspaceError(
  message: string,
  language: LanguageCode,
  context: "open" | "save" = "save"
): string {
  if (language === "en") return message;
  return context === "open"
    ? "تعذّر فتح الخزنة. لم تتم الكتابة فوق أي سجل."
    : "تعذّر حفظ التغيير. بقي سجلك الحالي كما هو.";
}

export function formatStep(
  current: number,
  total: number,
  language: LanguageCode
): string {
  const number = (value: number) => formatLocalizedNumber(value, language);
  return language === "ar"
    ? `الخطوة ${number(current)} من ${number(total)}`
    : `Step ${number(current)} of ${number(total)}`;
}

export function formatActivationProgressValue(
  stageLabel: string,
  position: number,
  total: number,
  language: LanguageCode
): string {
  const current = formatLocalizedNumber(position, language);
  const count = formatLocalizedNumber(total, language);
  return language === "ar"
    ? `${stageLabel}. المرحلة ${current} من ${count} لتفعيل الحساب.`
    : `${stageLabel}. Activation stage ${current} of ${count}.`;
}

export function itemCount(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    if (count === 0) return "لا أغراض";
    if (count === 1) return "غرض واحد";
    if (count === 2) return "غرضان";
    if (count >= 3 && count <= 10) return `${formatted} أغراض`;
    return `${formatted} غرضًا`;
  }
  return `${formatted} ${count === 1 ? "item" : "items"}`;
}

export function placeCount(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    if (count === 0) return "لا أماكن";
    if (count === 1) return "مكان واحد";
    if (count === 2) return "مكانان";
    if (count >= 3 && count <= 10) return `${formatted} أماكن`;
    return `${formatted} مكانًا`;
  }
  return `${formatted} ${count === 1 ? "Place" : "Places"}`;
}

export function todayHouseholdSummary(
  itemTotal: number,
  placeTotal: number,
  language: LanguageCode
): string {
  if (language === "en") {
    const things = `${formatLocalizedNumber(itemTotal, language)} important ${
      itemTotal === 1 ? "thing" : "things"
    }`;
    return `${things} across ${placeCount(placeTotal, language)}.`;
  }

  if (itemTotal === 0 && placeTotal === 0) {
    return "لا توجد أغراض مهمة أو أماكن مسجّلة بعد.";
  }

  const items =
    itemTotal === 0
      ? "لا أغراض مهمة"
      : itemTotal === 1
        ? "غرض مهم واحد"
        : itemTotal === 2
          ? "غرضان مهمان"
          : itemTotal >= 3 && itemTotal <= 10
            ? `${formatLocalizedNumber(itemTotal, language)} أغراض مهمة`
            : `${formatLocalizedNumber(itemTotal, language)} غرضًا مهمًا`;
  const places =
    placeTotal === 0
      ? "لا أماكن مسجّلة"
      : placeTotal === 1
        ? "مكان واحد"
        : placeTotal === 2
          ? "مكانين"
          : placeTotal >= 3 && placeTotal <= 10
            ? `${formatLocalizedNumber(placeTotal, language)} أماكن`
            : `${formatLocalizedNumber(placeTotal, language)} مكانًا`;

  return `${items} في ${places}.`;
}

export function todayPinSummary(
  confirmedPins: number,
  pinsNeedingConfirmation: number,
  language: LanguageCode
): string {
  const confirmed = formatLocalizedNumber(confirmedPins, language);
  const pending = formatLocalizedNumber(
    pinsNeedingConfirmation,
    language
  );

  if (language === "ar") {
    const confirmedCopy =
      confirmedPins === 0
        ? "لا دبابيس مؤكدة"
        : confirmedPins === 1
          ? "دبوس واحد مؤكّد"
          : confirmedPins === 2
            ? "دبوسان مؤكّدان"
            : `${confirmed} دبابيس مؤكدة`;
    const pendingCopy =
      pinsNeedingConfirmation === 0
        ? "لا دبابيس تحتاج إلى تأكيد"
        : pinsNeedingConfirmation === 1
          ? "دبوس واحد يحتاج إلى تأكيد"
          : pinsNeedingConfirmation === 2
            ? "دبوسان يحتاجان إلى تأكيد"
            : `${pending} دبابيس تحتاج إلى تأكيد`;
    return `${confirmedCopy} · ${pendingCopy}`;
  }

  return `${confirmed} ${
    confirmedPins === 1 ? "confirmed pin" : "confirmed pins"
  } · ${pending} ${
    pinsNeedingConfirmation === 1
      ? "needs confirmation"
      : "need confirmation"
  }`;
}

export function spaceCount(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    if (count === 0) return "لا مساحات";
    if (count === 1) return "مساحة واحدة";
    if (count === 2) return "مساحتان";
    if (count >= 3 && count <= 10) return `${formatted} مساحات`;
    return `${formatted} مساحة`;
  }
  return `${formatted} ${count === 1 ? "space" : "spaces"}`;
}

function bidiIsolate(value: string): string {
  return `\u2068${value}\u2069`;
}

export function todayRegionSummary(
  regions: readonly string[],
  language: LanguageCode,
  visibleLimit = 3
): string {
  const normalized = [
    ...new Set(
      regions
        .map((region) => region.trim())
        .filter((region) => region.length > 0)
    )
  ];
  if (normalized.length === 0) {
    return language === "ar"
      ? "لا مناطق مسجّلة"
      : "No regions recorded";
  }

  const visible = normalized
    .slice(0, visibleLimit)
    .map(bidiIsolate)
    .join(language === "ar" ? "، " : ", ");
  const hiddenCount = Math.max(
    normalized.length - visibleLimit,
    0
  );
  const formattedCount = formatLocalizedNumber(
    normalized.length,
    language
  );
  const formattedHidden = formatLocalizedNumber(
    hiddenCount,
    language
  );

  if (language === "ar") {
    const countCopy =
      normalized.length === 1
        ? "منطقة واحدة"
        : normalized.length === 2
          ? "منطقتان"
          : normalized.length >= 3 && normalized.length <= 10
            ? `${formattedCount} مناطق`
            : `${formattedCount} منطقة`;
    const more =
      hiddenCount > 0 ? `، و${formattedHidden} أخرى` : "";
    return `${countCopy} · ${visible}${more}`;
  }

  const countCopy = `${formattedCount} ${
    normalized.length === 1 ? "region" : "regions"
  }`;
  const more = hiddenCount > 0 ? `, +${formattedHidden} more` : "";
  return `${countCopy} · ${visible}${more}`;
}

export function todayPlaceLocationSummary(
  confirmedLocations: number,
  pinsNeedingConfirmation: number,
  placesWithoutPins: number,
  language: LanguageCode
): string {
  if (
    confirmedLocations === 0 &&
    pinsNeedingConfirmation === 0 &&
    placesWithoutPins === 0
  ) {
    return language === "ar"
      ? "لا توجد مواقع للمراجعة"
      : "No Place locations to review";
  }

  const confirmed = formatLocalizedNumber(
    confirmedLocations,
    language
  );
  const pending = formatLocalizedNumber(
    pinsNeedingConfirmation,
    language
  );
  const missing = formatLocalizedNumber(
    placesWithoutPins,
    language
  );

  if (language === "ar") {
    const confirmedCopy =
      confirmedLocations === 0
        ? "لا مواقع مؤكدة"
        : confirmedLocations === 1
          ? "موقع واحد مؤكد"
          : confirmedLocations === 2
            ? "موقعان مؤكدان"
            : confirmedLocations >= 3 &&
                confirmedLocations <= 10
              ? `${confirmed} مواقع مؤكدة`
              : `${confirmed} موقعًا مؤكدًا`;
    const reviewParts: string[] = [];
    if (pinsNeedingConfirmation === 1) {
      reviewParts.push("دبوس واحد يحتاج إلى تأكيد");
    } else if (pinsNeedingConfirmation === 2) {
      reviewParts.push("دبوسان يحتاجان إلى تأكيد");
    } else if (pinsNeedingConfirmation > 2) {
      reviewParts.push(`${pending} دبابيس تحتاج إلى تأكيد`);
    }
    if (placesWithoutPins === 1) {
      reviewParts.push("مكان واحد بلا دبوس");
    } else if (placesWithoutPins === 2) {
      reviewParts.push("مكانان بلا دبوس");
    } else if (placesWithoutPins > 2) {
      reviewParts.push(`${missing} أماكن بلا دبابيس`);
    }
    if (reviewParts.length === 0) {
      reviewParts.push("لا شيء يحتاج إلى مراجعة");
    }
    return [confirmedCopy, ...reviewParts].join(" · ");
  }

  const confirmedCopy = `${confirmed} confirmed ${
    confirmedLocations === 1 ? "location" : "locations"
  }`;
  const reviewParts: string[] = [];
  if (pinsNeedingConfirmation > 0) {
    reviewParts.push(
      `${pending} ${
        pinsNeedingConfirmation === 1 ? "pin needs" : "pins need"
      } confirmation`
    );
  }
  if (placesWithoutPins > 0) {
    reviewParts.push(
      `${missing} ${
        placesWithoutPins === 1 ? "Place" : "Places"
      } without a pin`
    );
  }
  if (reviewParts.length === 0) {
    reviewParts.push("nothing to review");
  }
  return [confirmedCopy, ...reviewParts].join(" · ");
}

export function familyMemberCount(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    if (count === 0) return "لا أفراد";
    if (count === 1) return "فرد واحد";
    if (count === 2) return "فردان";
    if (count >= 3 && count <= 10) return `${formatted} أفراد`;
    return `${formatted} فردًا`;
  }
  return `${formatted} ${count === 1 ? "person" : "people"}`;
}

export function familyMemberSummary(
  total: number,
  active: number,
  language: LanguageCode
): string {
  const activeFormatted = formatLocalizedNumber(active, language);
  if (language === "ar") {
    const activeLabel =
      active === 0
        ? "لا أحد نشط"
        : active === 1
          ? "فرد نشط"
          : active === 2
            ? "فردان نشطان"
            : active >= 3 && active <= 10
              ? `${activeFormatted} أفراد نشطون`
              : `${activeFormatted} فردًا نشطًا`;
    return `${familyMemberCount(total, language)} · ${activeLabel}`;
  }
  return `${familyMemberCount(total, language)} · ${activeFormatted} active`;
}

export function memberAvatarAccessibilityLabel(
  name: string,
  language: LanguageCode
): string {
  const isolatedName = bidiIsolate(name.trim());
  return language === "ar"
    ? `صورة ${isolatedName}`
    : `${isolatedName} avatar`;
}

export function proofFileSummary(
  count: number,
  protectedAtRest: boolean,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    const files =
      count === 0
        ? "لا ملفات إثبات"
        : count === 1
          ? "ملف إثبات واحد"
          : count === 2
            ? "ملفا إثبات"
            : count >= 3 && count <= 10
              ? `${formatted} ملفات إثبات`
              : `${formatted} ملف إثبات`;
    const protection = protectedAtRest
      ? "كل ملف مشفّر عند التخزين."
      : "تبقى ملفات المعاينة خلال هذه الجلسة فقط.";
    return `${files} على هذا الجهاز. ${protection}`;
  }
  const files = `${formatted} ${count === 1 ? "proof file" : "proof files"}`;
  return `${files} on this device. ${
    protectedAtRest
      ? "Each file is protected at rest."
      : "Preview files last only for this session."
  }`;
}

export function householdAccessSummary(
  memberCount: number,
  pendingInviteCount: number,
  language: LanguageCode
): string {
  const members = familyMemberCount(memberCount, language);
  const formattedPending = formatLocalizedNumber(
    pendingInviteCount,
    language
  );
  if (language === "ar") {
    const pending =
      pendingInviteCount === 0
        ? "لا دعوات معلّقة"
        : pendingInviteCount === 1
          ? "دعوة معلّقة واحدة"
          : pendingInviteCount === 2
            ? "دعوتان معلّقتان"
            : pendingInviteCount >= 3 && pendingInviteCount <= 10
              ? `${formattedPending} دعوات معلّقة`
              : `${formattedPending} دعوة معلّقة`;
    return `${members} · ${pending}`;
  }
  return `${members} · ${
    pendingInviteCount === 0
      ? "no pending invitations"
      : `${formattedPending} pending ${
          pendingInviteCount === 1 ? "invitation" : "invitations"
        }`
  }`;
}

export function sampleHouseholdAccessSummary(
  memberCount: number,
  language: LanguageCode
): string {
  const members = familyMemberCount(memberCount, language);
  return language === "ar"
    ? `${members} · نموذج محلي غير مشترك`
    : `${members} · local sample · not shared`;
}

export function pendingUpdateSummary(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "ar") {
    if (count === 0) return "لا تحديثات محلية قيد الانتظار";
    if (count === 1) return "تحديث محلي واحد قيد الانتظار";
    if (count === 2) return "تحديثان محليان قيد الانتظار";
    if (count >= 3 && count <= 10) {
      return `${formatted} تحديثات محلية قيد الانتظار`;
    }
    return `${formatted} تحديثًا محليًا قيد الانتظار`;
  }
  return `${formatted} local ${count === 1 ? "update" : "updates"} waiting`;
}

export function formatByteSize(
  bytes: number,
  language: LanguageCode
): string {
  if (bytes < 1024) {
    return `${formatLocalizedNumber(bytes, language)} ${
      language === "ar" ? "بايت" : "B"
    }`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatLocalizedNumber(Math.round(bytes / 1024), language)} ${
      language === "ar" ? "ك.ب" : "KB"
    }`;
  }
  return `${formatLocalizedNumber(bytes / (1024 * 1024), language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} ${language === "ar" ? "م.ب" : "MB"}`;
}

export function signedAccountExitPrompt(
  email: string,
  householdName: string,
  language: LanguageCode
): string {
  const account = bidiIsolate(email.trim() || (language === "ar" ? "هذا الحساب" : "this account"));
  const household = bidiIsolate(
    householdName.trim() || (language === "ar" ? "هذا المنزل" : "this household")
  );
  return language === "ar"
    ? `سيُخرج Heldat الحساب ${account}، ويقفل «${household}» على هذا الجهاز، ثم يعيدك إلى شاشة الوصول إلى الحساب. تبقى السجلات المحلية والتغييرات المعلّقة في خزنة الحساب المحمية. لا يحذف ذلك بيانات المنزل ولا ينقلها إلى حساب آخر.`
    : `Heldat will sign out ${account}, lock “${household}” on this device, and return to account access. Local records and pending changes remain in this account’s protected vault. This does not delete household data or move it to another account.`;
}

export function portfolioAccessibilityLabel(
  summary: string,
  valuedEntries: number,
  totalEntries: number,
  language: LanguageCode
): string {
  const valued = formatLocalizedNumber(valuedEntries, language);
  const total = formatLocalizedNumber(totalEntries, language);
  return language === "ar"
    ? `المحفظة. ${summary}. ${valued} من ${total} لها قيمة مسجلة.`
    : `Portfolio. ${summary}. ${valued} of ${total} items and properties have a recorded value.`;
}

export function atlasAccessibilityLabel(
  confirmedPins: number,
  pinsNeedingConfirmation: number,
  places: number,
  language: LanguageCode
): string {
  const confirmed = formatLocalizedNumber(confirmedPins, language);
  const pending = formatLocalizedNumber(
    pinsNeedingConfirmation,
    language
  );
  const placeTotal = formatLocalizedNumber(places, language);

  if (language === "ar") {
    const confirmedCopy =
      confirmedPins === 0
        ? "لا توجد دبابيس عقارات مؤكدة"
        : confirmedPins === 1
          ? "دبوس عقار واحد مؤكّد"
          : confirmedPins === 2
            ? "دبوسان مؤكّدان للعقارات"
            : `${confirmed} دبابيس عقارات مؤكدة`;
    const pendingCopy =
      pinsNeedingConfirmation === 0
        ? "لا توجد دبابيس تحتاج إلى تأكيد"
        : pinsNeedingConfirmation === 1
          ? "دبوس واحد يحتاج إلى تأكيد"
          : pinsNeedingConfirmation === 2
            ? "دبوسان يحتاجان إلى تأكيد"
            : `${pending} دبابيس تحتاج إلى تأكيد`;
    const placesCopy =
      places === 0
        ? "لا أماكن مسجّلة"
        : places === 1
          ? "مكان واحد"
          : places === 2
            ? "مكانين"
            : `${placeTotal} أماكن`;
    return `${confirmedCopy}، و${pendingCopy}، ضمن ${placesCopy}.`;
  }
  return `${confirmed} ${
    confirmedPins === 1
      ? "confirmed property pin"
      : "confirmed property pins"
  }, ${pending} ${
    pinsNeedingConfirmation === 1
      ? "pin needs confirmation"
      : "pins need confirmation"
  }, across ${placeTotal} ${places === 1 ? "Place" : "Places"}.`;
}

export function searchResultAnnouncement(
  items: number,
  places: number,
  language: LanguageCode
): string {
  if (items + places === 0) {
    return CORE_JOURNEY_COPY[language].search.noResults;
  }
  return language === "ar"
    ? `${itemCount(items, language)} و${placeCount(places, language)}`
    : `${itemCount(items, language)} and ${placeCount(places, language)}`;
}

const arabicValidation: Readonly<Record<string, string>> = {
  "Enter your email address.": "أدخل بريدك الإلكتروني.",
  "Enter a complete email address, such as name@example.com.":
    "أدخل بريدًا إلكترونيًا كاملًا، مثل name@example.com.",
  "Enter your early access code.":
    "أدخل رمز الوصول المبكر.",
  "Use the full early access code from your invitation.":
    "استخدم رمز الوصول المبكر الكامل الوارد في دعوتك.",
  "Enter your password.": "أدخل كلمة المرور.",
  "Use at least 10 characters.": "استخدم 10 أحرف على الأقل.",
  "Use 128 characters or fewer.": "استخدم 128 حرفًا أو أقل.",
  "Choose a password that does not contain your email name.":
    "اختر كلمة مرور لا تتضمن اسم بريدك الإلكتروني.",
  "Enter the password again.": "أدخل كلمة المرور مرة أخرى.",
  "The passwords do not match.": "كلمتا المرور غير متطابقتين.",
  "Enter a household name.": "أدخل اسم المنزل.",
  "Use at least 2 characters.": "استخدم حرفين على الأقل.",
  "Use 60 characters or fewer.": "استخدم 60 حرفًا أو أقل."
};

export function localizeValidationMessage(
  message: string | null | undefined,
  language: LanguageCode
): string | null | undefined {
  if (!message || language === "en") return message;
  return arabicValidation[message] ?? message;
}

export function localizeFieldErrors(
  errors: FieldErrors,
  language: LanguageCode
): FieldErrors {
  if (language === "en") return errors;
  return Object.fromEntries(
    Object.entries(errors).map(([key, message]) => [
      key,
      localizeValidationMessage(message, language)
    ])
  ) as FieldErrors;
}

export function localizeAuthFailure(
  error: AuthFailure,
  language: LanguageCode
): string {
  return CORE_JOURNEY_COPY[language].authErrors[error.code];
}
