export type AppUser = {
  userId: string;
  phone: string;
  notifsEnabled: boolean;
  firstName: string | null;
  lastName: string | null;
  /** YYYY-MM-DD. */
  dateOfBirth: string | null;
  /** Name and date of birth are on file and passed the server's age check; required to unlock. */
  profileComplete: boolean;
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
