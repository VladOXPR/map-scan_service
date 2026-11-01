import { StyleSheet, View } from 'react-native';
import { Button, MembershipChip, Text } from '@/components/ui';
import { spacing } from '@/theme';
import { formatMoney, type Membership } from './api';
import { useBilling, useManageMembership } from './hooks';

const STATUS_COPY: Partial<Record<Membership['status'], string>> = {
  past_due: 'Payment failed. Update your card to keep unlocking.',
  unpaid: 'Payment failed. Update your card to keep unlocking.',
  incomplete: 'Checkout was not finished.',
  canceled: 'Your membership has ended.',
};

function cardLabel(card: Membership['card']): string | null {
  if (!card) return null;
  if (card.wallet === 'apple_pay') return card.last4 ? `Apple Pay · ${card.last4}` : 'Apple Pay';
  if (card.wallet === 'google_pay') return card.last4 ? `Google Pay · ${card.last4}` : 'Google Pay';
  if (!card.last4) return null;
  const brand = card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card';
  return `${brand} · ${card.last4}`;
}

/** Membership block in the account sheet: status, renewal, card, and the way in or out. */
export function MembershipSection({ onBecomeMember }: { onBecomeMember: () => void }) {
  const billing = useBilling();
  const manage = useManageMembership();
  const data = billing.data;
  if (!data) return null;

  const { membership, plan } = data;
  const card = cardLabel(membership.card);
  const renewal = membership.currentPeriodEnd
    ? new Date(membership.currentPeriodEnd).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const hasCustomerRecord = membership.status !== 'none';

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text variant="subtitle">Membership</Text>
        {membership.active ? <MembershipChip label="Member" /> : null}
      </View>

      {membership.active ? (
        <View style={{ gap: spacing[1] }}>
          <Text muted>
            {[
              membership.planName,
              membership.amountCents != null
                ? `${formatMoney(membership.amountCents, membership.currency ?? 'usd')}/${membership.interval ?? 'month'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {renewal ? (
            <Text variant="caption" muted>
              {membership.cancelAtPeriodEnd ? `Ends ${renewal}` : `Renews ${renewal}`}
            </Text>
          ) : null}
          {card ? (
            <Text variant="caption" muted>
              {card}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text muted>
          {STATUS_COPY[membership.status] ??
            (plan
              ? `Unlimited rentals for ${formatMoney(plan.amountCents, plan.currency)}/${plan.interval}.`
              : 'Memberships are coming soon.')}
        </Text>
      )}

      {!membership.active && plan ? (
        <Button label="Become a member" onPress={onBecomeMember} />
      ) : null}
      {hasCustomerRecord && (membership.active || membership.status === 'past_due' || membership.status === 'unpaid') ? (
        <Button
          label={membership.active ? 'Manage membership' : 'Update card'}
          variant="ghost"
          loading={manage.opening}
          onPress={() => void manage.open()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
