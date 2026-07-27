import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { cookieNames } from '../auth/cookies.js';
import { env } from '../config/env.js';

const customerCookie = env.NODE_ENV === 'production' ? '__Host-db_customer' : 'db_customer';

export type CustomerIdentity = {
  userId: string | null;
  anonymousId: string | null;
};

function validUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export async function customerRateLimitKey(request: FastifyRequest): Promise<string> {
  if (request.cookies[cookieNames.access]) {
    try {
      await request.jwtVerify({ onlyCookie: true });
      return `customer:user:${request.user.sub}`;
    } catch {
      // Invalid or expired authentication falls back to the signed guest identity.
    }
  }

  const rawCookie = request.cookies[customerCookie];
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
  if (unsigned?.valid && validUuid(unsigned.value)) {
    return `customer:guest:${unsigned.value}`;
  }

  return `customer:ip:${request.ip}`;
}

export async function resolveCustomerIdentity(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<CustomerIdentity> {
  try {
    await request.jwtVerify({ onlyCookie: true });
    return { userId: request.user.sub, anonymousId: null };
  } catch {
    // Public customer features also work before authentication.
  }

  const rawCookie = request.cookies[customerCookie];
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
  const anonymousId = unsigned?.valid && validUuid(unsigned.value) ? unsigned.value : randomUUID();

  if (!unsigned?.valid || unsigned.value !== anonymousId) {
    reply.setCookie(customerCookie, anonymousId, {
      path: '/',
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 31_536_000
    });
  }

  return { userId: null, anonymousId };
}

export function clearCustomerIdentity(reply: FastifyReply): void {
  reply.clearCookie(customerCookie, {
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production'
  });
}

export function identityWhere(identity: CustomerIdentity, userColumn = 'user_id', anonymousColumn = 'anonymous_id'): {
  clause: string;
  value: string;
} {
  return identity.userId
    ? { clause: `${userColumn}=$1`, value: identity.userId }
    : { clause: `${anonymousColumn}=$1`, value: identity.anonymousId! };
}
