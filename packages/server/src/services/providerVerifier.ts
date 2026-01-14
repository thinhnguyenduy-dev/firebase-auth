interface ProviderUserInfo {
  providerUid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export async function verifyProviderToken(
  providerId: string,
  accessToken: string,
  idToken?: string
): Promise<ProviderUserInfo> {
  switch (providerId) {
    case 'google.com':
      return verifyGoogleToken(accessToken);
    case 'facebook.com':
      return verifyFacebookToken(accessToken);
    case 'microsoft.com':
      return verifyMicrosoftToken(accessToken);
    case 'apple.com':
      return verifyAppleToken(idToken || accessToken);
    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
}

async function verifyGoogleToken(accessToken: string): Promise<ProviderUserInfo> {
  // First verify the token
  const tokenResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
  );

  if (!tokenResponse.ok) {
    throw new Error('Invalid Google access token');
  }

  const tokenData = await tokenResponse.json();

  // Then get user info for displayName and photo
  const userInfoResponse = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  let displayName: string | undefined;
  let photoURL: string | undefined;

  if (userInfoResponse.ok) {
    const userInfo = await userInfoResponse.json();
    displayName = userInfo.name;
    photoURL = userInfo.picture;
  }

  return {
    providerUid: tokenData.sub,
    email: tokenData.email,
    displayName,
    photoURL,
  };
}

async function verifyFacebookToken(accessToken: string): Promise<ProviderUserInfo> {
  const response = await fetch(
    `https://graph.facebook.com/me?fields=id,email,name,picture.type(large)&access_token=${accessToken}`
  );

  if (!response.ok) {
    throw new Error('Invalid Facebook access token');
  }

  const data = await response.json();
  return {
    providerUid: data.id,
    email: data.email,
    displayName: data.name,
    photoURL: data.picture?.data?.url,
  };
}

async function verifyMicrosoftToken(accessToken: string): Promise<ProviderUserInfo> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Invalid Microsoft access token');
  }

  const data = await response.json();
  return {
    providerUid: data.id,
    email: data.mail || data.userPrincipalName,
    displayName: data.displayName,
  };
}

async function verifyAppleToken(idToken: string): Promise<ProviderUserInfo> {
  // Apple uses ID token (JWT) instead of access token
  // Decode the JWT payload (base64)
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Apple ID token format');
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return {
      providerUid: payload.sub,
      email: payload.email,
    };
  } catch {
    throw new Error('Failed to decode Apple ID token');
  }
}
