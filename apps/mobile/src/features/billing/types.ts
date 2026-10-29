export type CheckoutPerson = { name: string | null; phone: string | null };

export type CheckoutOutcome = {
  result: 'completed' | 'canceled' | 'failed';
  errorCode?: string;
  message?: string;
};
