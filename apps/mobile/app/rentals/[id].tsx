import { Redirect } from 'expo-router';

/** `cuub://rentals/<id>` from rental pushes: the open rental lives on the map card. */
export default function RentalLinkRedirect() {
  return <Redirect href="/(app)" />;
}
