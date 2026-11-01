/** How JustWatch's clear names read in the UI and in Nuvio's source list. */
const DISPLAY_NAMES = Object.freeze({
  'Disney Plus': 'Disney+',
  'Amazon Prime Video': 'Prime Video',
  'Paramount Plus': 'Paramount+',
});

/**
 * @param {string} clearName JustWatch's `clearName`
 * @returns {string} the short name shown to users; unknown names come back unchanged
 */
export function displayName(clearName) {
  return Object.hasOwn(DISPLAY_NAMES, clearName) ? DISPLAY_NAMES[clearName] : clearName;
}
