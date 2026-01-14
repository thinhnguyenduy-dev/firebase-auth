# Firebase Account Linking

This document explains how account linking works in this application when users sign in with multiple OAuth providers that share the same email address.

## The Problem

When Firebase Authentication is configured with "One account per email address" (the default), users cannot sign in with a different provider if an account already exists with the same email.

**Example scenario:**
1. User signs up with Google using `john@gmail.com`
2. Later, user tries to sign in with Facebook (which also uses `john@gmail.com`)
3. Firebase throws `auth/account-exists-with-different-credential` error

## Our Solution

We handle this automatically by linking the new provider to the existing account via the backend using Firebase Admin SDK.

## How It Works

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ACCOUNT LINKING FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Sign in with Facebook"
         │
         ▼
┌─────────────────────┐
│  signInWithPopup()  │
│  (Facebook)         │
└─────────────────────┘
         │
         ▼
    ┌─────────┐      YES     ┌──────────────────┐
    │ Success │ ───────────► │ Redirect to      │
    └─────────┘              │ Dashboard        │
         │                   └──────────────────┘
         │ NO (auth/account-exists-with-different-credential)
         ▼
┌─────────────────────────────┐
│ Extract from error:         │
│ - OAuth credential          │
│ - Email address             │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ POST /api/auth/link-provider│
│ {                           │
│   accessToken,              │
│   providerId: "facebook.com"│
│   email                     │
│ }                           │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│ 1. Verify token with Facebook API                               │
│    GET https://graph.facebook.com/me?access_token=TOKEN         │
│    → Returns { id: "facebook-user-id", email }                  │
│                                                                 │
│ 2. Find existing Firebase user by email                         │
│    auth.getUserByEmail(email)                                   │
│                                                                 │
│ 3. Link provider to existing account                            │
│    auth.updateUser(uid, {                                       │
│      providerToLink: {                                          │
│        providerId: "facebook.com",                              │
│        uid: "facebook-user-id"                                  │
│      }                                                          │
│    })                                                           │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ { success: true }           │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ signInWithCredential()      │
│ (Uses same credential -     │
│  no popup needed!)          │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Redirect to Dashboard       │
│ User is now signed in with  │
│ both providers linked       │
└─────────────────────────────┘
```

## Frontend Implementation

**Files:** `packages/client/src/app/login/page.tsx`, `packages/client/src/app/register/page.tsx`

```typescript
const handleSocialLogin = async (provider: AuthProvider) => {
  try {
    await signInWithPopup(auth, provider);
    router.push('/dashboard');
  } catch (err: any) {
    if (err.code === 'auth/account-exists-with-different-credential') {
      // 1. Extract credential from error
      const credential = OAuthProvider.credentialFromError(err) ||
        GoogleAuthProvider.credentialFromError(err) ||
        FacebookAuthProvider.credentialFromError(err);
      const email = err.customData?.email;

      // 2. Call backend to link the provider
      const result = await linkProvider(credential, providerId, email);

      if (result.success) {
        // 3. Sign in directly using the same credential (no popup needed)
        await signInWithCredential(auth, credential);
        router.push('/dashboard');
      }
    }
  }
};
```

**Key points:**
- `credentialFromError()` extracts the OAuth credential from the error
- `signInWithCredential()` allows signing in without opening a new popup
- The user experience is seamless - they just see a brief "Linking..." message

## Backend Implementation

### Provider Verification Service

**File:** `packages/server/src/services/providerVerifier.ts`

Verifies OAuth tokens with each provider's API to get the provider-specific user ID:

| Provider | API Endpoint | Returns |
|----------|--------------|---------|
| Google | `https://oauth2.googleapis.com/tokeninfo?access_token=TOKEN` | `{ sub, email }` |
| Facebook | `https://graph.facebook.com/me?fields=id,email&access_token=TOKEN` | `{ id, email }` |
| Microsoft | `https://graph.microsoft.com/v1.0/me` (Bearer token) | `{ id, mail }` |
| Apple | Decode ID token JWT | `{ sub, email }` |

### Link Provider Endpoint

**File:** `packages/server/src/routes/auth.ts`

```typescript
router.post('/link-provider', async (req, res) => {
  const { accessToken, providerId, email, idToken } = req.body;

  // 1. Verify token with provider API
  const providerInfo = await verifyProviderToken(providerId, accessToken, idToken);

  // 2. Find existing Firebase user
  const existingUser = await auth.getUserByEmail(email);

  // 3. Link the new provider
  await auth.updateUser(existingUser.uid, {
    providerToLink: {
      providerId: providerId,
      uid: providerInfo.providerUid,
    },
  });

  return res.json({ success: true, message: 'Provider linked successfully' });
});
```

## Supported Providers

- Google (`google.com`)
- Facebook (`facebook.com`)
- Microsoft (`microsoft.com`)
- Apple (`apple.com`)

## Error Handling

| Error | HTTP Status | Cause |
|-------|-------------|-------|
| Missing required fields | 400 | `accessToken`, `providerId`, or `email` not provided |
| Invalid/expired token | 401 | OAuth token failed verification with provider |
| User not found | 404 | No Firebase user exists with the given email |
| Provider already linked | 409 | The provider is already linked to this account |
| Linking failed | 500 | Firebase Admin SDK failed to link the provider |

## User Experience

