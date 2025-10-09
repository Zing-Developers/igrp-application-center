import type { NextAuthOptions, Session, TokenSet } from '@igrp/framework-next-auth';
import type { JWT } from '@igrp/framework-next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

const isProd = process.env.NODE_ENV === 'production';
const baseUrl = process.env.NEXTAUTH_URL ?? '';

// Validate and fix invalid URLs (like 0.0.0.0)
const validBaseUrl = baseUrl.includes('0.0.0.0') 
  ? (process.env.IGRP_APP_CENTER_URL || baseUrl) 
  : baseUrl;

console.log(':: AUTH OPTIONS - NEXTAUTH_URL:', baseUrl);
console.log(':: AUTH OPTIONS - Valid URL:', validBaseUrl);

// Handle empty URL during build time
const url = validBaseUrl ? new URL(validBaseUrl) : { hostname: 'localhost' };
const cookieDomain = isProd && url.hostname !== 'localhost' ? url.hostname : undefined;

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID || '',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      issuer: process.env.KEYCLOAK_ISSUER || '',
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: 'jwt',
    maxAge: 4 * 60 * 60, // 4 hours
  },

  cookies: {
    sessionToken: {
      name: isProd ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: process.env.IGRP_APP_BASE_PATH || '/',
        secure: isProd,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  },

  debug: process.env.NODE_ENV === 'development',

  callbacks: {
    async redirect({ url, baseUrl: nextAuthBaseUrl }) {
      const basePath = process.env.IGRP_APP_BASE_PATH || '';
      // Use validBaseUrl instead of baseUrl to handle 0.0.0.0
      const baseUrl = validBaseUrl || nextAuthBaseUrl;

      console.log(':: AUTH REDIRECT DEBUG ::', { url, baseUrl, nextAuthBaseUrl, basePath });

      // Handle relative paths
      if (url.startsWith('/')) {
        // Check if the relative path already has basePath
        if (basePath && url.startsWith(basePath)) {
          return `${baseUrl}${url}`;
        }
        return `${baseUrl}${basePath}${url}`;
      }

      // Handle full URLs that start with baseUrl
      if (url.startsWith(baseUrl)) {
        // Parse the URL to get the pathname
        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          
          // Check if pathname already has basePath
          if (basePath && pathname.startsWith(basePath)) {
            console.log(':: AUTH REDIRECT - basePath already in URL, returning as-is');
            return url;
          }
          
          // Check if we need to add basePath
          if (basePath && !pathname.startsWith(basePath)) {
            console.log(':: AUTH REDIRECT - Adding basePath');
            const _url = url.replace(baseUrl, '');
            return `${baseUrl}${basePath}${_url}`;
          }
          
          return url;
        } catch (error) {
          console.error(':: AUTH REDIRECT - Error parsing URL:', error);
          return url;
        }
      }

      // Default fallback
      return `${baseUrl}${basePath}`;
    },
    async jwt({ token, user, account, profile }) {
      if (account) {
        console.log(':: JWT CALLBACK - NEW SIGN IN ::', {
          hasUser: !!user,
          hasAccount: !!account,
          provider: account.provider,
        });

        if (user && !('user' in token)) {
          token.user = {
            id: token.sub ?? user.id ?? undefined,
            name: user.name ?? profile?.name ?? null,
            email: user.email ?? profile?.email ?? null,
          };
        }
        // Store only accessToken, not idToken (reduces JWT size significantly)
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        delete token.error;
        return token;
      }

      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) {
        return token;
      }

      try {
        if (!token.refreshToken) {
          console.error('No refresh token available for refresh.');
          return { ...token, error: 'RefreshAccessTokenError' };
        }

        const response = await requestRefreshOfAccessToken(token);
        const tokens: TokenSet = await response.json();

        if (!response.ok) {
          console.error('Error refreshing access token, response not ok:', tokens);
          throw tokens;
        }

        const updatedToken: JWT = {
          ...token,
          user: token.user,
          accessToken: tokens.access_token,
          expiresAt: Math.floor(Date.now() / 1000 + Number(tokens.expires_in)),
          refreshToken: tokens.refresh_token || token.refreshToken,
          error: undefined,
        };
        return updatedToken;
      } catch (error) {
        console.error('Error refreshing access token', error);
        return { ...token, error: 'RefreshAccessTokenError' };
      }
    },
    async session({ session, token }) {
      session.user = token.user as Session['user'];
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.expiresAt = token.expiresAt;
      return session;
    },
  },

  pages: {
    signIn: '/api/auth/signin',
    error: '/api/auth/error',
  },
};

export async function requestRefreshOfAccessToken(token: JWT) {
  if (
    !process.env.KEYCLOAK_ISSUER ||
    !process.env.KEYCLOAK_CLIENT_ID ||
    !process.env.KEYCLOAK_CLIENT_SECRET
  ) {
    console.error('Keycloak environment variables are not set for token refresh.');
    throw new Error('Missing Keycloak configuration for token refresh.');
  }

  if (!token.refreshToken) {
    console.error('No refresh token available.');
    throw new Error('Missing refresh token.');
  }

  return await fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: String(token.refreshToken),
    }),
  });
}

export async function buildKeycloakEndSessionUrl(jwt: JWT): Promise<string> {
  const issuer = process.env.KEYCLOAK_ISSUER;
  if (!issuer) throw new Error('KEYCLOAK_ISSUER not set');

  // Build URL safely - issuer is already checked above
  const url = new URL(`${issuer}/protocol/openid-connect/logout`);

  // Get fresh id_token for logout
  let idToken: string | undefined;

  if (jwt?.refreshToken) {
    try {
      console.log(':: LOGOUT - Fetching fresh id_token with refresh token');
      const response = await requestRefreshOfAccessToken(jwt);

      if (response.ok) {
        const tokens: TokenSet = await response.json();
        idToken = tokens.id_token;
        console.log(':: LOGOUT - Got id_token:', !!idToken);
      } else {
        const errorText = await response.text();
        console.error(':: LOGOUT - Failed to get id_token:', response.status, errorText);
      }
    } catch (error) {
      console.error(':: LOGOUT - Error getting id_token for logout:', error);
    }
  } else {
    console.warn(':: LOGOUT - No refresh token available for logout');
  }

  if (idToken) {
    url.searchParams.set('id_token_hint', idToken);
  } else {
    console.warn(':: LOGOUT - No id_token available, logout may not work properly on Keycloak');
  }

  // TEMPORARY: Removed post_logout_redirect_uri because it's not configured in Keycloak
  // To enable automatic redirect after logout, configure in Keycloak:
  // Clients -> access-management -> Settings -> Valid Post Logout Redirect URIs
  // Add: http://localhost:3000/* and your production URL
  
  // const loginUrl = '/login';
  // const basePath = process.env.IGRP_APP_BASE_PATH || '';
  // const postLogoutRedirectUri = process.env.NEXTAUTH_URL
  //   ? `${process.env.NEXTAUTH_URL}${basePath}${loginUrl}`
  //   : undefined;
  // if (postLogoutRedirectUri) {
  //   url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  // }

  console.log(':: LOGOUT URL:', url.toString());
  return url.toString();
}
