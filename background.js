// Redirects every top-level page load to its Wayback Machine snapshot near the cutoff.
const RULE_ID = 1;

// Domains that must stay live: the archive itself, plus Google/YouTube
// (handled by content scripts) and their video CDN.
const EXCLUDED = [
  'web.archive.org',
  'archive.org',
  'google.com',
  'youtube.com',
  'googlevideo.com',
  'localhost',
];

async function rebuild() {
  const { enabled, bypass, cutoff } = await chrome.storage.local.get({ enabled: true, bypass: [], cutoff: '2019-05-10' });
  const waybackTs = cutoff.replace(/-/g, '');
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: enabled
      ? [{
          id: RULE_ID,
          condition: {
            regexFilter: '^https?://.*',
            resourceTypes: ['main_frame'],
            excludedRequestDomains: [...EXCLUDED, ...bypass],
          },
          action: {
            type: 'redirect',
            // ponytail: Wayback serves the capture *nearest* this timestamp, so a URL
            // that only exists post-2019 can resolve to a post-cutoff capture.
            // Upgrade path: CDX API lookup with &to=20190514 before redirecting.
            redirect: { regexSubstitution: `https://web.archive.org/web/${waybackTs}/\\0` },
          },
        }]
      : [],
  });
}

chrome.runtime.onInstalled.addListener(rebuild);
chrome.runtime.onStartup.addListener(rebuild);
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg === 'rebuild') {
    rebuild().then(() => sendResponse(true));
    return true;
  }
});
