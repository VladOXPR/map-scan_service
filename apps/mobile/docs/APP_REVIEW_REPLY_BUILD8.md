# App Review reply — build 8 (4.4 widget + prior 5.1.1 fixes)

Paste into **App Store Connect → Resolution Center** when submitting build **8**.

---

Hello App Review Team,

Thank you for your feedback on submission **1.0 (7)**.

**Guideline 4.4 — Widgets**

CUUB **does not include a Home Screen WidgetKit extension** in this version. The app is a map-first utility for finding nearby CUUB battery stations. Users cannot add a CUUB widget from the widget gallery.

We verified build **8** (replacing build 7): the IPA contains **no** `PlugIns/*.appex` widget extension. If your team observed a widget associated with CUUB, please share a screenshot so we can identify the source.

We have also confirmed our App Store listing does not advertise home screen widgets.

**Guideline 5.1.1(iv) — Location**

The pre-permission sheet uses **Continue** (not “Allow location”) and has no “Not now” option. Tapping Continue always proceeds to the system location permission dialog.

**Guideline 5.1.1(v) — Login**

The public station map works **without** creating an account or signing in. Account creation is optional and skippable. **Sign-in required** is turned off in App Review Information for this submission.

Optional demo credentials for testing account features (not required for map access):

- Phone: **+1 555 555 0100**
- OTP: **0000**

**Guideline 2.3.3 — Screenshots**

We updated 6.5-inch (and related) screenshots to show the actual in-app map UI.

Please let us know if you need any additional information.

Thank you,  
Vlad Valchkou  
CUUB, Inc.
