# Firebase Account Linking: "Link accounts that use the same email"

This document explains the Firebase Console's **"Link accounts that use the same email"** setting and how this application implements a custom account linking strategy to handle multi-provider authentication securely.

---

## Table of Contents

1. [Firebase Console Setting](#firebase-console-setting)
2. [Default Firebase Behavior](#default-firebase-behavior)
3. [The Problem](#the-problem)
4. [Our Solution: Backend-Orchestrated Linking](#our-solution-backend-orchestrated-linking)
5. [Authentication Flow Diagram](#authentication-flow-diagram)
6. [Implementation Details](#implementation-details)
7. [Key Scenarios](#key-scenarios)

---

## Firebase Console Setting

### How to Enable/Disable Account Linking

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication** → **Settings** → **User Actions**
4. Find **"Link accounts that use the same email"**

### Available Options

| Option | Description |
|--------|-------------|
| **Link accounts that use the same email** | When enabled, if a user signs up with a new provider using an email that already exists, Firebase will attempt to link the accounts automatically. |
| **Create multiple accounts for each identity provider** | Each sign-in method creates a separate user account, even if they share the same email. |

> [!IMPORTANT]
> This application is designed to work with **"Link accounts that use the same email"** **enabled**. This allows users to sign in with multiple providers (Google, Facebook, Microsoft) and have them all linked to a single Firebase user account.

---

## Default Firebase Behavior

When **"Link accounts that use the same email"** is enabled, Firebase's default behavior is:

```
┌─────────────────────────────────────┐
│   User signs in with Provider B    │
└──────────────────┬──────────────────┘
                   ▼
          ┌────────────────┐
          │ Does email     │
          │ exist?         │
          └───────┬────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
       No                  Yes
        │                   │
        ▼                   ▼
  ┌───────────┐    ┌────────────────┐
  │ ✅ Create │    │ Same provider? │
  │ new acct  │    └───────┬────────┘
  └───────────┘            │
                  ┌────────┴────────┐
                  ▼                 ▼
                 Yes               No
                  │                 │
                  ▼                 ▼
           ┌───────────┐    ┌───────────────────┐
           │ ✅ Normal │    │ ❌ Error:         │
           │ sign-in   │    │ account-exists-   │
           └───────────┘    │ with-different-   │
                            │ credential        │
                            └───────────────────┘
```

### The Default Error

When a user tries to sign in with a **different** provider than the one they originally used, Firebase throws:

```
auth/account-exists-with-different-credential
```

This requires manual handling to prompt the user to sign in with their original provider first.

---

## The Problem

### Scenario: Password Overwriting

Consider this dangerous scenario with default Firebase behavior:

1. User registers with **email/password**: `user@gmail.com`
2. Later, user clicks **"Sign in with Google"** using the same Gmail
3. **Firebase automatically links Google** to the account
4. ⚠️ **The password provider is REMOVED** - user can no longer sign in with password!

This is known as the **"Google overwrites password"** problem, which occurs because Gmail addresses are considered "trusted" by Google and Firebase allows the override.

---

## Our Solution: Backend-Orchestrated Linking

This application implements a **proactive backend-orchestrated approach** that:

1. **Intercepts** social login before Firebase makes decisions
2. **Detects** existing accounts with the same email
3. **Preserves** all existing authentication methods
4. **Links** new providers safely using custom tokens

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [1] User clicks social login  ──►  [2] Get OAuth access token from popup  │
│                                              │                              │
│                                              ▼                              │
│                                    [3] Send token to backend                │
│                                                                             │
└─────────────────────────────────────────────┬───────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (socialAuthService.ts)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [4] Verify token with provider API (Google/Facebook/Microsoft)             │
│                          │                                                  │
│                          ▼                                                  │
│  [5] Extract email from token                                               │
│                          │                                                  │
│                          ▼                                                  │
│  [6] Check Firebase: Does user exist with this email?                       │
│                          │                                                  │
│         ┌────────────────┼────────────────┐                                 │
│         ▼                ▼                ▼                                 │
│      NO USER       HAS PROVIDER     DIFFERENT PROVIDER                      │
│         │                │                │                                 │
│         ▼                ▼                ▼                                 │
│   Return:           Return:         Generate customToken                    │
│   action='signin'   action='signin' Return: action='link'                   │
│                                                                             │
└─────────────────────────────────────────────┬───────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND - Execute Action                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   IF action='signin':                    IF action='link':                  │
│   └──► signInWithCredential()            └──► signInWithCustomToken()       │
│                                               └──► linkWithCredential()     │
│                          │                              │                   │
│                          └──────────────┬───────────────┘                   │
│                                         ▼                                   │
│                              ✅ User signed in / linked                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow Diagram

### Complete Social Login Flow (Sequence)

```
┌──────┐     ┌──────────┐     ┌─────────┐     ┌──────────────┐     ┌──────────┐
│ User │     │ Frontend │     │ Backend │     │OAuth Provider│     │ Firebase │
└──┬───┘     └────┬─────┘     └────┬────┘     └──────┬───────┘     └────┬─────┘
   │              │                │                 │                  │
   │ Click social │                │                 │                  │
   │ login button │                │                 │                  │
   │─────────────►│                │                 │                  │
   │              │                │                 │                  │
   │              │ Open OAuth     │                 │                  │
   │              │ popup ─────────────────────────► │                  │
   │              │                │                 │                  │
   │              │ ◄───────────────────────────────-│                  │
   │              │ Access token + credential        │                  │
   │              │                │                 │                  │
   │              │ POST /api/auth/social/preflight   │                  │
   │              │ {provider, accessToken}          │                  │
   │              │───────────────►│                 │                  │
   │              │                │                 │                  │
   │              │                │ Verify token    │                  │
   │              │                │────────────────►│                  │
   │              │                │ ◄───────────────│                  │
   │              │                │ User info       │                  │
   │              │                │                 │                  │
   │              │                │ getUserByEmail()│                  │
   │              │                │─────────────────────────────────── ►│
   │              │                │                 │                  │
   │              │                │                 │                  │
   ├──────────────┼────────────────┼─────────────────┼──────────────────┤
   │              │   CASE A: No existing user       │                  │
   ├──────────────┼────────────────┼─────────────────┼──────────────────┤
   │              │                │ ◄───────────────────────────────── │
   │              │                │ user-not-found  │                  │
   │              │ ◄──────────────│                 │                  │
   │              │ {action: 'signin'}               │                  │
   │              │                │                 │                  │
   │              │ signInWithCredential()           │                  │
   │              │───────────────────────────────────────────────────► │
   │              │                │                 │                  │
   │              │ ◄────────────────────────────────────────────────── │
   │              │                New user created  │                  │
   │              │                │                 │                  │
   ├──────────────┼────────────────┼─────────────────┼──────────────────┤
   │              │   CASE B: User exists - LINK required               │
   ├──────────────┼────────────────┼─────────────────┼──────────────────┤
   │              │                │ ◄───────────────────────────────── │
   │              │                │ User with diff providers           │
   │              │                │                 │                  │
   │              │                │ createCustomToken(uid)             │
   │              │                │───────────────────────────────────►│
   │              │                │ ◄──────────────────────────────────│
   │              │                │ customToken     │                  │
   │              │                │                 │                  │
   │              │ ◄──────────────│                 │                  │
   │              │ {action: 'link', customToken}    │                  │
   │              │                │                 │                  │
   │              │ signInWithCustomToken()          │                  │
   │              │───────────────────────────────────────────────────► │
   │              │ ◄────────────────────────────────────────────────── │
   │              │ Signed in as existing user       │                  │
   │              │                │                 │                  │
   │              │ linkWithCredential()             │                  │
   │              │───────────────────────────────────────────────────► │
   │              │ ◄────────────────────────────────────────────────── │
   │              │ Provider linked│                 │                  │
   │              │                │                 │                  │
   ├──────────────┼────────────────┼─────────────────┼──────────────────┤
   │              │ POST /api/auth/login             │                  │
   │              │───────────────►│                 │                  │
   │              │ ◄──────────────│                 │                  │
   │              │                │                 │                  │
   │ ◄────────────│                │                 │                  │
   │ ✅ Signed in │                │                 │                  │
   │              │                │                 │                  │
```

---

## Implementation Details

### Backend: socialAuthService.ts

The core logic resides in [socialAuthService.ts](file:///projects/learning/firebase-auth/backend/src/services/socialAuthService.ts):

```typescript
export async function checkSocialAuthConflict(
  provider: SupportedProvider,
  accessToken: string
): Promise<SocialAuthCheckResult> {
  // 1. Verify token and get user info from provider
  const oauthUserInfo = await verifyOAuthToken(provider, accessToken);
  const email = oauthUserInfo.email.toLowerCase();

  // 2. Check if user exists in Firebase
  let existingUser = await auth.getUserByEmail(email);

  // 3. Analyze existing providers
  const existingProviders = existingUser.providerData.map(p => p.providerId);
  const hasPassword = existingProviders.includes('password');
  const hasIncomingProvider = existingProviders.includes(incomingProviderId);

  // 4. Determine action:
  // - Case A: Already has provider → signin
  // - Case B: Has password → link (preserve password!)
  // - Case C: Has different social → link
}
```

### Frontend: socialAuth.ts

The frontend handler in [socialAuth.ts](file:///projects/learning/firebase-auth/frontend/src/lib/socialAuth.ts) executes the backend's decision:

```typescript
export async function handleUnifiedSocialAuth(
  provider: SupportedProvider,
  accessToken: string,
  credential: AuthCredential
): Promise<SocialAuthResult> {
  // Call preflight check endpoint
  const backendResult = await socialAuthPreflight(provider, accessToken);

  if (backendResult.action === 'link') {
    // Sign in as existing user with custom token
    await signInWithCustomToken(auth, backendResult.customToken);
    // Link the new provider
    await linkWithCredential(auth.currentUser, credential);
  } else {
    // Normal sign-in
    await signInWithCredential(auth, credential);
  }
}
```

---

## Key Scenarios

### Scenario 1: New User with Social Provider

```
[Sign in with Google]     [Backend: No existing user]     [action: 'signin']
  user@gmail.com   ────►        found           ────►     Create new account
                                                               │
                                                               ▼
                                                 ✅ Providers: [google.com]
```

---

### Scenario 2: Existing Password User Signs in with Google

```
┌─────────────────────────┐
│   Existing account:     │
│   email/password        │
│   user@gmail.com        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Sign in with Google     │
│ (same email)            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Backend detects:        │
│ "Has password provider" │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ action: 'link'          │
│ + customToken           │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Link Google credential  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│ ✅ Providers: [password, google.com]   │
│    Password is PRESERVED!               │
└─────────────────────────────────────────┘
```

> [!TIP]
> Password is **preserved**! User can still sign in with either method.

---

### Scenario 3: Google User Signs in with Facebook

```
┌─────────────────────────┐
│   Existing account:     │
│   Google sign-in        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Sign in with Facebook   │
│ (same email)            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Backend: Has google.com │
│ provider, not facebook  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ action: 'link'          │
│ + customToken           │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Link Facebook credential│
└───────────┬─────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ ✅ Providers: [google.com, facebook.com]    │
└──────────────────────────────────────────────┘
```

---

### Scenario 4: User Already Has All Providers

```
┌───────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ Existing account:     │     │ Sign in with any    │     │ Backend: Provider│
│ All providers linked  │ ──► │ provider            │ ──► │ already linked   │
└───────────────────────┘     └─────────────────────┘     └────────┬─────────┘
                                                                   │
                                         ┌─────────────────────────┘
                                         ▼
                              ┌───────────────────────┐
                              │ action: 'signin'      │
                              └───────────┬───────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │ ✅ Normal sign-in    │
                              └───────────────────────┘
```

---

## Summary

| Aspect | Default Firebase | Our Implementation |
|--------|------------------|-------------------|
| Conflict detection | Client-side error | Backend proactive detection |
| Password preservation | ❌ Can be overwritten | ✅ Always preserved |
| Multi-provider linking | Manual handling required | ✅ Automatic |
| User experience | Error messages | ✅ Seamless linking |
| Security | Potential account takeover | ✅ Controlled linking |

> [!NOTE]
> This implementation requires the Firebase Console setting **"Link accounts that use the same email"** to be **enabled** for the linking operations to work correctly.
