# Firebase Account Linking Implementation

This document describes the implementation of Account Linking in our application, specifically designed to handle the `auth/account-exists-with-different-credential` error from Firebase Authentication.

## Overview

By default, we configure Firebase to **"Link accounts that use the same email"**. However, for security reasons, if a user signs in with a "Social Provider" (e.g., Facebook) but an account already exists with the same email using a different method (e.g., Google or Password), Firebase blocks the sign-in to prevent account hijacking.

To resolve this, we must:
1.  Catch the error.
2.  Identify the existing provider for that email.
3.  Ask the user to sign in with that *existing* provider to verify they own the account.
4.  Link the *new* credential to the existing account.

## Default Firebase Behavior (Without Custom Logic)

By default, if a user tries to sign in with a "new" provider (e.g., Facebook) but an account already exists with a "trusted" provider (e.g., Google or Password), Firebase **blocks the sign-in** and throws an error.

```text
+------+       +----------+       +----------+
| User |       | Frontend |       | Firebase |
+--+---+       +----+-----+       +-----+----+
   |                |                   |
   | Click Facebook |                   |
   |--------------->|                   |
   |                | signIn(Facebook)  |
   |                |------------------>|
   |                |                   |
   |                | Error: Exists     |
   |                |<------------------|
   | Show Error     |                   |
   |<---------------|                   |
   | "Account link  |                   |
   |  required"     |                   |
```

The user is stuck because they can't sign in with Facebook, and the app doesn't tell them *why* or how to fix it (i.e., "Please log in with Google").

## Our Solution: Authentication Flow

```text
+------+       +----------+       +----------+       +---------+
| User |       | Frontend |       | Firebase |       | Backend |
+--+---+       +----+-----+       +-----+----+       +----+----+
   |                |                   |                 |
   | Click Facebook |                   |                 |
   |--------------->|                   |                 |
   |                | signIn(Facebook)  |                 |
   |                |------------------>|                 |
   |                | Error: Exists     |                 |
   |                |<------------------|                 |
   |                |                   |                 |
   |                | fetchMethods()    |                 |
   |                |------------------>|                 |
   |                | Returns [Google]  |                 |
   |                |<------------------|                 |
   | Show Modal     |                   |                 |
   |<---------------|                   |                 |
   |                |                   |                 |
   | Click Google   |                   |                 |
   |--------------->|                   |                 |
   |                | signIn(Google)    |                 |
   |                |------------------>|                 |
   |                | Success           |                 |
   |                |<------------------|                 |
   |                |                   |                 |
   |                | link(Facebook)    |                 |
   |                |------------------>|                 |
   |                | Success           |                 |
   |                |<------------------|                 |
   |                |                   |                 |
   |                | POST /login (Sync)|                 |
   |                |------------------------------------>|
   |                |                   | Verify Token    |
   |                |                   | Update DB       |
   |                | Success           |<----------------|
   |                |<------------------------------------|
   | Redirect       |                   |                 |
   |<---------------|                   |                 |
```

## Implementation Details

### 1. Handling the Error (`useSocialAuth.ts`)
When `signInWithPopup` fails with `auth/account-exists-with-different-credential`, we extract:
- The **Pending Credential**: The credential from the failed login attempt (Facebook).
- The **Email**: The email address involved.

### 2. Finding Existing Providers
We call `fetchSignInMethodsForEmail(auth, email)` to see how the user originally signed up.

> **Note on Email Enumeration Protection:**
> If "Email Enumeration Protection" is enabled in Firebase Console, this call returns an empty array `[]`.
> To handle this, our app falls back to displaying buttons for **ALL supported providers** (Google, Facebook, Microsoft, Apple, Password) if the list is empty. This allows the user to manually select their original provider.

### 3. The Link UI (`LinkAccountModal.tsx`)
A modal appears checking:
- "An account with this email already exists."
- Displays buttons for the detected (or fallback) providers.

### 4. Completing the Link
When the user clicks the button for their *existing* provider:
1.  We sign them in normally.
2.  Once signed in, we immediately call `linkWithCredential(currentUser, pendingCredential)`.
3.  The new provider is added to the account.

## Password Registration Conflict
If a user tries to **Register** via Email/Password but that email is already used by a Social Provider:
1.  We catch `auth/email-already-in-use`.
2.  We trigger the same check flow.
3.  The user is prompted to sign in with their Social Provider.
4.  After sign-in, we use `EmailAuthProvider.credential` to link the new password to the social account.
