// reverse-web-deep.mjs — the DEEP BEHAVIORAL layer for the web reverse-engineering report.
//
// The base `web` pass (reverse.mjs) already captures tech stack, raw network requests, and an AST
// pass over JS bundles. It does NOT explain WHAT the app does or HOW it works. This module adds that:
// third-party services, an API operation catalog with inferred purposes, an inferred data model,
// auth/session mechanics, security-header explanations, form/data-collection scan, storage/cookies,
// and a high-level "what it does" feature list.
//
// ETHICS: this only reads/analyzes data already fetched for an authorized target — no network I/O here.
//
// Public API (exact signature):
//   export function webDeepDive(ctx) -> { lines: string[], findings: object }
//
// `ctx` shape (any field may be missing/empty — be defensive):
//   {
//     url: string,
//     html: string,                 // raw fetched HTML (may be a logged-out shell)
//     headers: object,              // response headers, LOWERCASED keys (may include 'set-cookie')
//     scripts: string[],            // script src URLs
//     links: string[],              // <a href> URLs / route hints
//     content: object,              // already-extracted og/JSON-LD content (author/caption/video/etc.)
//     apiCalls: Array<{ method, path, status, contentType, reqContentType, friendlyName,
//                       graphql?: {doc_id, operationName, query_hash, query_snippet, variables_keys},
//                       bodyParamKeys?: string[] }>,
//     netData: { requests: Array<{ url, type, status, contentType, contentLength, body?,
//                                  requestHeaders?, postData? }>, html?: string } | null
//   }
//
// Returns { lines, findings }:
//   `lines`    — Markdown lines to append (## / ### headings, "- " bullets, fenced code as separate "```").
//   `findings` — structured object the caller's synthesis reads. KEYS (all may be empty / absent):
//     services        : Array<{ name, category, host, evidence }>   detected 3rd-party SDKs/services
//     serviceCategories : { [category]: string[] }                  service names grouped by category
//     apiCatalog      : Array<{ host, kind:'graphql'|'rest', name, method?, path?, operationName?,
//                               doc_id?, query_hash?, variableKeys?[], bodyParamKeys?[], status?,
//                               purpose }>                            every API op with an INFERRED purpose
//     apiHosts        : string[]                                    distinct API hosts seen
//     dataModel       : Array<{ entity, fields:string[], source }>  inferred entities + fields
//     auth            : { providers:string[], cookies:[{name,flags:[]}], tokenHeaders:string[],
//                         csrf:boolean, loginWall:boolean, notes:string[] }
//     security        : { headers:[{name,value,meaning}], csp?:{directives:{[k]:string[]}, notes:[]},
//                         flags:[{level:'strong'|'weak'|'info', text}] }
//     forms           : Array<{ action, method, fields:[{name,type}], sensitive:string[] }>
//     storage         : { cookies:[{name,flags:[]}], localStorage:boolean, sessionStorage:boolean,
//                         indexedDB:boolean, hints:string[] }
//     features        : string[]                                   high-level "what it does" inferences
//     error           : string                                     present only if a stage threw
//
// NEVER throws: everything is wrapped; on total failure returns { lines: [], findings: {} }.

// ----------------------------------------------------------------------------
// Small self-contained helpers (reimplemented locally to avoid importing reverse.mjs).
// ----------------------------------------------------------------------------

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return ''; }
}
function pathOf(u) {
  try { return new URL(u).pathname; } catch { return String(u || '').split('?')[0]; }
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function lc(s) { return String(s || '').toLowerCase(); }

// Headers may legitimately carry multiple Set-Cookie values as an array OR a single newline/comma
// joined string. Normalize to an array of cookie strings.
function setCookieList(headers) {
  const raw = headers && (headers['set-cookie'] ?? headers['Set-Cookie']);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  // A single string may contain several cookies; splitting on commas is unsafe (Expires uses commas),
  // so split on newlines first, then only on a comma that is followed by `<token>=` (a new cookie).
  return String(raw).split(/\n/).flatMap(s => s.split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/)).map(s => s.trim()).filter(Boolean);
}

// Parse one Set-Cookie header value into { name, flags }.
function parseCookie(cookieStr) {
  const parts = String(cookieStr).split(';').map(s => s.trim());
  const first = parts[0] || '';
  const name = first.split('=')[0] || first;
  const flags = [];
  const lower = parts.slice(1).map(lc);
  if (lower.includes('httponly')) flags.push('HttpOnly');
  if (lower.includes('secure')) flags.push('Secure');
  const ss = lower.find(p => p.startsWith('samesite='));
  if (ss) flags.push('SameSite=' + ss.split('=')[1]);
  if (lower.some(p => p.startsWith('domain='))) flags.push('Domain-scoped');
  if (lower.some(p => p.startsWith('max-age=') || p.startsWith('expires='))) flags.push('Persistent');
  return { name, flags };
}

