import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Configure basePath for NextAuth to include IGRP_APP_BASE_PATH
const basePath = process.env.IGRP_APP_BASE_PATH
  ? `${process.env.IGRP_APP_BASE_PATH}/api/auth`
  : undefined;

const handler = NextAuth({
  ...authOptions,
  debug: process.env.NODE_ENV === 'development',
  ...(basePath ? { basePath } : {}),
});

export { handler as GET, handler as POST };
