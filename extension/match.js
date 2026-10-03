// Seerr for YouTube — reads a YouTube video title: what it's a trailer for, whether it's a trailer,
// which language it's in, and whether it's for a video game. Then ranks Seerr's search results.
// Handles English, Japanese (including anime), Korean and Arabic titles.
(function (root) {
  'use strict';

  // JavaScript's \b only understands ASCII letters, so word edges are spelled out for Unicode.
  const S = '(?<![\\p{L}\\p{N}])';
  const E = '(?![\\p{L}\\p{N}])';
  const words = (src, flags = 'giu') => new RegExp(`${S}(?:${src})${E}`, flags);
  // Arabic alef is written several ways (ا أ إ آ); match all of them.
  const alef = (src) => src.replace(/[اأإآ]/g, '[اأإآ]');

  // ------------------------------------------------------------------ normalising

  // For the search query: full-width characters to normal ones (｜ → |, ２ → 2) and Arabic digits to 0-9.
  function base(raw) {
    return String(raw || '')
      .normalize('NFKC')
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
      .replace(/\u0640/g, '') // Arabic tatweel
      .replace(/\s+/g, ' ')
      .trim();
  }

  // For recognising words: also lower-case, accents and Arabic marks removed, alef forms folded.
  function fold(text) {
    return base(text).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');
  }

  // ------------------------------------------------------------------ vocabulary

  const ORDINALS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
  };
  const ORD_EN = 'one|two|three|four|five|six|seven|eight|nine|ten';
  const ORD_EN_TH = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth';
  const KANJI = '[一二三四五六七八九十]';
  const ORD_AR = 'الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر';

  // Season patterns, matched against the folded title. Each returns the season number.
  const SEASON_PATTERNS = [
    [new RegExp(`(?:season|series|saison|staffel|시즌|シーズン|الموسم|موسم)\\s*(\\d{1,2})${E}`, 'iu'), (m) => +m[1]],
    // Anime: "第2期", "2期", "第2シーズン", "2nd Season"
    [/第?\s*(\d{1,2})\s*(?:期|シーズン)/u, (m) => +m[1]],
    [new RegExp(`第?(${KANJI})(?:期|シーズン)`, 'u'), (m) => ORDINALS[m[1]]],
    [words('(\\d{1,2})(?:st|nd|rd|th) season', 'iu'), (m) => +m[1]],
    [words(`season (${ORD_EN})`, 'iu'), (m) => ORDINALS[m[1]]],
    [words(`(${ORD_EN_TH}) season`, 'iu'), (m) => ORDINALS[m[1]]],
    [words(`الموسم (${ORD_AR})`, 'iu'), (m) => ORDINALS[m[1]]],
  ];

  // The same season phrases, removed from the query (matched against the unfolded text).
  const SEASON_STRIP = [
    new RegExp(`(?:season|series|saison|staffel|시즌|シーズン|${alef('الموسم')}|موسم)\\s*\\d{1,2}${E}(?:\\s+من)?`, 'giu'),
    new RegExp(`第?\\s*(?:\\d{1,2}|${KANJI})\\s*(?:期|シーズン)`, 'gu'),
    words('\\d{1,2}(?:st|nd|rd|th) season'),
    words(`season (?:${ORD_EN})|(?:${ORD_EN_TH}) season`),
    words(`${alef('الموسم')} (?:${alef(ORD_AR)})(?:\\s+من)?`),
  ];

  const TRAILERISH = new RegExp([
    'trailers?', 'teasers?', 'first look', 'sneak peek', 'official clip',
    '予告', '特報', 'ティザー', 'トレーラー', '(?<![a-z0-9])pv(?![a-z0-9])', 'プロモーション映像',
    '예고편', '티저', '티져', '트레일러',
    'اعلان', 'تريلر', 'برومو',
  ].join('|'), 'iu');

  const TV_HINT = new RegExp(`${S}(?:tv series|limited series|miniseries|docuseries|series|episode|مسلسل|المسلسل|الموسم)${E}|시즌|드라마|tvアニメ|テレビアニメ|ドラマ|放送`, 'iu');
  const MOVIE_HINT = new RegExp(`${S}(?:movie|film|in theaters|in theatres|in cinemas|فيلم|لفيلم|الفيلم|السينما|دور العرض)${E}|영화|극장|개봉|劇場版|映画|劇場公開|公開`, 'iu');

  // Removed from each title segment (unfolded text, so the query keeps its original spelling).
  const NOISE = [
    // English
    words('(?:official|final|main|new|full|launch|date announcement|announcement|release date)\\s+(?:trailer|teaser)s?'),
    words('(?:trailer|teaser)\\s*#?\\s*\\d+'),
    words('official|exclusive|international|teaser|trailers?|clip|promo|sneak peek|first look|red band|hd|4k|uhd|imax'),
    // Japanese / anime (no spaces between words, so no word edges): "本予告", "第2弾PV", "ティザーPV"
    /(?:第\s*\d+\s*弾|最新|本|新|メイン|キャラクター|ティザー|ノンクレジット|公式)?\s*(?:予告編?|特報(?:映像)?|ティザー(?:映像|ビジュアル)?|トレーラー|プロモーション映像|(?<![a-z0-9])(?:pv|cm)(?![a-z0-9]))(?:\s*第\s*\d+\s*弾)?/giu,
    /第\s*\d+\s*弾|公式|映像解禁|解禁|放送開始|配信開始|放送決定|配信決定|放送中|配信中|日本語字幕|字幕版|吹替版?|ノンクレジット/gu,
    /^(?:(?:tv|テレビ)?アニメ(?:映画)?|映画)(?=\s|[『「【《〈<"“']|$)\s*/iu,
    // Korean (no spaces needed: "메인예고편")
    /(?:공식|메인|티저|런칭|파이널|하이라이트|스페셜|캐릭터|\d+\s*차)?\s*(?:예고편|티저|티져)/gu,
    /공식\s*영상|한글\s*자막|자막|더빙|풀\s*버전/gu,
    /^(?:영화|드라마|시리즈|애니메이션)\s+/u,
    // Arabic
    words(`(?:ال)?${alef('اعلان')}(?:\\s+(?:ال)?(?:رسمي|دعائي|تشويقي|ترويجي|نهائي|جديد|${alef('اول')}|ثاني))*`),
    words('تريلر|برومو|البرومو|رسمي|الرسمي|مترجمة?|مدبلجة?|حصري(?:ا|اً)?|بالعربي|بجودة عالية'),
    words('ل?(?:فيلم|مسلسل)|الفيلم|المسلسل'),
  ];

  // Whole segments that are just a platform or channel, e.g. "… | Official Trailer | Netflix".
  const REGION = '(?:\\s+(?:japan|jp|korea|kr|코리아|العربية|mena|arabia))?';
  const PLATFORM = new RegExp(`^(?:(?:netflix|prime video|amazon(?: prime video| mgm studios)?|hbo(?: max)?|max|disney\\+?|disney plus|apple tv\\+?|hulu|peacock|paramount\\+?|paramount(?: plus| pictures)?|crunchyroll(?: collection| dubs)?|netflix anime|funimation|hidive|aniplex(?: usa)?|toho animation|東宝アニメーション|kadokawa(?:anime| anime)?|アニプレックス|東映アニメーション|muse asia|ani-one asia|abema|u-next|dアニメストア|anime japan|a24|neon|marvel(?: entertainment| studios)?|dc|warner bros\\.?(?: pictures| tv)?|universal(?: pictures)?|sony pictures(?: entertainment)?|20th century studios|lionsgate(?: movies)?|focus features|searchlight pictures|pixar|disney|movieclips(?: trailers)?|rotten tomatoes(?: trailers)?|ign|fandango|amc\\+?|fx|bbc(?: one| iplayer)?|itv|channel 4|starz|showtime|mubi|shudder|넷플릭스|디즈니\\+?|쿠팡플레이|티빙|tving|웨이브|wavve|왓챠|watcha|애플\\s*tv\\+?|tvn|jtbc|sbs|kbs|mbc|cj enm|cj\\s*엔터테인먼트|롯데엔터테인먼트|쇼박스|플러스엠|نتفليكس|شاهد|shahid|osn\\+?|starzplay|ستارزبلاي|watch it|watchit|ديزني\\+?)${REGION})$`, 'iu');

  // Studio possessives at the start: "Marvel Studios' Thunderbolts*", "Disney and Pixar's Elio".
  const STUDIO_PREFIX = /^(?:marvel studios|marvel|disney(?: and pixar| & pixar)?|pixar|dreamworks(?: animation)?|netflix|hbo|apple tv\+?|amazon|illumination)['’]s?\s+/iu;

  // Title-like text inside brackets or quotes: 《파묘》, 『…』, 「…」, 〈…〉, '무빙', “…”.
  const QUOTED = /[《『「〈<“"]([^》』」〉>”"]{2,80})[》』」〉>”"]|(?:^|\s)['‘]([^'’]{2,80})['’](?=$|[\s|:,.!?-])/u;
  const SQUARE = /[[【]([^\]】]{2,80})[\]】]/gu;

  // ------------------------------------------------------------------ parsing

  function cleanSegment(seg) {
    let s = seg.replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ');
    for (const re of SEASON_STRIP) s = s.replace(re, ' ');
    for (const re of NOISE) s = s.replace(re, ' ');
    return s
      .replace(/#\s*\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s:,.\-–—|،]+|(?:\s[-–—]+|[\s:,|،])+$/gu, '') // a trailing dash only when it's a separator ("Title -"), not "-ReAwakening-"
      .replace(STUDIO_PREFIX, '')
      .trim();
  }

  const meaningful = (s) => (s.match(/[\p{L}\p{N}]/gu) || []).length >= 2;

  function querySegments(text) {
    for (const seg of text.split(/\s+[|•~\-–—/]+\s+|\s*\|\s*/u)) {
      const c = cleanSegment(seg);
      if (meaningful(c) && !PLATFORM.test(c)) return c;
    }
    return '';
  }

  function detectLang(text) {
    const t = String(text || '');
    if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u.test(t)) return 'ko';
    if (/[\u0600-\u06FF]/u.test(t)) return 'ar';
    if (/[\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FFF]/u.test(t)) return 'ja'; // kana or kanji
    return null; // English or unknown: Seerr uses its own language
  }

  function parseTitle(raw) {
    const title = base(raw);
    const folded = fold(raw);
    const hint = { type: null, year: null, season: null, trailingNumber: null };

    for (const [re, get] of SEASON_PATTERNS) {
      const m = folded.match(re);
      if (m) { hint.season = get(m) || null; hint.type = 'tv'; break; }
    }
    if (!hint.type && TV_HINT.test(folded)) hint.type = 'tv';
    if (!hint.type && MOVIE_HINT.test(folded)) hint.type = 'movie';

    const ym = title.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]/);
    if (ym) hint.year = Number(ym[1]);

    const lang = detectLang(title);

    // 1. A quoted or 《bracketed》 title wins if what's around it is only trailer words and
    //    platforms (common in Korean, and in titles like "'Wednesday' Season 2 | Netflix").
    let query = '';
    const q = title.match(QUOTED);
    if (q) {
      const inside = cleanSegment(q[1] || q[2]);
      const outside = querySegments(title.replace(q[0], ' '));
      if (meaningful(inside) && (!outside || lang === 'ko' || lang === 'ja')) query = inside;
      // Anime films: 劇場版『鬼滅の刃』無限城編 is its own entry, not the TV series, so keep the subtitle.
      if (query && lang === 'ja' && hint.type === 'movie') {
        const after = title.slice(title.indexOf(q[0]) + q[0].length).split(/\s*[|｜/]\s*|\s+[-–—]\s+/u)[0];
        const rest = cleanSegment(after);
        if (meaningful(rest)) query = `${query} ${rest}`;
      }
    }
    // 2. Otherwise the first segment that isn't just noise or a platform.
    if (!query) query = querySegments(title);
    // 3. Korean titles often put the name in [square brackets]: "[오징어 게임 시즌2] 공식 예고편".
    if (!query) {
      for (const m of title.matchAll(SQUARE)) {
        const c = cleanSegment(m[1]);
        if (meaningful(c) && !PLATFORM.test(c)) { query = c; break; }
      }
    }
    if (!query) query = cleanSegment(title);

    return { query, hint, lang, isTrailer: TRAILERISH.test(folded) || !!hint.season };
  }

  // ------------------------------------------------------------------ video games
  // Points for and against; 2 or more means "video game". YouTube's game card under the
  // description is the strongest sign. Bare words for "game" are never used, because shows
  // like Squid Game (오징어 게임, El juego del calamar, لعبة الحبار) have them in the title.

  const GAME_STRONG = [
    words('gameplay|game ?play trailer|(?:launch|reveal|announce(?:ment)?|accolades|gameplay) trailer'),
    words('ps5|ps4|playstation ?[45]|xbox series [xs](?:\\|s)?|xbox one|xbox game pass|game pass|nintendo switch(?: 2)?|switch 2|steam deck|epic games store'),
    words('(?:on|wishlist(?: it)? on|coming to|available on) steam|steam next fest'),
    words('the game awards|state of play|nintendo direct|xbox (?:games )?showcase|summer game fest|gamescom|playstation showcase'),
    words('pre-?order(?: now)?|early access|dlc|season pass|video ?game|game trailer|expansion pack'),
    /ゲームプレイ|プレイ動画|実機プレイ|体験版|ローンチトレーラー|ゲームトレーラー|ニンテンドースイッチ|プレイステーション/u,
    /게임\s*플레이|플레이\s*영상|출시\s*트레일러|런칭\s*트레일러|사전\s*(?:예약|등록)|플레이스테이션|닌텐도\s*스위치|엑스박스/u,
    /اسلوب اللعب|طريقة اللعب|طريقه اللعب|بلايستيشن|اكس ?بوكس|نينتندو|الطلب المسبق|لعبة فيديو|لعبه فيديو/u,
  ];
  const GAME_WEAK = [
    words('story trailer|cinematic trailer|multiplayer|co-?op|open beta|closed beta'),
    /트레일러|정식\s*출시/u,
  ];
  const NOT_GAME = [
    words('in theaters|in theatres|in cinemas|now streaming|streaming (?:on|now)|movie|film|series|season \\d+|episode'),
    /tvアニメ|テレビアニメ|アニメ化|アニメ映画|劇場版|映画|ドラマ|放送|第\s*\d+\s*期/u,
    /영화|극장|개봉|드라마|시즌\s*\d/u,
    words('فيلم|لفيلم|الفيلم|مسلسل|المسلسل|الموسم|السينما|دور العرض'),
  ];
  // Publishers and game events: they only post games.
  const GAME_CHANNEL = /^(?:rockstar games|ubisoft.*|electronic arts|ea sports.*|ea star wars|ea|bethesda.*|bandai namco.*|capcom.*|sega.*|square enix.*|blizzard entertainment|riot games|epic games|fortnite|activision|call of duty|2k(?: games)?|devolver digital|annapurna interactive|warner bros\.? games|wb games|cd projekt(?: red)?|konami|nexon.*|넥슨.*|ncsoft|엔씨소프트|netmarble|넷마블|krafton|크래프톤|smilegate|스마일게이트|hoyoverse|genshin impact|원신|honkai: star rail|mihoyo|valve|bungie|destiny 2|paradox interactive|thq nordic|focus entertainment|deep silver|team17|gearbox.*|the game awards|summer game fest|gamescom|true gaming|ترو جيمنج|カプコン|バンダイナムコ.*|セガ|コナミ|koei tecmo.*|コーエーテクモ.*|atlus.*|アトラス|スクウェア・エニックス.*|fromsoftware|level-5|レベルファイブ|原神.*)$/iu;
  // Console makers also post film and TV adaptations, so they only count a little.
  const PLATFORM_CHANNEL = /^(?:playstation|xbox|nintendo|任天堂|プレイステーション|플레이스테이션|한국닌텐도|닌텐도|엑스박스|بلايستيشن|نينتندو|اكس بوكس)/iu;

  function detectGame({ title = '', channel = '', hasGameCard = false } = {}) {
    const t = fold(title);
    const ch = fold(channel).trim();
    const hit = (re) => { re.lastIndex = 0; return re.test(t); };
    let score = 0;
    if (hasGameCard) score += 3;
    score += Math.min(4, GAME_STRONG.filter(hit).length * 2);
    if (GAME_WEAK.some(hit)) score += 1;
    if (GAME_CHANNEL.test(ch)) score += 2;
    else if (PLATFORM_CHANNEL.test(ch)) score += 1;
    if (NOT_GAME.some(hit)) score -= 2;
    return { isGame: score >= 2, score };
  }

  // ------------------------------------------------------------------ ranking

  function norm(s) {
    return fold(s).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (b.startsWith(a + ' ') || a.startsWith(b + ' ')) return 60;
    const A = new Set(a.split(' '));
    const B = new Set(b.split(' '));
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return Math.round((50 * 2 * inter) / (A.size + B.size));
  }

  function scoreResult(r, query, hint = {}) {
    const q = norm(query);
    const names = [r.title, r.name, r.originalTitle, r.originalName].filter(Boolean).map(norm);
    let s = Math.max(0, ...names.map((n) => similarity(q, n)));

    const year = parseInt(String(r.releaseDate || r.firstAirDate || '').slice(0, 4), 10);
    if (hint.year && year) s += year === hint.year ? 30 : Math.abs(year - hint.year) === 1 ? 10 : -15;
    if (hint.type) s += r.mediaType === hint.type ? 20 : -10;

    // Trailers are mostly for new releases, unless it's a new season of an older show.
    if (!hint.season && year && year >= new Date().getFullYear() - 1) s += 8;

    s += Math.min(12, Math.log10((r.popularity || 0) + 1) * 4);
    return s;
  }

  const api = { parseTitle, detectGame, detectLang, scoreResult, norm };
  root.SeerrMatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
