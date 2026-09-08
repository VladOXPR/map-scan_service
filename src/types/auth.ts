export type AppUser = {
  userId: string;
  phone: string;
  notifsEnabled: boolean;
};

export type AuthSession = {
  token: string;
  user: AppUser;
};

/** Flags returned by verify-otp / dev-login (not persisted). */
export type LoginWelcomeFlags = {
  /** True when this phone created a brand-new users row (first signup or after hard delete). */
  isNewUser: boolean;
};

export type LoginResult = AuthSession & LoginWelcomeFlags;

export type WelcomeVariant = 'new' | 'back';