// ----------------------------------------------------------------------------
// 1) Third-party services & SDKs — match by hostname pattern + inline global signature.
// Each entry: { name, category, hostRe, globalRe? } — hostRe matches a request/script host;
// globalRe (optional) matches inline HTML/JS for SDKs that load without an obvious external host.
// ----------------------------------------------------------------------------
const SERVICE_SIGNATURES = [
  // analytics
  { name: 'Google Analytics / GTM', category: 'analytics', hostRe: /(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|\bg\/collect)/, globalRe: /\b(gtag|dataLayer|ga\.getAll|GoogleAnalyticsObject)\b|UA-\d{4,}|G-[A-Z0-9]{6,}|GTM-[A-Z0-9]+/ },
  { name: 'Segment', category: 'analytics', hostRe: /(cdn\.segment\.com|api\.segment\.io)/, globalRe: /\banalytics\.(track|identify|page)\b|window\.analytics\b/ },
  { name: 'Amplitude', category: 'analytics', hostRe: /(amplitude\.com|cdn\.amplitude\.com|api\d*\.amplitude\.com)/, globalRe: /\bamplitude\.(getInstance|init|logEvent)\b/ },
  { name: 'Mixpanel', category: 'analytics', hostRe: /(mixpanel\.com|cdn\.mxpnl\.com|api\.mixpanel\.com)/, globalRe: /\bmixpanel\.(init|track)\b/ },
  { name: 'PostHog', category: 'analytics', hostRe: /(posthog\.com|app\.posthog\.com|i\.posthog\.com)/, globalRe: /\bposthog\.(init|capture)\b/ },
  { name: 'Heap', category: 'analytics', hostRe: /(heap(?:analytics)?\.com|cdn\.heapanalytics\.com)/, globalRe: /\bheap\.(load|track)\b/ },
  { name: 'Hotjar', category: 'analytics', hostRe: /(hotjar\.com|static\.hotjar\.com)/, globalRe: /\bhj\(|_hjSettings\b/ },
  { name: 'Plausible', category: 'analytics', hostRe: /plausible\.io/ },
  { name: 'Fathom', category: 'analytics', hostRe: /usefathom\.com/ },
  { name: 'Matomo / Piwik', category: 'analytics', hostRe: /(matomo|piwik)\b/, globalRe: /\b_paq\b|matomo\.js/ },
  // error / perf monitoring
  { name: 'Sentry', category: 'monitoring', hostRe: /(sentry\.io|sentry-cdn\.com|browser\.sentry-cdn\.com|ingest\.sentry\.io)/, globalRe: /\bSentry\.(init|captureException)\b|__SENTRY__/ },
  { name: 'Datadog', category: 'monitoring', hostRe: /(datadoghq\.com|datad0g\.com|browser-intake-datadoghq\.com)/, globalRe: /\bDD_RUM\b|datadogRum\b/ },
  { name: 'New Relic', category: 'monitoring', hostRe: /(newrelic\.com|nr-data\.net|js-agent\.newrelic\.com)/, globalRe: /\bNREUM\b|newrelic\b/ },
  { name: 'Bugsnag', category: 'monitoring', hostRe: /(bugsnag\.com|d2wy8f7a9ursnm\.cloudfront\.net)/, globalRe: /\bBugsnag\.(start|notify)\b/ },
  { name: 'LogRocket', category: 'monitoring', hostRe: /(logrocket\.(com|io)|cdn\.logrocket\.io)/, globalRe: /\bLogRocket\.(init)\b/ },
  // auth
  { name: 'Firebase Auth', category: 'auth', hostRe: /(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebaseapp\.com)/, globalRe: /firebase(?:\.auth)?\b|__FIREBASE_DEFAULTS__/ },
  { name: 'Auth0', category: 'auth', hostRe: /(auth0\.com|\.auth0\.com|cdn\.auth0\.com)/, globalRe: /\bauth0\b|Auth0Client\b/ },
  { name: 'Clerk', category: 'auth', hostRe: /(clerk\.(com|dev|accounts\.dev)|clerk\.[a-z0-9-]+\.lcl\.dev)/, globalRe: /\b__clerk|Clerk\b|data-clerk/ },
  { name: 'AWS Cognito', category: 'auth', hostRe: /(cognito-idp\.[a-z0-9-]+\.amazonaws\.com|cognito-identity\.[a-z0-9-]+\.amazonaws\.com)/, globalRe: /CognitoUserPool\b|AmazonCognito/ },
  { name: 'Okta', category: 'auth', hostRe: /(okta\.com|oktacdn\.com|\.okta\.com)/, globalRe: /\bOktaAuth\b|okta-signin/ },
  { name: 'Supabase', category: 'auth', hostRe: /(supabase\.co|supabase\.in)/, globalRe: /\bcreateClient\(|supabase(?:Url|Key|Client)\b/ },
  // payments
  { name: 'Stripe', category: 'payments', hostRe: /(js\.stripe\.com|api\.stripe\.com|stripe\.com|m\.stripe\.network)/, globalRe: /\bStripe\(|stripe\.elements\b/ },
  { name: 'PayPal', category: 'payments', hostRe: /(paypal\.com|paypalobjects\.com|www\.paypal\.com\/sdk)/, globalRe: /\bpaypal\.(Buttons|Checkout)\b/ },
  { name: 'Braintree', category: 'payments', hostRe: /(braintreegateway\.com|braintree-api\.com|js\.braintreegateway\.com)/, globalRe: /\bbraintree\.(client|setup)\b/ },
  { name: 'Adyen', category: 'payments', hostRe: /(adyen\.com|checkoutshopper-live\.adyen\.com|adyen\.net)/, globalRe: /\bAdyenCheckout\b/ },
  { name: 'Square', category: 'payments', hostRe: /(squareup\.com|squarecdn\.com)/, globalRe: /\bSqPaymentForm\b|window\.Square\b/ },
  // CDNs / hosting infra
  { name: 'Cloudflare', category: 'cdn', hostRe: /(cloudflare\.com|cdnjs\.cloudflare\.com|cdn-cgi)/ },
  { name: 'Fastly', category: 'cdn', hostRe: /(fastly\.net|fastly\.com)/ },
  { name: 'Akamai', category: 'cdn', hostRe: /(akamai(?:hd|ized)?\.net|akamai\.com|akamaitechnologies\.com)/ },
  { name: 'jsDelivr', category: 'cdn', hostRe: /cdn\.jsdelivr\.net/ },
  { name: 'unpkg', category: 'cdn', hostRe: /unpkg\.com/ },
  { name: 'AWS CloudFront', category: 'cdn', hostRe: /cloudfront\.net/ },
  { name: 'Vercel', category: 'cdn', hostRe: /(vercel-(?:insights|analytics)\.com|vercel\.app|vercel\.com)/ },
  // media
  { name: 'Cloudinary', category: 'media', hostRe: /(cloudinary\.com|res\.cloudinary\.com)/ },
  { name: 'Mux', category: 'media', hostRe: /(mux\.com|stream\.mux\.com|inferred\.litix\.io)/, globalRe: /\bmux\.player|hls\.js\b/ },
  { name: 'imgix', category: 'media', hostRe: /imgix\.net/ },
  { name: 'Vimeo', category: 'media', hostRe: /(vimeo\.com|vimeocdn\.com|player\.vimeo\.com)/ },
  { name: 'YouTube embed', category: 'media', hostRe: /(youtube\.com\/embed|youtube-nocookie\.com|ytimg\.com)/ },
  // maps
  { name: 'Google Maps', category: 'maps', hostRe: /(maps\.googleapis\.com|maps\.gstatic\.com|maps\.google\.com)/, globalRe: /\bgoogle\.maps\.(Map|Marker)\b/ },
  { name: 'Mapbox', category: 'maps', hostRe: /(mapbox\.com|api\.mapbox\.com|tiles\.mapbox\.com)/, globalRe: /\bmapboxgl\b/ },
  // chat / support
  { name: 'Intercom', category: 'support', hostRe: /(intercom\.io|intercomcdn\.com|widget\.intercom\.io)/, globalRe: /\bIntercom\(|intercomSettings\b/ },
  { name: 'Drift', category: 'support', hostRe: /(drift\.com|driftt\.com|js\.driftt\.com)/, globalRe: /\bdrift\.(load|on)\b/ },
  { name: 'Zendesk', category: 'support', hostRe: /(zendesk\.com|zdassets\.com|zopim\.com)/, globalRe: /\bzE\(|window\.zESettings\b/ },
  { name: 'Crisp', category: 'support', hostRe: /(crisp\.chat|client\.crisp\.chat)/, globalRe: /\$crisp\b|CRISP_WEBSITE_ID/ },
  // ads
  { name: 'Google Ads / DoubleClick', category: 'ads', hostRe: /(googlesyndication\.com|doubleclick\.net|googleadservices\.com|adservice\.google\.com)/, globalRe: /\badsbygoogle\b/ },
  { name: 'Facebook Pixel', category: 'ads', hostRe: /(connect\.facebook\.net|facebook\.com\/tr)/, globalRe: /\bfbq\(|_fbq\b/ },
  // fonts
  { name: 'Google Fonts', category: 'fonts', hostRe: /(fonts\.googleapis\.com|fonts\.gstatic\.com)/ },
  { name: 'Adobe Fonts (Typekit)', category: 'fonts', hostRe: /(use\.typekit\.net|typekit\.com|use\.typekit\.com)/, globalRe: /\bTypekit\b/ },
  // tag managers / A-B / flags
  { name: 'Optimizely', category: 'experimentation', hostRe: /(optimizely\.com|cdn\.optimizely\.com)/, globalRe: /\boptimizely\b|window\.optimizely\b/ },
  { name: 'LaunchDarkly', category: 'experimentation', hostRe: /(launchdarkly\.com|clientstream\.launchdarkly\.com|app\.launchdarkly\.com)/, globalRe: /\bLDClient\b|launchdarkly/ },
  { name: 'Split.io', category: 'experimentation', hostRe: /split\.io/, globalRe: /\bSplitFactory\b/ },
  { name: 'Segment Tag Manager', category: 'tagmanager', hostRe: /tagmanager\.google\.com/ },
];

function detectServices(scriptHosts, netHosts, inlineHtml) {
  const services = [];
  const seen = new Set();
  const allHosts = uniq([...scriptHosts, ...netHosts]);
  const html = inlineHtml || '';
  for (const sig of SERVICE_SIGNATURES) {
    let host = '';
    let evidence = '';
    const matchedHost = allHosts.find(h => sig.hostRe.test(h));
    if (matchedHost) { host = matchedHost; evidence = 'request host ' + matchedHost; }
    else if (sig.globalRe && sig.globalRe.test(html)) {
      const m = html.match(sig.globalRe);
      evidence = 'inline signature ' + (m ? JSON.stringify(m[0].slice(0, 40)) : sig.globalRe.source.slice(0, 40));
    }
    if (!host && !evidence) continue;
    if (seen.has(sig.name)) continue;
    seen.add(sig.name);
    services.push({ name: sig.name, category: sig.category, host: host || null, evidence });
  }
  return services;
}

// ----------------------------------------------------------------------------
// 2) API operation catalog — infer a purpose from each operation's name/path/params.
// ----------------------------------------------------------------------------
// Map keyword -> purpose phrase. Ordered loosely most-specific first within the scan.
const PURPOSE_KEYWORDS = [
  [/\b(login|signin|sign[-_]?in|authenticate|auth|session|token|oauth|sso|credential)\b/i, 'authentication / session'],
  [/\b(logout|signout|sign[-_]?out)\b/i, 'end session / logout'],
  [/\b(register|signup|sign[-_]?up|createaccount|onboard)\b/i, 'account registration'],
  [/\b(cart|checkout|order|purchase|payment|charge|subscription|invoice|billing|price|product|catalog|sku)\b/i, 'commerce / payments'],
  [/\b(feed|timeline|stream|home(?:root|feed)?|foryou|foryou|explore|discover)\b/i, 'loads a content feed'],
  [/\b(post|status|tweet|reel|story|stories|publish|compose|upload|media|attachment|photo|video)\b/i, 'create / fetch posts or media'],
  [/\b(comment|reply|thread)\b/i, 'comments / replies'],
  [/\b(like|react|favou?rite|upvote|vote)\b/i, 'reactions / likes'],
  [/\b(follow|unfollow|subscribe|friend|connection)\b/i, 'social graph (follow/connect)'],
  [/\b(message|dm|inbox|chat|conversation|thread)\b/i, 'direct messaging'],
  [/\b(notification|notif|alert|badge)\b/i, 'notifications'],
  [/\b(search|query|autocomplete|typeahead|suggest|lookup)\b/i, 'search / autocomplete'],
  [/\b(users?|profiles?|accounts?|me\b|viewer|whoami)\b/i, 'fetch user / profile data'],
  [/\b(settings|preference|config|profileedit|update.*profile)\b/i, 'read / write settings'],
  [/\b(analytics|track|event|log|metric|telemetry|beacon|collect|impression)\b/i, 'analytics / telemetry'],
  [/\b(graphql|gql|batch)\b/i, 'GraphQL data fetch'],
  [/\b(list|index|all|get.*s\b)\b/i, 'list a collection'],
  [/\b(create|add|new|insert)\b/i, 'create a record'],
  [/\b(update|edit|patch|modify|set)\b/i, 'update a record'],
  [/\b(delete|remove|destroy)\b/i, 'delete a record'],
];

function inferPurpose(name, method, path, varKeys) {
  // Split camelCase / PascalCase so `CheckoutCreateMutation` → "Checkout Create Mutation" and the
  // \bword\b keyword patterns can match the embedded words.
  const split = s => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const hay = [split(name), split(path), (varKeys || []).map(split).join(' ')].filter(Boolean).join(' ');
  for (const [re, purpose] of PURPOSE_KEYWORDS) {
    if (re.test(hay)) return purpose;
  }
  // Fall back on HTTP method semantics for REST without a telling name.
  const m = lc(method);
  if (m === 'post') return 'create / submit data';
  if (m === 'put' || m === 'patch') return 'update a record';
  if (m === 'delete') return 'delete a record';
  if (m === 'get') return 'fetch data';
  return 'unknown / general API call';
}

function buildApiCatalog(apiCalls, netRequests) {
  const catalog = [];
  const hosts = new Set();

  // From the caller-provided, already-summarized apiCalls (the richest source).
  for (const c of apiCalls) {
    if (!c) continue;
    const path = c.path || pathOf(c.url || '');
    // apiCalls may not carry a full url; derive host if present, else leave host inferred from path.
    let host = c.host || hostOf(c.url || '');
    if (host) hosts.add(host);
    if (c.graphql && (c.graphql.operationName || c.graphql.doc_id || c.graphql.query_hash || c.friendlyName)) {
      const name = c.friendlyName || c.graphql.operationName || c.graphql.fb_api_req_friendly_name || '(unnamed GraphQL op)';
      const varKeys = c.graphql.variables_keys || c.graphql.variableKeys || [];
      catalog.push({
        host: host || null, kind: 'graphql', name,
        operationName: c.graphql.operationName || null,
        doc_id: c.graphql.doc_id || null,
        query_hash: c.graphql.query_hash || null,
        variableKeys: varKeys,
        status: c.status ?? null,
        purpose: inferPurpose(name, c.method, path, varKeys),
      });
    } else {
      const name = c.friendlyName || path || c.method || '(api call)';
      catalog.push({
        host: host || null, kind: 'rest',
        name, method: c.method || null, path: path || null,
        bodyParamKeys: c.bodyParamKeys || [],
        status: c.status ?? null,
        purpose: inferPurpose(name, c.method, path, c.bodyParamKeys),
      });
    }
  }

  // Supplement from raw netData requests that look like API/XHR/fetch but weren't summarized above.
  const seenPaths = new Set(catalog.map(e => (e.host || '') + '|' + (e.path || e.name)));
  for (const r of netRequests) {
    if (!r || !r.url) continue;
    const type = lc(r.type);
    const ct = lc(r.contentType);
    const looksApi = /\/api\/|\/graphql|\/gql\b|\/ajax\//i.test(r.url) || ct.includes('application/json') || (type === 'fetch' || type === 'xhr');
    if (!looksApi) continue;
    const host = hostOf(r.url);
    const path = pathOf(r.url);
    // Skip plain static asset / media even if mislabeled.
    if (/\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|m4s|webm|ico)(?:[?#]|$)/i.test(r.url)) continue;
    const key = host + '|' + path;
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    if (host) hosts.add(host);
    const method = (r.postData ? 'POST' : 'GET');
    catalog.push({
      host: host || null, kind: 'rest', name: path || r.url,
      method, path, bodyParamKeys: [], status: r.status ?? null,
      purpose: inferPurpose(path, method, path, []),
    });
  }

  return { catalog, hosts: [...hosts] };
}

// ----------------------------------------------------------------------------
// 3) Data-model inference — entities + fields from GraphQL var keys, JSON bodies, og/JSON-LD content.
// ----------------------------------------------------------------------------
function inferDataModel(apiCatalog, netRequests, content) {
  const entities = new Map(); // entity name -> { fields:Set, source }

  const addEntity = (name, fields, source) => {
    const key = name.toLowerCase();
    if (!entities.has(key)) entities.set(key, { entity: name, fields: new Set(), source });
    const e = entities.get(key);
    for (const f of fields) if (f) e.fields.add(f);
  };

  // From GraphQL operation variable keys: a key like `userID`/`postId` hints at an entity.
  for (const op of apiCatalog) {
    const keys = op.variableKeys || op.bodyParamKeys || [];
    for (const k of keys) {
      const m = String(k).match(/^(\w+?)(?:_?id|Id|ID|_?ids|Ids)$/);
      if (m && m[1] && m[1].length > 1) {
        const ent = m[1].charAt(0).toUpperCase() + m[1].slice(1);
        addEntity(ent, ['id'], 'GraphQL/var key "' + k + '"');
      }
    }
  }

  // From JSON response bodies in netData: top-level object keys, and nested object field names.
  let bodiesScanned = 0;
  for (const r of netRequests) {
    if (bodiesScanned >= 12) break;
    const body = r && r.body;
    if (!body || typeof body !== 'string') continue;
    const t = body.trim();
    if (!(t.startsWith('{') || t.startsWith('['))) continue;
    let j;
    try { j = JSON.parse(t); } catch { continue; }
    bodiesScanned++;
    const scan = (obj, depth) => {
      if (!obj || typeof obj !== 'object' || depth > 3) return;
      if (Array.isArray(obj)) { if (obj.length) scan(obj[0], depth); return; }
      for (const [k, v] of Object.entries(obj)) {
        // A nested object whose key looks like an entity (user, author, post, item, node...) → entity.
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (/^(user|author|owner|post|item|node|product|order|account|profile|comment|media|page)s?$/i.test(k)) {
            const ent = k.charAt(0).toUpperCase() + k.slice(1).replace(/s$/, '');
            addEntity(ent, Object.keys(v).slice(0, 12), 'JSON response field "' + k + '"');
          }
          scan(v, depth + 1);
        } else if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
          const ent = k.charAt(0).toUpperCase() + k.slice(1).replace(/s$/, '');
          addEntity(ent, Object.keys(v[0]).slice(0, 12), 'JSON array "' + k + '"');
        }
      }
    };
    scan(j, 0);
  }

  // From og/JSON-LD content: the page is "about" a content item (Article/Video/Product/Profile).
  if (content && typeof content === 'object') {
    const fields = [];
    for (const k of ['type', 'title', 'description', 'author', 'image', 'video', 'audio', 'published', 'views', 'likes', 'comments', 'duration']) {
      if (content[k] != null && content[k] !== '' && !(Array.isArray(content[k]) && !content[k].length)) fields.push(k);
    }
    if (fields.length) {
      const ent = content.type ? String(content.type).replace(/[^a-zA-Z]/g, '') || 'Content' : 'Content';
      addEntity(ent.charAt(0).toUpperCase() + ent.slice(1), fields, 'page metadata (og/JSON-LD)');
    }
  }

  return [...entities.values()].map(e => ({ entity: e.entity, fields: [...e.fields], source: e.source }));
}

// ----------------------------------------------------------------------------
// 4) Auth & session mechanics.
// ----------------------------------------------------------------------------
const TOKEN_HEADER_RE = /^(authorization|x-csrf-token|x-xsrf-token|x-csrftoken|csrf-token|x-auth-token|x-api-key|x-access-token|x-session-token|x-id-token|x-clerk-.*|x-supabase-.*|apikey)$/i;

function analyzeAuth(headers, netRequests, services, cookies, loginWall) {
  const providers = uniq(services.filter(s => s.category === 'auth').map(s => s.name));
  const tokenHeaders = new Set();
  let csrf = false;
  for (const r of netRequests) {
    const rh = r && r.requestHeaders;
    if (!rh || typeof rh !== 'object') continue;
    for (const k of Object.keys(rh)) {
      const kl = lc(k);
      if (TOKEN_HEADER_RE.test(kl)) tokenHeaders.add(kl);
      if (/csrf|xsrf/.test(kl)) csrf = true;
    }
  }
  // CSRF token may also live in a cookie or a <meta> — note cookie-based CSRF.
  if (cookies.some(c => /csrf|xsrf/i.test(c.name))) csrf = true;

  const notes = [];
  if (providers.length) notes.push('Third-party auth provider(s): ' + providers.join(', ') + '.');
  const sessionCookies = cookies.filter(c => /sess|sid|auth|token|login|jwt|sso/i.test(c.name));
  if (sessionCookies.length) {
    const httpOnly = sessionCookies.filter(c => c.flags.includes('HttpOnly')).length;
    notes.push(`${sessionCookies.length} likely session cookie(s)` + (httpOnly ? `, ${httpOnly} HttpOnly (not readable by JS)` : ', none HttpOnly (readable by JS — weaker)') + '.');
  }
  if (tokenHeaders.has('authorization')) notes.push('Uses an Authorization header (bearer/token auth) on API calls.');
  if (csrf) notes.push('Sends a CSRF/XSRF token (defends against cross-site request forgery).');
  if (loginWall) notes.push('Page is gated behind a login wall — the fetched HTML is the logged-out shell.');
  if (!providers.length && !sessionCookies.length && !tokenHeaders.size && !loginWall) notes.push('No obvious auth mechanism observed (may be a public/static surface).');

  return { providers, cookies, tokenHeaders: [...tokenHeaders], csrf, loginWall, notes };
}

// ----------------------------------------------------------------------------
// 5) Security posture — parse + EXPLAIN security-relevant headers.
// ----------------------------------------------------------------------------
function parseCsp(value) {
  const directives = {};
  for (const part of String(value).split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const sp = seg.split(/\s+/);
    const name = lc(sp[0]);
    directives[name] = sp.slice(1);
  }
  const notes = [];
  const keys = ['default-src', 'script-src', 'connect-src', 'frame-ancestors', 'img-src', 'style-src', 'object-src', 'base-uri', 'form-action'];
  for (const k of keys) {
    if (!directives[k]) continue;
    const vals = directives[k];
    if (vals.includes("'unsafe-inline'")) notes.push(`${k} allows 'unsafe-inline' (inline scripts/styles permitted — weaker XSS protection).`);
    if (vals.includes("'unsafe-eval'")) notes.push(`${k} allows 'unsafe-eval' (eval permitted — weaker).`);
    if (vals.includes('*')) notes.push(`${k} allows '*' (any origin — very permissive).`);
  }
  if (directives['frame-ancestors']) {
    const fa = directives['frame-ancestors'];
    if (fa.includes("'none'")) notes.push("frame-ancestors 'none' — cannot be framed (clickjacking-protected).");
    else if (fa.includes("'self'")) notes.push("frame-ancestors 'self' — only same-origin framing allowed.");
  } else {
    notes.push('No frame-ancestors directive (clickjacking protection relies on X-Frame-Options if present).');
  }
  if (!directives['object-src']) notes.push('No object-src directive (plugins/embeds not explicitly restricted).');
  return { directives, notes };
}

function analyzeSecurity(headers) {
  const get = k => headers && (headers[k] ?? headers[k.toLowerCase()]);
  const out = { headers: [], csp: null, flags: [] };

  const csp = get('content-security-policy') || get('content-security-policy-report-only');
  if (csp) {
    out.csp = parseCsp(csp);
    const dirNames = Object.keys(out.csp.directives);
    out.headers.push({
      name: 'Content-Security-Policy', value: String(csp).slice(0, 300) + (String(csp).length > 300 ? '…' : ''),
      meaning: 'Restricts where scripts/styles/connections/frames may load from. Directives: ' + (dirNames.slice(0, 10).join(', ') || '(none parsed)') + '.',
    });
    out.flags.push({ level: 'strong', text: 'A Content-Security-Policy is present (mitigates XSS / data injection).' });
    if (out.csp.notes.some(n => /unsafe-inline|'\*'/.test(n))) out.flags.push({ level: 'weak', text: "CSP includes permissive sources ('unsafe-inline' / '*') — reduces its protective value." });
  } else {
    out.flags.push({ level: 'weak', text: 'No Content-Security-Policy header — page is more exposed to XSS / injection.' });
  }

  const hsts = get('strict-transport-security');
  if (hsts) {
    const maxAge = (String(hsts).match(/max-age=(\d+)/) || [])[1];
    out.headers.push({ name: 'Strict-Transport-Security', value: String(hsts), meaning: 'Forces HTTPS for ' + (maxAge ? `${Math.round(maxAge / 86400)} day(s)` : 'a set period') + (/includesubdomains/i.test(hsts) ? ', including subdomains' : '') + '.' });
    out.flags.push({ level: 'strong', text: 'HSTS enabled (browsers will refuse plain-HTTP connections).' });
  }

  const xfo = get('x-frame-options');
  if (xfo) out.headers.push({ name: 'X-Frame-Options', value: String(xfo), meaning: 'Controls whether the page can be embedded in a frame (' + String(xfo).toUpperCase() + ') — clickjacking defense.' });

  const xcto = get('x-content-type-options');
  if (xcto) out.headers.push({ name: 'X-Content-Type-Options', value: String(xcto), meaning: 'nosniff stops the browser from MIME-sniffing responses (blocks some content-type confusion attacks).' });

  const rp = get('referrer-policy');
  if (rp) out.headers.push({ name: 'Referrer-Policy', value: String(rp), meaning: 'Controls how much of the URL is sent as the Referer to other sites (' + String(rp) + ').' });

  const pp = get('permissions-policy') || get('feature-policy');
  if (pp) out.headers.push({ name: 'Permissions-Policy', value: String(pp).slice(0, 200) + (String(pp).length > 200 ? '…' : ''), meaning: 'Restricts which browser features (camera, mic, geolocation, etc.) the page may use.' });

  // CORS
  const acao = get('access-control-allow-origin');
  if (acao) {
    out.headers.push({ name: 'Access-Control-Allow-Origin', value: String(acao), meaning: 'Which origins may read responses cross-origin' + (String(acao).trim() === '*' ? ' — set to "*" (any origin can read; fine for public data, risky with credentials).' : '.') });
    if (String(acao).trim() === '*' && lc(get('access-control-allow-credentials') || '') === 'true') {
      out.flags.push({ level: 'weak', text: 'CORS allows any origin ("*") AND credentials — a misconfiguration risk.' });
    }
  }
  const acac = get('access-control-allow-credentials');
  if (acac) out.headers.push({ name: 'Access-Control-Allow-Credentials', value: String(acac), meaning: 'Whether cross-origin requests may carry cookies/credentials.' });

  if (!xfo && !(out.csp && out.csp.directives['frame-ancestors'])) out.flags.push({ level: 'weak', text: 'No clickjacking protection (neither X-Frame-Options nor CSP frame-ancestors).' });
  if (!xcto) out.flags.push({ level: 'info', text: 'No X-Content-Type-Options: nosniff header.' });

  return out;
}

// ----------------------------------------------------------------------------
// 6) Data collection / forms — scan HTML for <form> and their inputs.
// ----------------------------------------------------------------------------
const SENSITIVE_FIELD_RE = /pass(?:word|wd|code)|email|e-?mail|credit|card|cvv|cvc|ssn|social.?security|phone|tel|address|dob|birth|account|routing|iban|secret|otp|pin\b/i;

function scanForms(html) {
  const forms = [];
  if (!html) return forms;
  for (const fm of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = fm[1] || '';
    const inner = fm[2] || '';
    const action = (attrs.match(/\baction=["']([^"']*)["']/i) || [])[1] || '(same page)';
    const method = ((attrs.match(/\bmethod=["']([^"']*)["']/i) || [])[1] || 'GET').toUpperCase();
    const fields = [];
    for (const inp of inner.matchAll(/<input\b([^>]*)>/gi)) {
      const a = inp[1];
      const name = (a.match(/\bname=["']([^"']*)["']/i) || [])[1] || (a.match(/\bid=["']([^"']*)["']/i) || [])[1] || '(unnamed)';
      const type = (a.match(/\btype=["']([^"']*)["']/i) || [])[1] || 'text';
      if (/^(submit|button|hidden|image|reset)$/i.test(type) && name === '(unnamed)') continue;
      fields.push({ name, type: type.toLowerCase() });
    }
    for (const sel of inner.matchAll(/<select\b([^>]*)>/gi)) {
      const name = (sel[1].match(/\bname=["']([^"']*)["']/i) || [])[1] || '(unnamed)';
      fields.push({ name, type: 'select' });
    }
    for (const ta of inner.matchAll(/<textarea\b([^>]*)>/gi)) {
      const name = (ta[1].match(/\bname=["']([^"']*)["']/i) || [])[1] || '(unnamed)';
      fields.push({ name, type: 'textarea' });
    }
    const sensitive = uniq(fields.filter(f => f.type === 'password' || f.type === 'email' || SENSITIVE_FIELD_RE.test(f.name)).map(f => f.name));
    forms.push({ action, method, fields, sensitive });
  }
  return forms;
}

// ----------------------------------------------------------------------------
// 7) Storage & cookies.
// ----------------------------------------------------------------------------
function analyzeStorage(cookies, inlineHtml) {
  const html = inlineHtml || '';
  const localStorage = /\blocalStorage\.(getItem|setItem|removeItem)\b|window\.localStorage\b/.test(html);
  const sessionStorage = /\bsessionStorage\.(getItem|setItem|removeItem)\b|window\.sessionStorage\b/.test(html);
  const indexedDB = /\bindexedDB\.open\b|window\.indexedDB\b/.test(html);
  const hints = [];
  if (localStorage) hints.push('localStorage read/write detected in inline script.');
  if (sessionStorage) hints.push('sessionStorage read/write detected in inline script.');
  if (indexedDB) hints.push('IndexedDB usage detected in inline script.');
  if (/\bcaches\.(open|match)\b|serviceWorker\.register/.test(html)) hints.push('Service Worker / Cache API usage detected (offline / PWA capability).');
  return { cookies, localStorage, sessionStorage, indexedDB, hints };
}

// ----------------------------------------------------------------------------
// 8) "What it does" feature inference — synthesize from routes, API purposes, metadata, services.
// ----------------------------------------------------------------------------
function inferFeatures(links, apiCatalog, content, services, forms) {
  const feats = new Set();
  const add = (f) => feats.add(f);

  const hay = [
    ...(links || []),
    ...apiCatalog.map(o => (o.name || '') + ' ' + (o.path || '') + ' ' + (o.purpose || '')),
  ].join(' ').toLowerCase();

  if (/feed|timeline|stream|home|explore|discover|foryou/.test(hay)) add('Content feed / timeline');
  if (/message|\bdm\b|inbox|chat|conversation/.test(hay)) add('Direct messaging / chat');
  if (/upload|media|photo|video|attachment|compose|publish|post\b/.test(hay)) add('Media / content upload & publishing');
  if (/cart|checkout|order|payment|purchase|product|catalog|subscription|billing/.test(hay) || services.some(s => s.category === 'payments')) add('Payments / checkout / commerce');
  if (/search|query|autocomplete|typeahead|suggest/.test(hay)) add('Search');
  if (/follow|subscribe|friend|connection/.test(hay)) add('Social graph (follow / connect)');
  if (/comment|reply|thread/.test(hay)) add('Comments / discussion');
  if (/like|react|favou?rite|upvote|vote/.test(hay)) add('Reactions / likes');
  if (/notification|notif|alert/.test(hay)) add('Notifications');
  if (/login|signin|signup|register|auth|session|account|profile/.test(hay) || services.some(s => s.category === 'auth') || forms.some(f => f.sensitive.length)) add('User accounts / authentication');
  if (/settings|preference|config/.test(hay)) add('User settings / preferences');
  if (services.some(s => s.category === 'maps')) add('Maps / location features');
  if (services.some(s => s.category === 'support')) add('In-app chat / customer support');
  if (services.some(s => s.category === 'analytics')) add('User behavior analytics tracking');
  if (services.some(s => s.category === 'ads')) add('Advertising / ad tracking');

  // From page metadata content type.
  if (content && content.type) {
    const t = lc(content.type);
    if (/video/.test(t)) add('Video content / playback');
    if (/article|blog/.test(t)) add('Articles / written content');
    if (/product/.test(t)) add('Product listings');
    if (/profile/.test(t)) add('User profiles');
  }
  if (content && content.video) add('Video content / playback');

  return [...feats];
}

// ----------------------------------------------------------------------------
// Markdown rendering helpers.
// ----------------------------------------------------------------------------
function renderLines(f) {
  const L = [];
  L.push('## Deep Behavioral Analysis');
  L.push('');
  L.push('_This section infers behavior, services, data model and security from the fetched HTML, ' +
         'captured network traffic and response headers. Inferences are marked as such — they are ' +
         'best-effort, not authoritative._');
  L.push('');

  // 8) What it does (lead with the high-level answer)
  L.push('### What This Site Does (inferred)');
  if (f.features && f.features.length) {
    for (const feat of f.features) L.push('- ' + feat);
  } else L.push('- _Not enough signal to infer features._');
  L.push('');

  // 1) Services
  L.push('### Third-Party Services & SDKs');
  if (f.services && f.services.length) {
    const byCat = f.serviceCategories || {};
    for (const cat of Object.keys(byCat).sort()) {
      L.push(`- **${cat}:** ${byCat[cat].join(', ')}`);
    }
    L.push('');
    L.push('| Service | Category | Host | Evidence |');
    L.push('| --- | --- | --- | --- |');
    for (const s of f.services) L.push(`| ${s.name} | ${s.category} | ${s.host || '—'} | ${s.evidence} |`);
  } else L.push('- _No known third-party services detected._');
  L.push('');

  // 2) API catalog
  L.push('### API Operation Catalog');
  const gql = (f.apiCatalog || []).filter(o => o.kind === 'graphql');
  const rest = (f.apiCatalog || []).filter(o => o.kind === 'rest');
  if (gql.length) {
    L.push('#### GraphQL operations');
    L.push('| Operation | doc_id / hash | Variables | Inferred purpose |');
    L.push('| --- | --- | --- | --- |');
    for (const o of gql) {
      const id = o.doc_id || o.query_hash || '—';
      const vars = (o.variableKeys || []).slice(0, 8).join(', ') || '—';
      L.push(`| ${o.name} | ${id} | ${vars} | ${o.purpose} |`);
    }
    L.push('');
  }
  if (rest.length) {
    L.push('#### REST / HTTP operations');
    L.push('| Method | Path | Host | Body params | Inferred purpose |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const o of rest) {
      const bp = (o.bodyParamKeys || []).slice(0, 8).join(', ') || '—';
      L.push(`| ${o.method || '?'} | ${o.path || o.name} | ${o.host || '—'} | ${bp} | ${o.purpose} |`);
    }
    L.push('');
  }
  if (!gql.length && !rest.length) { L.push('- _No API operations observed._'); L.push(''); }

  // 3) Data model
  L.push('### Inferred Data Model');
  L.push('_Entities and fields below are INFERRED from request/response shapes and metadata — names are guesses._');
  if (f.dataModel && f.dataModel.length) {
    for (const e of f.dataModel) {
      const fields = e.fields.length ? ` { ${e.fields.slice(0, 14).join(', ')} }` : '';
      L.push(`- **${e.entity}**${fields} — _from ${e.source}_`);
    }
  } else L.push('- _No data-model signal found._');
  L.push('');

  // 4) Auth
  L.push('### Authentication & Session Mechanics');
  if (f.auth && f.auth.notes && f.auth.notes.length) {
    for (const n of f.auth.notes) L.push('- ' + n);
  } else L.push('- _No auth signal found._');
  L.push('');

  // 5) Security
  L.push('### Security Posture');
  if (f.security && f.security.headers && f.security.headers.length) {
    for (const h of f.security.headers) {
      L.push(`- **${h.name}:** ${h.meaning}`);
      L.push('  - `' + h.value + '`');
    }
  } else L.push('- _No security headers present._');
  if (f.security && f.security.csp && f.security.csp.notes && f.security.csp.notes.length) {
    L.push('');
    L.push('CSP observations:');
    for (const n of f.security.csp.notes) L.push('- ' + n);
  }
  if (f.security && f.security.flags && f.security.flags.length) {
    L.push('');
    L.push('Posture flags:');
    for (const fl of f.security.flags) L.push(`- [${fl.level}] ${fl.text}`);
  }
  L.push('');

  // 6) Forms
  L.push('### Data Collection (Forms)');
  if (f.forms && f.forms.length) {
    for (const fm of f.forms) {
      const flds = fm.fields.map(x => `${x.name} (${x.type})`).join(', ') || '(no named fields)';
      L.push(`- **${fm.method} → ${fm.action}** collects: ${flds}` + (fm.sensitive.length ? `  — sensitive: ${fm.sensitive.join(', ')}` : ''));
    }
  } else L.push('- _No forms found in HTML._');
  L.push('');

  // 7) Storage & cookies
  L.push('### Storage & Cookies');
  if (f.storage && f.storage.cookies && f.storage.cookies.length) {
    for (const c of f.storage.cookies) L.push(`- Cookie **${c.name}**` + (c.flags.length ? ` — ${c.flags.join(', ')}` : ' — no flags'));
  } else L.push('- _No cookies set in response._');
  if (f.storage && f.storage.hints && f.storage.hints.length) {
    for (const h of f.storage.hints) L.push('- ' + h);
  }
  L.push('');

  return L;
}

// ----------------------------------------------------------------------------
// Main export.
// ----------------------------------------------------------------------------
export function webDeepDive(ctx) {
  try {
    ctx = ctx || {};
    const html = typeof ctx.html === 'string' ? ctx.html : '';
    const headers = (ctx.headers && typeof ctx.headers === 'object') ? ctx.headers : {};
    const scripts = Array.isArray(ctx.scripts) ? ctx.scripts : [];
    const links = Array.isArray(ctx.links) ? ctx.links : [];
    const content = (ctx.content && typeof ctx.content === 'object') ? ctx.content : {};
    const apiCalls = Array.isArray(ctx.apiCalls) ? ctx.apiCalls : [];
    const netData = (ctx.netData && typeof ctx.netData === 'object') ? ctx.netData : null;
    const netRequests = (netData && Array.isArray(netData.requests)) ? netData.requests : [];
    // Inline HTML pool for signature matching: the fetched HTML plus any netData-captured HTML.
    const inlineHtml = html + (netData && typeof netData.html === 'string' ? '\n' + netData.html : '');

    const findings = {};

    // Helper: run a stage, never let one failure kill the rest.
    const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

    // Hosts.
    const scriptHosts = uniq(scripts.map(hostOf));
    const netHosts = uniq(netRequests.map(r => hostOf(r && r.url)));

    // 1) services
    const services = safe(() => detectServices(scriptHosts, netHosts, inlineHtml), []);
    const serviceCategories = {};
    for (const s of services) (serviceCategories[s.category] ||= []).push(s.name);
    findings.services = services;
    findings.serviceCategories = serviceCategories;

    // 2) API catalog
    const { catalog: apiCatalog, hosts: apiHosts } = safe(() => buildApiCatalog(apiCalls, netRequests), { catalog: [], hosts: [] });
    findings.apiCatalog = apiCatalog;
    findings.apiHosts = apiHosts;

    // 3) data model
    findings.dataModel = safe(() => inferDataModel(apiCatalog, netRequests, content), []);

    // cookies (shared by auth + storage)
    const cookies = safe(() => setCookieList(headers).map(parseCookie), []);

    // login wall (defensive — reimplement the simple check locally)
    const loginWall = safe(() => {
      const finalUrl = ctx.url || '';
      const byUrl = /\/(accounts\/)?login\b|\/login\/|[?&](next|__coig_login)=|\/signin\b|auth0|oauth\/authorize|\/sso\//i.test(finalUrl);
      const byForm = /<input[^>]+type=["']password["']/i.test(html) && /\b(log[\s-]?in|sign[\s-]?in|password)\b/i.test(html);
      const byMarker = /PolarisLoggedOut|LoggedOutRoot|LoginForm|LoginAndSignup|__coig_login|BarcelonaLoggedOut/i.test(html);
      return byUrl || byForm || byMarker;
    }, false);

    // 4) auth
    findings.auth = safe(() => analyzeAuth(headers, netRequests, services, cookies, loginWall),
      { providers: [], cookies, tokenHeaders: [], csrf: false, loginWall, notes: [] });

    // 5) security
    findings.security = safe(() => analyzeSecurity(headers), { headers: [], csp: null, flags: [] });

    // 6) forms
    findings.forms = safe(() => scanForms(html), []);

    // 7) storage
    findings.storage = safe(() => analyzeStorage(cookies, inlineHtml),
      { cookies, localStorage: false, sessionStorage: false, indexedDB: false, hints: [] });

    // 8) features
    findings.features = safe(() => inferFeatures(links, apiCatalog, content, services, findings.forms), []);

    const lines = safe(() => renderLines(findings), []);
    return { lines, findings };
  } catch (err) {
    return { lines: [], findings: { error: String(err && err.message || err) } };
  }
}

// ----------------------------------------------------------------------------
// Self-test (run directly: `node reverse-web-deep.mjs`). Not executed on import.
// ----------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = {
    url: 'https://shop.example.com/checkout',
    html: `<!doctype html><html><head>
      <meta property="og:type" content="product">
      <meta property="og:title" content="Cool Sneakers">
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
      <script src="https://js.stripe.com/v3/"></script>
      <script>window.localStorage.setItem('cart','1'); var s = Stripe('pk_test_x');</script>
      </head><body>
      <form action="/api/login" method="post">
        <input name="email" type="email">
        <input name="password" type="password">
        <input type="submit" value="Sign in">
      </form>
      <form action="/api/checkout" method="post">
        <input name="card_number" type="text">
        <input name="cvv" type="text">
        <select name="country"></select>
      </form>
      <a href="/feed">Feed</a><a href="/search">Search</a><a href="/messages">DMs</a>
      </body></html>`,
    headers: {
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; connect-src 'self' https://api.stripe.com; frame-ancestors 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'set-cookie': ['sessionid=abc; HttpOnly; Secure; SameSite=Lax', 'csrftoken=xyz; Secure'],
    },
    scripts: ['https://www.googletagmanager.com/gtm.js?id=GTM-ABC123', 'https://js.stripe.com/v3/'],
    links: ['/feed', '/search', '/messages'],
    content: { type: 'product', title: 'Cool Sneakers' },
    apiCalls: [
      { method: 'POST', path: '/graphql', status: 200, friendlyName: 'CheckoutCreateMutation',
        graphql: { operationName: 'CheckoutCreateMutation', doc_id: '998877', variables_keys: ['cartId', 'userID'] } },
      { method: 'GET', path: '/api/v1/users/42', status: 200, bodyParamKeys: [] },
    ],
    netData: { requests: [
      { url: 'https://shop.example.com/api/v1/products', type: 'fetch', status: 200, contentType: 'application/json',
        body: '{"products":[{"id":1,"name":"Sneaker","price":99,"sku":"SNK-1"}]}' },
      { url: 'https://api.stripe.com/v1/payment_intents', type: 'xhr', status: 200, contentType: 'application/json',
        requestHeaders: { 'authorization': 'Bearer sk_x', 'x-csrf-token': 't' } },
    ] },
  };

  const r = webDeepDive(ctx);
  console.log('=== findings keys ===');
  console.log(Object.keys(r.findings).join(', '));
  console.log('\n=== services ===');
  console.log(JSON.stringify(r.findings.services, null, 2));
  console.log('\n=== apiCatalog ===');
  console.log(JSON.stringify(r.findings.apiCatalog, null, 2));
  console.log('\n=== features ===');
  console.log(JSON.stringify(r.findings.features));
  console.log('\n=== auth notes ===');
  console.log(JSON.stringify(r.findings.auth.notes, null, 2));
  console.log('\n=== security flags ===');
  console.log(JSON.stringify(r.findings.security.flags, null, 2));
  console.log('\n=== sample lines ===');
  console.log(r.lines.slice(0, 45).join('\n'));

  console.log('\n=== empty ctx test ===');
  const empty = webDeepDive({});
  console.log('lines:', empty.lines.length, 'findingsKeys:', Object.keys(empty.findings).length);
  const nothing = webDeepDive();
  console.log('no-arg lines:', nothing.lines.length);
}
