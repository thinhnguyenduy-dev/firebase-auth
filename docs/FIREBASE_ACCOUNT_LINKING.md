# Account Linking: "Create Multiple Accounts" Strategy

This document describes the secure account linking implementation using Firebase's **"Create multiple accounts for each identity provider"** setting.

## Firebase Configuration

In **Firebase Console** → **Authentication** → **Settings** → **User account linking**:

Select: **"Create multiple accounts for each identity provider"**

This allows the same email to have separate accounts for different providers:
- One account for email/password
- One account for Google
- One account for Facebook
- etc.

## Why This Approach?

### Problems with "Link accounts with same email" setting:

1. **Google overwrites password provider** - If user registers with email/password first, then signs in with Google, the password provider is silently removed
2. **Loss of control** - Automatic linking happens without user consent
3. **Security concerns** - OAuth providers control the linking behavior

### Benefits of "Create multiple accounts":

1. **Full control** - You decide when and how to link
2. **Preserves all providers** - Password is never overwritten
3. **Security** - Can require verification before linking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend                                     │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │ signInWithPopup  │     │ createUserWith...│                      │
│  │ (Social Login)   │     │ (Email/Password) │                      │
│  └────────┬─────────┘     └────────┬─────────┘                      │
│           │                        │                                 │
│           └──────────┬─────────────┘                                │
│                      ▼                                               │
│         POST /api/auth/check-link                                    │
│                      │                                               │
└──────────────────────┼───────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Backend                                      │
│                                                                      │
│  checkAndLinkAccounts(uid)                                           │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │  1. Get current user's email (from user or providerData) │        │
│  │  2. Search for OTHER accounts with same email            │        │
│  │  3. Determine link case and handle appropriately         │        │
│  └─────────────────────────────────────────────────────────┘        │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │  LinkResult                                              │        │
│  │  - linked: bool + customToken (for auto-link cases)      │        │
│  │  - needsVerification: bool + providers (for pw→social)   │        │
│  └─────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Link Cases

### CASE 1: Social → Password (SAFE ✅)

User registers with email/password first, then signs in with Google.

```
┌──────┐          ┌──────────┐          ┌─────────┐          ┌──────────┐
│ User │          │ Frontend │          │ Backend │          │ Firebase │
└──┬───┘          └────┬─────┘          └────┬────┘          └────┬─────┘
   │                   │                     │                    │
   │  [Already has password account]         │                    │
   │                   │                     │                    │
   │ Click "Google"    │                     │                    │
   │──────────────────>│                     │                    │
   │                   │ signInWithPopup()   │                    │
   │                   │────────────────────────────────────────->│
   │                   │                     │   New Google UID   │
   │                   │<─────────────────────────────────────────│
   │                   │                     │                    │
   │                   │ POST /auth/check-link                    │
   │                   │────────────────────>│                    │
   │                   │                     │ findUserByEmail()  │
   │                   │                     │───────────────────>│
   │                   │                     │ deleteUser(google) │
   │                   │                     │───────────────────>│
   │                   │                     │ updateUser(link)   │
   │                   │                     │───────────────────>│
   │                   │                     │ createCustomToken  │
   │                   │                     │───────────────────>│
   │                   │  {linked, token}    │                    │
   │                   │<────────────────────│                    │
   │                   │                     │                    │
   │                   │ signInWithCustomToken                    │
   │                   │────────────────────────────────────────->│
   │                   │                     │                    │
   │                   │ POST /auth/login    │                    │
   │                   │────────────────────>│                    │
   │  Logged in!       │                     │                    │
   │<──────────────────│                     │                    │
```

**Result:** Google provider linked to password account. Password preserved.

---

### CASE 2: Password → Social (REQUIRES VERIFICATION ⚠️)

User has social account, tries to register with email/password.

