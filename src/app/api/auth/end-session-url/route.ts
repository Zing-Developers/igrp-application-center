import { NextRequest, NextResponse } from 'next/server';
import { getToken } from '@igrp/framework-next-auth';
import { buildKeycloakEndSessionUrl } from '@/lib/auth-options';

export async function GET(req: NextRequest) {
  const token = await getToken({ req });

  try {
    const url = await buildKeycloakEndSessionUrl(token);
    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    const NEXTAUTH_URL = process.env.NEXTAUTH_URL || '';
    const basePath = process.env.IGRP_APP_BASE_PATH || '';
    const loginUrl = '/login';
    return NextResponse.json({ url: `${NEXTAUTH_URL}${basePath}${loginUrl}` }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });

  if (!token?.refreshToken) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const keycloakIssuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  if (!keycloakIssuer || !clientId || !clientSecret) {
    throw new Error('Keycloak environment variables not configured correctly.');
  }

  try {
    const response = await fetch(`${keycloakIssuer}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refreshToken,
      }),
    });

    if (response.ok) {
      console.log('Successfully logged out of Keycloak via POST.');
    } else {
      console.error('Keycloak POST logout failed:', await response.text());
    }
  } catch (error) {
    console.error('Keycloak POST logout failed:', error);
  }

  const logoutUrl = new URL('/api/auth/signout?callbackUrl=/', req.url);
  return NextResponse.redirect(logoutUrl);
}
