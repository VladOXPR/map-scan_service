import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/lib/apiClient';
import { getItem, removeItem, setItem } from '@/lib/storage';
import type { AppUser, AuthSession, LoginResult } from '@/types/auth';

/** Phone that just self-deleted on this device — next signup should welcome as new. */
const DELETED_PHONE_KEY = 'cuub.auth.deletedPhone';

type OtpRequestData = {
  phone: string;
  status?: string;
  sendAttempts?: number | null;
};

type LoginResponse = {
  token: string;
  user: AppUser;
  isNewUser?: boolean;
};

const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize to E.164. US MVP: bare 10-digit (or 11 starting with 1) → +1…
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (hasPlus) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Short local-looking numbers still get +1 for US MVP.
  if (digits.length >= 7 && digits.length < 10) {
    return `+1${digits}`;
  }

  return `+${digits}`;
}

export function assertValidPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!E164_RE.test(normalized)) {
    throw new Error('Enter a valid phone number with country code (e.g. +1 312 555 0199).');
  }
  return normalized;
}

function toLoginResult(data: LoginResponse): LoginResult {
  if (!data?.token || !data.user?.userId) {
    throw new Error('Login response was incomplete.');
  }
  return {
    token: data.token,
    user: {
      userId: data.user.userId,
      phone: data.user.phone,
      notifsEnabled: Boolean(data.user.notifsEnabled),
    },
    isNewUser: Boolean(data.isNewUser),
  };
}

/** Step 1 — send SMS OTP. Does not create a session. */
export async function requestSmsCode(phone: string): Promise<OtpRequestData> {
  const normalized = assertValidPhone(phone);
  const { data } = await apiPost<OtpRequestData>('/app/auth/request-otp', {
    phone: normalized,
  });
  return {
    phone: data?.phone ?? normalized,
    status: data?.status,
    sendAttempts: data?.sendAttempts ?? null,
  };
}

/** Step 2 — verify code → JWT session (same shape as former dev-login). */
export async function verifySmsCode(
  phone: string,
  code: string,
): Promise<LoginResult> {
  const normalized = assertValidPhone(phone);
  const trimmedCode = code.replace(/\D/g, '').trim();
  if (!/^\d{4,10}$/.test(trimmedCode)) {
    throw new Error('Enter the verification code from your text message.');
  }

  const { data } = await apiPost<LoginResponse>('/app/auth/verify-otp', {
    phone: normalized,
    code: trimmedCode,
  });
  return toLoginResult(data);
}

/** Authoritative session check — use on hydrate and after resume. */
export async function fetchCurrentUser(token: string): Promise<AppUser> {
  const { data } = await apiGet<AppUser>('/app/me', { token });
  if (!data?.userId) {
    throw new Error('Profile response was incomplete.');
  }
  return {
    userId: data.userId,
    phone: data.phone,
    notifsEnabled: Boolean(data.notifsEnabled),
  };
}

/**
 * Hard-delete the signed-in app user — Apple 5.1.1v.
 * DELETE /app/me with Bearer JWT only; never call /app-users/:id/status.
 */
export async function deleteAccount(token: string): Promise<void> {
  await apiDelete<unknown>('/app/me', { token });
}

/** Remember which phone was deleted so the next OTP signup shows “Welcome to CUUB”. */
export async function markPhoneDeleted(phone: string): Promise<void> {
  try {
    await setItem(DELETED_PHONE_KEY, assertValidPhone(phone));
  } catch {
    // Non-fatal — welcome still uses API isNewUser when present.
  }
}

/**
 * True when this phone should get a first-time welcome:
 * API says new user, or this device just deleted that account.
 */
export async function shouldShowNewUserWelcome(
  phone: string,
  isNewUser: boolean,
): Promise<boolean> {
  if (isNewUser) {
    await removeItem(DELETED_PHONE_KEY);
    return true;
  }
  try {
    const deleted = await getItem(DELETED_PHONE_KEY);
    const normalized = assertValidPhone(phone);
    if (deleted && deleted === normalized) {
      await removeItem(DELETED_PHONE_KEY);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

/** Store Expo push token for future remote notifications. */
export async function registerPushToken(
  token: string,
  expoPushToken: string,
): Promise<void> {
  await apiPut<unknown>(
    '/app/me/push-token',
    { expoPushToken },
    { token },
  );
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.message || 'Please wait before requesting another code.';
    }
    if (error.status === 403) {
      return error.message || 'Account is not active.';
    }
    if (error.status === 503) {
      return 'SMS login is temporarily unavailable. Try again later.';
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Must match Twilio Verify service code length. */
export const OTP_LENGTH = 4;
export const OTP_RESEND_COOLDOWN_SEC = 20;

export type { AuthSession };
