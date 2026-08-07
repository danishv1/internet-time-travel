const assert = require('node:assert');
const { parseRelativeDate, parseAbsoluteDate, isTooNew, agoText } = require('./content-youtube.js');

const now = new Date('2026-08-06').getTime();
const cutoff = new Date('2019-05-15');

assert.equal(parseRelativeDate('Some Channel · 500K views', now), null);
assert(parseRelativeDate('3 weeks ago', now) > cutoff);
assert(parseRelativeDate('Streamed 2 years ago', now) > cutoff);
assert(parseRelativeDate('10 years ago', now) < cutoff);

assert(parseRelativeDate('לפני 3 שבועות', now) > cutoff);       // 3 weeks ago
assert(parseRelativeDate('שודר לפני שנתיים', now) > cutoff);     // streamed 2 years ago
assert(parseRelativeDate('לפני 10 שנים', now) < cutoff);         // 10 years ago
assert(parseRelativeDate('לפני שנה', now) > cutoff);             // 1 year ago (no digit)
assert.equal(parseRelativeDate('ערוץ כלשהו · 500 אלף צפיות', now), null);

assert(isTooNew('‫623K‏‬ צפיות • לפני שנתיים‬', now)); // bidi marks glued on
assert(isTooNew('974 · לפני 17 שע׳חדש', now));         // abbreviated hours + glued badge
assert(isTooNew('29K · לפני 5 ימיםחדש', now));         // "חדש" badge glued to unit word
assert(!isTooNew('1.5M צפיות · לפני 16 שנים', now));   // 2010, keep
assert(isTooNew('1,234 צופים', now));                            // live stream
assert(!isTooNew('500 אלף צפיות · לפני 9 שנים', now));

assert(isTooNew('1,234 watching · LIVE', now));
assert(isTooNew('1M views · 1 year ago', now));
assert(!isTooNew('500K views · 9 years ago', now));
assert(!isTooNew('Playlist · 40 videos', now)); // undated non-video tile stays visible

// Rewritten labels: distance from the cutoff, phrased as if today were 15/05/2019.
const cutoffMs = new Date('2019-05-15').getTime();
const delta = (iso) => cutoffMs - new Date(iso).getTime();
assert.equal(agoText(delta('2016-05-10'), true), 'לפני 3 שנים');
assert.equal(agoText(delta('2019-05-10'), true), 'לפני 5 ימים');
assert.equal(agoText(delta('2017-05-15'), true), 'לפני שנתיים');
assert.equal(agoText(delta('2018-05-15'), true), 'לפני שנה');
assert.equal(agoText(delta('2019-03-15'), true), 'לפני חודשיים');
assert.equal(agoText(delta('2016-05-10'), false), '3 years ago');
assert.equal(agoText(delta('2019-05-10'), false), '5 days ago');

// Abbreviated weeks; odometer digit-stacks must not parse
assert(isTooNew('363K לפני 3 שב׳', now));
assert.equal(parseRelativeDate('לפני 12345678901234567890123456789 שנים', now), null);

// Absolute dates from the watch-page tooltip
const heAbs = parseAbsoluteDate('33,828,611 צפיות • 4 ביוני 2012');
assert.equal(heAbs.date.getTime(), new Date(2012, 5, 4).getTime());
assert(heAbs.heb);
assert.equal(agoText(cutoffMs - heAbs.date.getTime(), true), 'לפני 6 שנים');
const enAbs = parseAbsoluteDate('33,828,611 views • Jun 4, 2012');
assert.equal(enAbs.date.getTime(), new Date(2012, 5, 4).getTime());
assert.equal(parseAbsoluteDate('no date here at all'), null);
const heAbbr = parseAbsoluteDate('10,371,633 צפיות • 16 בינו׳ 2011');
assert.equal(heAbbr.date.getTime(), new Date(2011, 0, 16).getTime());
assert.equal(parseAbsoluteDate('16 בטבת 2011'), null); // unknown month word: no guess

console.log('ok');
