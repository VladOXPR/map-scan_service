/** Local low-battery alert rules (on-device only — never sent to the API). */
export const LOW_BATTERY_THRESHOLD = 0.38;
/** Re-arm alert only after battery climbs back above this. */
export const LOW_BATTERY_REARM_THRESHOLD = 0.43;
/** Skip alert if nearest CUUB is farther than this. */
export const LOW_BATTERY_MAX_DISTANCE_MILES = 2;
export const LOW_BATTERY_ARMED_KEY = 'cuub.alerts.lowBattery.armed';
