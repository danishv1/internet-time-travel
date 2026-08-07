// Forces Google results (Web, Images, News) to pre-cutoff dates via the
// custom-date-range param. Runs at document_start, so the redirect happens
// before anything renders.
const bypassed = (bypass, host) => bypass.some((d) => host === d || host.endsWith('.' + d));

chrome.storage.local.get({ enabled: true, bypass: [], cutoff: '2019-05-10' }, ({ enabled, bypass, cutoff }) => {
  if (!enabled || bypassed(bypass, location.hostname)) return;
  const url = new URL(location.href);
  if (url.searchParams.has('tbs')) return;
  const [y, m, d] = cutoff.split('-');
  url.searchParams.set('tbs', `cdr:1,cd_max:${+m}/${+d}/${y}`);
  location.replace(url.href);
});