```
┌──────┐          ┌──────────┐          ┌─────────┐          ┌──────────┐
│ User │          │ Frontend │          │ Backend │          │ Firebase │
└──┬───┘          └────┬─────┘          └────┬────┘          └────┬─────┘
   │                   │                     │                    │
   │  [Already has Google account]           │                    │
   │                   │                     │                    │
   │ Register email/pw │                     │                    │
   │──────────────────>│                     │                    │
   │                   │ createUser()        │                    │
   │                   │────────────────────────────────────────->│
   │                   │                     │  New password UID  │
   │                   │<─────────────────────────────────────────│
   │                   │                     │                    │
   │                   │ POST /auth/check-link                    │
   │                   │────────────────────>│                    │
   │                   │                     │ findUserByEmail()  │
   │                   │                     │───────────────────>│
   │                   │                     │ ⚠️ Social exists!  │
   │                   │                     │ deleteUser(pw)     │
   │                   │                     │───────────────────>│
   │                   │ {needsVerification} │                    │
   │                   │<────────────────────│                    │
   │                   │                     │                    │
   │  Show modal       │                     │                    │
   │<──────────────────│                     │                    │
   │                   │                     │                    │
   │ Click "Send Code" │                     │                    │
   │──────────────────>│ POST /auth/send-verification             │
   │                   │────────────────────>│                    │
   │                   │                     │ Send email         │
   │<────────────────────────────────────────│                    │
   │                   │                     │                    │
   │ Enter code + pw   │                     │                    │
   │──────────────────>│ POST /auth/add-password                  │
   │                   │────────────────────>│                    │
   │                   │                     │ updateUser(email,pw)
   │                   │                     │───────────────────>│
   │                   │   {success: true}   │                    │
   │                   │<────────────────────│                    │
   │                   │                     │                    │
   │                   │ signInWithEmail()   │                    │
   │                   │────────────────────────────────────────->│
   │  Logged in!       │                     │                    │
   │<──────────────────│                     │                    │
```

**Why verification?** Without it, anyone who knows your email could create a password and hijack your account!

---

### CASE 3: Social → Social (SAFE ✅)

User signs in with Google, then signs in with Facebook (same email).

```
┌──────┐          ┌──────────┐          ┌─────────┐          ┌──────────┐
│ User │          │ Frontend │          │ Backend │          │ Firebase │
└──┬───┘          └────┬─────┘          └────┬────┘          └────┬─────┘
   │                   │                     │                    │
   │  [Already has Google account]           │                    │
   │                   │                     │                    │
   │ Click "Facebook"  │                     │                    │
   │──────────────────>│                     │                    │
   │                   │ signInWithPopup()   │                    │
   │                   │────────────────────────────────────────->│
   │                   │                     │  New Facebook UID  │
   │                   │<─────────────────────────────────────────│
   │                   │                     │                    │
   │                   │ POST /auth/check-link                    │
   │                   │────────────────────>│                    │
   │                   │                     │ findUserByEmail()  │
   │                   │                     │───────────────────>│
   │                   │                     │ Found Google acct  │
   │                   │                     │ deleteUser(fb)     │
   │                   │                     │───────────────────>│
   │                   │                     │ updateUser(link fb)│
   │                   │                     │───────────────────>│
   │                   │                     │ createCustomToken  │
   │                   │                     │───────────────────>│
   │                   │  {linked, token}    │                    │
   │                   │<────────────────────│                    │
   │                   │                     │                    │
   │                   │ signInWithCustomToken                    │
   │                   │────────────────────────────────────────->│
   │                   │                     │                    │
   │                   │ POST /auth/login    │                    │
   │                   │────────────────────>│                    │
   │  Logged in!       │                     │                    │
   │<──────────────────│                     │                    │
```

**Result:** Facebook linked to existing Google account.

---

## Security Summary

| Scenario | Auto-Link? | Why? |
|----------|------------|------|
| Social → Password | ✅ Yes | User authenticated via OAuth |
| Password → Social | ❌ Verify first | Prevents account hijacking |
| Social → Social | ✅ Yes | User authenticated via OAuth |

---

## Critical Implementation Notes

### ⚠️ 1. Email is in `providerData`, not `user.email`

With "Create multiple accounts" setting, **`user.email` is often `undefined`**. The email is only stored in `providerData`:

```typescript
// WRONG - often undefined with this setting
const email = user.email;

// CORRECT - check both locations (see userSearchService.ts)
export function getEmailFromUser(user: UserRecord): string | undefined {
  if (user.email) return user.email;
  
  for (const provider of user.providerData || []) {
    if (provider.email) {
      return provider.email;
    }
  }
  return undefined;
}
```

### ⚠️ 2. Search users by `providerData` email

`auth.getUserByEmail(email)` won't find users whose email is only in `providerData`. You must search all users:

```typescript
// See userSearchService.ts - findUserByEmail()
export async function findUserByEmail(
  email: string,
  excludeUid?: string
): Promise<UserRecord | null> {
  // First try the standard lookup
  try {
    const user = await auth.getUserByEmail(email);
    if (!excludeUid || user.uid !== excludeUid) {
      return user;
    }
  } catch (e: any) {
    if (e.code !== 'auth/user-not-found') {
      throw e;
    }
  }

  // With "Create multiple accounts" setting, email might only be in providerData
  const listResult = await auth.listUsers(1000);
  
  for (const user of listResult.users) {
    if (excludeUid && user.uid === excludeUid) continue;
    
    const userEmail = getEmailFromUser(user);
    if (userEmail === email) {
      return user;
    }
  }
  
  return null;
}
```

### ⚠️ 3. Don't auto-sync on auth state change

If your `AuthContext` calls `syncUser()` on `onAuthStateChanged`, it creates a race condition:

