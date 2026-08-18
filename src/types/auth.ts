export type AppUser = {
  userId: string;
  phone: string;
  notifsEnabled: boolean;
};

export type AuthSession = {
  token: string;
  user: AppUser;
};