From the user's perspective:

1. Click "Sign in with Facebook"
2. Complete Facebook OAuth popup
3. See brief "Linking your accounts..." message (< 1 second)
4. Automatically redirected to dashboard

The user doesn't need to know that account linking happened - it's completely transparent.

## Firebase Console

After linking, you can verify in the Firebase Console:
1. Go to Authentication → Users
2. Find the user by email
3. The "Providers" column will show multiple provider icons (e.g., Google + Facebook)

---

## Special Case: Google + Password Provider

### The Problem

When a user has an existing **email/password** account and signs in with **Google** using the same email, Firebase may **overwrite** the password provider instead of throwing the `auth/account-exists-with-different-credential` error.

This happens because Google is considered an **authoritative identity provider** for Google-hosted emails (like `@gmail.com`). From the [Firebase documentation](https://firebase.google.com/docs/auth/web/google-signin):

> "Google serves as both an email and social identity provider. Email IDPs are authoritative for all email addresses related to their hosted email domain while social IDPs assert email identities based having done a one time confirmation of the email address. A user logging in with Google will never cause this error when their account is hosted at Google."

**Result:** The user can no longer log in with their email/password after signing in with Google.

### Solution: Backend-Controlled OAuth Flow

To prevent this, we use a **backend-controlled OAuth flow** that intercepts the Google authentication and properly links the provider without overwriting the existing password provider.

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE + PASSWORD PRESERVATION FLOW                       │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Sign in with Google"
         │
         ▼
┌─────────────────────┐
│  signInWithPopup()  │
│  (Google)           │
└─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Get credential + email      │
│ (Before Firebase processes) │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ POST /api/auth/social-login │
│ {                           │
│   accessToken,              │
│   providerId: "google.com"  │
│ }                           │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│ 1. Verify Google token                                          │
│    GET https://oauth2.googleapis.com/tokeninfo?access_token=T   │
│    → Returns { sub: "google-uid", email }                       │
│                                                                 │
│ 2. Check if email has password provider                         │
│    auth.getUserByEmail(email)                                   │
│    → Check providerData for 'password'                          │
│                                                                 │
│ 3. If has password → LINK Google (preserve password)            │
│    auth.updateUser(uid, {                                       │
│      providerToLink: {                                          │
│        providerId: "google.com",                                │
│        uid: "google-uid"                                        │
│      }                                                          │
│    })                                                           │
│                                                                 │
│ 4. Create custom token for sign-in                              │
│    auth.createCustomToken(uid)                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ { customToken, linked: true}│
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ signInWithCustomToken()     │
│ (User signs in)             │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ Redirect to Dashboard                       │
│ User has BOTH providers:                    │
│ - Password (preserved!)                     │
│ - Google (newly linked)                     │
└─────────────────────────────────────────────┘
```

#### Backend Implementation

**Endpoint:** `POST /api/auth/social-login`

```typescript
router.post('/social-login', async (req, res) => {
  const { accessToken, idToken, providerId } = req.body;

  // 1. Verify the OAuth token with the provider
  const providerInfo = await verifyProviderToken(providerId, accessToken, idToken);
  const email = providerInfo.email;

  // 2. Check if user exists
  let user;
  let hasPasswordProvider = false;
  let linked = false;

  try {
    user = await auth.getUserByEmail(email);
    hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');

    // 3. If has password, link the OAuth provider (preserving password)
    if (hasPasswordProvider) {
      const hasOAuthProvider = user.providerData.some(p => p.providerId === providerId);
      if (!hasOAuthProvider) {
        await auth.updateUser(user.uid, {
          providerToLink: {
            providerId: providerId,
            uid: providerInfo.providerUid,
          },
        });
        linked = true;
      }
    }
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Create new user
      user = await auth.createUser({
        email: email,
        emailVerified: true,
      });
      // Link the provider
      await auth.updateUser(user.uid, {
        providerToLink: {
          providerId: providerId,
          uid: providerInfo.providerUid,
        },
      });
    } else {
      throw error;
    }
  }

  // 4. Create custom token for frontend sign-in
  const customToken = await auth.createCustomToken(user.uid);

  return res.json({
    success: true,
    customToken,
    linked,
    message: linked ? 'Google linked to existing account' : 'Signed in successfully',
  });
});
```

#### Frontend Implementation

```typescript
const handleSocialLogin = async (provider: AuthProvider, providerName: string) => {
  try {
    // 1. Open popup to get credential
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Get the credential for the provider
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (credential?.accessToken) {
      // 2. Call backend for proper linking
      const response = await socialLogin(credential, 'google.com');
      
      if (response.success && response.customToken) {
        // 3. Sign in with custom token
        await signInWithCustomToken(auth, response.customToken);
      }
    }
    
    router.push('/dashboard');
  } catch (err: any) {
    // Handle errors...
  }
};
```

#### Key Benefits

1. **Password Preserved**: Users can still log in with their email/password
2. **Seamless UX**: No additional confirmation required
3. **Secure**: Google OAuth already verifies email ownership
4. **Multiple Providers**: User account shows both Google and password providers

#### Verification

After implementation, you can verify:
1. Create an account with email/password
2. Sign in with Google using the same email
3. Sign out
4. Sign in again with email/password → Should work!
5. Check Firebase Console → User should have both "password" and "google.com" providers