```typescript
// WRONG - creates race condition with checkAccountLink
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await syncUser(user);  // ❌ Syncs before link check
  }
});

// CORRECT - sync explicitly via login/register endpoints
onAuthStateChanged(auth, async (user) => {
  // Don't sync here - sync is handled in login/register handlers
  setUser(user);
  setLoading(false);
});
```

### ⚠️ 4. Set email when adding password

When adding password to social account, you MUST also set email at account level:

```typescript
// WRONG - login will fail because email is only in providerData
await auth.updateUser(uid, { password });

// CORRECT - set email at account level for signInWithEmailAndPassword to work
await auth.updateUser(existingUser.uid, { email, password });
```

### ⚠️ 5. Delete before link

You must delete the duplicate account BEFORE linking its provider to another account:

```typescript
// WRONG - causes FEDERATED_USER_ID_ALREADY_LINKED error
await auth.updateUser(targetUID, { providerToLink: { providerId, uid } });
await auth.deleteUser(sourceUID);

// CORRECT - delete first to release the provider UID
await auth.deleteUser(sourceUID);
await auth.updateUser(targetUID, { providerToLink: { providerId, uid } });
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/check-link` | POST | None | Check and link duplicate accounts |
| `/api/auth/send-verification` | POST | None | Send verification code for adding password |
| `/api/auth/add-password` | POST | None | Add password to OAuth account after verification |
| `/api/auth/login` | POST | Bearer Token | Sync user to database after login |
| `/api/auth/register` | POST | Bearer Token | Create user in database after registration |

---

## Implementation Files

| Component | File | Purpose |
|-----------|------|---------|
| Backend link logic | `backend/src/services/accountLinkService.ts` | `checkAndLinkAccounts()`, `linkAccounts()` |
| User search service | `backend/src/services/userSearchService.ts` | `findUserByEmail()`, `getEmailFromUser()` |
| Auth controller | `backend/src/controllers/authController.ts` | `checkLink`, `sendVerification`, `addPassword`, `login`, `register` |
| API routes | `backend/src/routes/auth.ts` | Route definitions |
| Frontend API | `frontend/src/lib/api.ts` | `checkAccountLink()`, `login()`, `register()` |
| Social auth hook | `frontend/src/hooks/useSocialAuth.ts` | `useSocialAuth()` hook for social login |
| Home page | `frontend/src/app/page.tsx` | Login form |
| Register page | `frontend/src/app/register/page.tsx` | Registration with link handling |
| Auth context | `frontend/src/context/AuthContext.tsx` | NO auto-sync |
| Add password modal | `frontend/src/components/AddPasswordModal.tsx` | Email verification flow |

---

## Key Code: checkAndLinkAccounts()

```typescript
// accountLinkService.ts

// CASE 1: Current is social-only, target has password
if (!currentHasPassword && targetHasPassword) {
  return await linkAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-password');
}

// CASE 2: Current has password, target is social-only (requires verification)
if (currentHasPassword && !targetHasPassword && targetHasSocial) {
  return await handlePasswordToSocialLink(currentUserUid, duplicateAccount, email);
}

// CASE 3: Both are social-only
if (!currentHasPassword && currentHasSocial && !targetHasPassword && targetHasSocial) {
  return await linkAccounts(currentUserUid, duplicateAccount.uid, currentUser, 'social-into-social');
}
```

### linkAccounts() Helper

```typescript
async function linkAccounts(
  sourceUid: string,
  targetUid: string,
  sourceUser: UserRecord,
  linkType: LinkType
): Promise<LinkResult> {
  const providersToLink = sourceUser.providerData
    .filter(p => p.providerId !== 'password')
    .map(p => ({ providerId: p.providerId, uid: p.uid }));

  // Delete source account first to release provider UIDs
  await auth.deleteUser(sourceUid);

  // Link providers to target account
  for (const provider of providersToLink) {
    await auth.updateUser(targetUid, {
      providerToLink: { providerId: provider.providerId, uid: provider.uid },
    });
  }

  const customToken = await auth.createCustomToken(targetUid);
  return { success: true, linked: true, customToken, message: 'Accounts linked' };
}
```

### handlePasswordToSocialLink() Helper

```typescript
async function handlePasswordToSocialLink(
  passwordUid: string,
  socialUser: UserRecord,
  email: string
): Promise<LinkResult> {
  const socialProviders = socialUser.providerData
    .filter(p => p.providerId !== 'password')
    .map(p => p.providerId);

  // Delete the newly created password account (user must verify email first)
  await auth.deleteUser(passwordUid);

  return {
    success: true,
    linked: false,
    needsVerification: true,
    providers: socialProviders,
    email: email,
    message: `Please verify your email to add a password.`,
  };
}
```
