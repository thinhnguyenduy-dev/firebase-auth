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
