function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

// Look up `key` in `table`: exact match first, then a substring pass (table key contained in the
// input OR input contained in a table key) so "stripe.js" finds "stripe" and "Electron Framework"
// finds "electron". Returns the explanation string or null. Never throws.
function lookup(table, key) {
  const k = norm(key);
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(table, k)) return table[k];
  for (const tk of Object.keys(table)) {
    if (!tk) continue;
    if (k.includes(tk) || tk.includes(k)) return table[tk];
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) macOS entitlements
// Keys are matched with or without the long `com.apple.security.` prefix (the prefix is stripped
// before lookup), so both "com.apple.security.device.camera" and "device.camera" resolve.
// ---------------------------------------------------------------------------

const ENTITLEMENTS = {
  // hardened-runtime code-execution exceptions (these WEAKEN security guarantees)
  'cs.allow-jit': 'allows just-in-time compiled code to run — normal for browsers/JS engines, but means the app generates and executes code at runtime',
  'cs.allow-unsigned-executable-memory': 'lets the app run unsigned code from writable memory — disables a key exploit mitigation; common in Electron/JIT apps but weakens hardening',
  'cs.disable-library-validation': 'can load unsigned or third-party code into its process — required by Electron and many plugins, but weakens code-signing guarantees',
  'cs.disable-executable-page-protection': 'disables protection on executable memory pages — a significant hardening exception, rarely needed legitimately',
  'cs.allow-dyld-environment-variables': 'honours DYLD_* environment variables, allowing libraries to be injected at launch — weakens isolation',
  'cs.debugger': 'is allowed to act as a debugger and attach to other processes — powerful; expected only in developer/debugging tools',
  'get-task-allow': 'allows other processes to attach and inspect/debug this app — normal for debug builds, but should NOT ship in a release',


  'app-sandbox': 'runs inside the macOS App Sandbox — its access to files, network and devices is restricted to what it explicitly requests (a good sign)',


  'network.client': 'can make outgoing network connections (act as a client) — e.g. call APIs or load web content',
  'network.server': 'can listen for incoming network connections (act as a server) — it can accept connections from other devices',


  'device.camera': 'grants access to the camera',
  'device.audio-input': 'grants access to the microphone / audio input',
  'device.microphone': 'grants access to the microphone',
  'device.usb': 'grants access to connected USB devices',
  'device.bluetooth': 'grants access to Bluetooth devices',
  'device.serial': 'grants access to serial ports',
  'device.print': 'grants access to printers',
  'device.audio-video-bridging': 'grants access to audio/video bridging (AVB) hardware',
  'device.firewire': 'grants access to FireWire devices',


  'personal-information.location': 'can read your location',
  'personal-information.addressbook': 'can read your Contacts',
  'personal-information.calendars': 'can read and write your Calendar',
  'personal-information.photos-library': 'can access your Photos library',


  'files.user-selected.read-only': 'can read files you explicitly choose in an open/save dialog (read-only)',
  'files.user-selected.read-write': 'can read and write files you explicitly choose in an open/save dialog',
  'files.user-selected.executable': 'can run executables you explicitly choose',
  'files.downloads.read-only': 'can read files in your Downloads folder',
  'files.downloads.read-write': 'can read and write files in your Downloads folder',
  'files.desktop.read-only': 'can read files on your Desktop',
  'files.desktop.read-write': 'can read and write files on your Desktop',
  'files.documents.read-only': 'can read files in your Documents folder',
  'files.documents.read-write': 'can read and write files in your Documents folder',
  'files.movies.read-write': 'can read and write files in your Movies folder',
  'files.music.read-write': 'can read and write files in your Music folder',
  'files.pictures.read-write': 'can read and write files in your Pictures folder',
  'files.all': 'has read/write access to ALL your files — a broad permission that effectively bypasses the sandbox file restrictions',
  'files.bookmarks.app-scope': 'can re-open files you previously granted access to (security-scoped bookmarks)',
  'files.bookmarks.document-scope': 'can re-open files tied to a specific document (security-scoped bookmarks)',


  'automation.apple-events': 'can send Apple Events to control or script OTHER applications — a powerful automation capability',
  'scripting-targets': 'declares which other apps it is allowed to script via Apple Events',
  'temporary-exception.apple-events': 'has a temporary exception to send Apple Events to specific apps',


  'keychain-access-groups': 'can store and read passwords/secrets in shared Keychain groups (can share credentials with related apps)',
  'application-groups': 'shares a container (files/preferences) with other apps in the same app group',


  'aps-environment': 'can receive Apple Push Notifications',
  'com.apple.developer.aps-environment': 'can receive Apple Push Notifications',
  'com.apple.developer.team-identifier': 'identifies the developer team that signed the app',
  'com.apple.developer.associated-domains': 'is linked to specific web domains (for universal links / password autofill)',
  'com.apple.developer.networking.networkextension': 'can run a network extension — e.g. a VPN, content filter or proxy that sees your traffic',
  'com.apple.developer.networking.vpn.api': 'can configure and run VPN connections',
  'com.apple.developer.healthkit': 'can read/write Health data',
  'com.apple.developer.homekit': 'can control HomeKit smart-home accessories',
  'com.apple.developer.icloud-services': 'uses iCloud services to sync data',
  'com.apple.developer.icloud-container-identifiers': 'stores data in iCloud containers',
  'com.apple.developer.ubiquity-kvstore-identifier': 'syncs key-value data via iCloud',
  'com.apple.developer.in-app-payments': 'can take payments via Apple Pay',
  'com.apple.developer.system-extension.install': 'can install a system extension — code that runs with elevated privileges at the OS level',
};


function entitlementKey(key) {
  let k = norm(key);
  k = k.replace(/^com\.apple\.security\./, '');
  return k;
}

export function explainEntitlement(key) {
  const k = entitlementKey(key);
  if (!k) return null;
  // exact on the (prefix-stripped) key, then fall back to the full original (covers com.apple.developer.*)
  if (Object.prototype.hasOwnProperty.call(ENTITLEMENTS, k)) return ENTITLEMENTS[k];
  return lookup(ENTITLEMENTS, norm(key)) || lookup(ENTITLEMENTS, k);
}

// ---------------------------------------------------------------------------
// 2) frameworks / libraries / runtimes
// ---------------------------------------------------------------------------

const FRAMEWORKS = {
  // Apple UI / app frameworks
  'appkit': 'Apple’s native macOS UI framework — this is a native Mac app',
  'uikit': 'Apple’s native iOS/iPadOS UI framework — built for iPhone/iPad (or Mac Catalyst)',
  'swiftui': 'Apple’s modern declarative UI framework — a native, recent Apple-platform app written largely in Swift',
  'catalyst': 'Mac Catalyst — an iPad app ported to run on macOS, so it uses iOS-style UI under the hood',
  'carbon': 'Carbon — a legacy Apple API; its presence suggests older code or backward-compatibility shims',


  'webkit': 'the WebKit browser engine — the app renders web content (it embeds a browser or is a browser)',
  'electron': 'Electron — the app is really a web app (HTML/JS/CSS) wrapped in a bundled Chromium browser and Node.js',
  'electron framework': 'Electron — the app is really a web app (HTML/JS/CSS) wrapped in a bundled Chromium browser and Node.js',
  'chromium': 'the Chromium browser engine — the app embeds a full Chrome-style web engine to render its UI',
  'cef': 'Chromium Embedded Framework — the app embeds Chromium to render web-based UI',
  'node': 'Node.js — bundled JavaScript runtime; the app runs JS logic outside the browser (typical of Electron apps)',
  'flutter': 'Flutter — a cross-platform UI toolkit from Google; the same codebase targets mobile/desktop/web',
  'qt': 'Qt — a cross-platform C++ UI framework; the app likely runs on multiple operating systems from one codebase',


  'sparkle': 'Sparkle — the popular open-source auto-update framework for Mac apps; the app can update itself outside the App Store',
  'squirrel': 'Squirrel — an auto-update framework (used by Electron apps); the app updates itself in the background',


  'coredata': 'Core Data — Apple’s local database/persistence layer; the app stores structured data on-device',
  'core data': 'Core Data — Apple’s local database/persistence layer; the app stores structured data on-device',
  'avfoundation': 'AVFoundation — Apple’s audio/video framework; the app plays, records or processes media',
  'coreml': 'Core ML — Apple’s on-device machine-learning framework; the app runs ML models locally',
  'core ml': 'Core ML — Apple’s on-device machine-learning framework; the app runs ML models locally',
  'metal': 'Metal — Apple’s low-level GPU graphics/compute API; the app does GPU-accelerated graphics or computation',
  'arkit': 'ARKit — Apple’s augmented-reality framework; the app uses the camera for AR experiences',
  'corelocation': 'Core Location — Apple’s location framework; the app determines the device’s location',
  'core location': 'Core Location — Apple’s location framework; the app determines the device’s location',
};

export function explainFramework(name) {
  return lookup(FRAMEWORKS, name);
}






const HEADERS = {
  'strict-transport-security': 'tells browsers to only ever connect over HTTPS, preventing downgrade and cookie-stealing attacks',
  'content-security-policy': 'restricts which sources of scripts, styles and other content the page may load — a strong defence against cross-site scripting (XSS)',
  'content-security-policy-report-only': 'monitors a Content-Security-Policy without enforcing it — violations are reported but not blocked (testing mode)',
  'x-frame-options': 'controls whether the page can be embedded in a frame on another site, protecting against clickjacking',
  'x-content-type-options': 'stops browsers from guessing (“sniffing”) a file’s type, preventing some content-type confusion attacks',
  'referrer-policy': 'controls how much of the referring URL is sent to other sites when users click links — a privacy/leak control',
  'permissions-policy': 'declares which browser features (camera, mic, geolocation, etc.) the page and its embeds are allowed to use',
  'feature-policy': 'older form of Permissions-Policy: declares which browser features the page may use',
  'cross-origin-opener-policy': 'isolates the page from other windows it opens, blocking a class of cross-window side-channel attacks',
  'cross-origin-embedder-policy': 'requires cross-origin resources to opt in before loading — enables stronger isolation (and powerful features like SharedArrayBuffer)',
  'cross-origin-resource-policy': 'controls which other sites are allowed to load this resource, limiting cross-site data leaks',
  'access-control-allow-origin': 'declares which other websites are allowed to read this response via JavaScript (CORS)',
  'set-cookie': 'sets a cookie in the browser — used for sessions, login state or tracking',
  'cache-control': 'tells browsers and CDNs how (and whether) to cache this response',
  'server': 'identifies the web server software — useful for fingerprinting, and a minor information leak if version is shown',
  'x-powered-by': 'reveals the backend technology powering the site — a minor information leak best removed',
  'x-xss-protection': 'a legacy browser XSS filter toggle — largely obsolete and superseded by Content-Security-Policy',
};


function refineHeader(name, value, base) {
  const n = norm(name);
  const v = norm(value);
  if (!v) return base;
  try {
    if (n === 'strict-transport-security') {
      const m = v.match(/max-age\s*=\s*(\d+)/);
      const age = m ? parseInt(m[1], 10) : 0;
      const sub = /includesubdomains/.test(v);
      const preload = /preload/.test(v);
      if (age === 0) return base + ' — but max-age=0 here DISABLES it';
      if (age >= 15552000 && sub) {
        return base + ` — strong: applies for ${Math.round(age / 86400)} days, includes subdomains${preload ? ' and is preload-eligible' : ''}`;
      }
      const span = age >= 86400 ? `${Math.round(age / 86400)} day(s)` : `${age} second(s) (very short)`;
      return base + ` — active for ${span}${sub ? ', includes subdomains' : ' (this host only)'}`;
    }
    if (n === 'x-frame-options') {
      if (/deny/.test(v)) return base + ' — set to DENY: cannot be framed anywhere (strongest)';
      if (/sameorigin/.test(v)) return base + ' — set to SAMEORIGIN: only this site may frame it';
      if (/allow-from/.test(v)) return base + ' — restricted to a specific allowed origin';
    }
    if (n === 'access-control-allow-origin') {
      if (v === '*') return base + ' — set to "*": ANY website may read this response (broadly permissive)';
      return base + ` — limited to: ${String(value).trim().slice(0, 80)}`;
    }
    if (n === 'cache-control') {
      if (/no-store/.test(v)) return base + ' — no-store: this response is never cached (typical for sensitive/private data)';
      if (/(private)/.test(v)) return base + ' — private: only the user’s browser may cache it, not shared caches/CDNs';
      if (/public/.test(v)) return base + ' — public: may be cached by shared caches/CDNs';
    }
    if (n === 'set-cookie') {
      const flags = [];
      if (/;\s*httponly/.test(v) || /\bhttponly\b/.test(v)) flags.push('HttpOnly (hidden from JavaScript)');
      if (/;\s*secure/.test(v) || /\bsecure\b/.test(v)) flags.push('Secure (HTTPS only)');
      const sm = v.match(/samesite\s*=\s*(strict|lax|none)/);
      if (sm) flags.push(`SameSite=${sm[1]}`);
      if (flags.length) return base + ' — ' + flags.join(', ');
    }
  } catch {
    return base;
  }
  return base;
}

export function explainHeader(name, value) {
  const base = lookup(HEADERS, name);
  if (!base) return null;
  return refineHeader(name, value, base);
}





const CSP = {
  'default-src': 'the fallback rule for any content type not given its own policy',
  'script-src': 'controls where JavaScript may be loaded and run from — the most security-critical directive (anti-XSS)',
  'script-src-elem': 'controls where <script> element sources may be loaded from',
  'script-src-attr': 'controls inline event-handler attributes (e.g. onclick) in the page',
  'style-src': 'controls where CSS/styles may be loaded from',
  'style-src-elem': 'controls where stylesheet sources may be loaded from',
  'img-src': 'controls where images may be loaded from',
  'font-src': 'controls where web fonts may be loaded from',
  'media-src': 'controls where audio and video may be loaded from',
  'connect-src': 'controls which servers the page may talk to via fetch/XHR/WebSocket — limits where data can be sent',
  'frame-src': 'controls which pages may be embedded in iframes',
  'child-src': 'controls iframes and web workers the page may create',
  'worker-src': 'controls where web workers and service workers may be loaded from',
  'frame-ancestors': 'controls which other sites may embed THIS page in a frame — modern anti-clickjacking control',
  'object-src': 'controls plugins like <object>/<embed> (usually set to none, since plugins are a risk)',
  'base-uri': 'restricts the <base> tag, blocking an attack that rewrites where relative URLs point',
  'form-action': 'restricts where forms on the page may submit data',
  'manifest-src': 'controls where the web app manifest may be loaded from',
  'prefetch-src': 'controls which resources may be prefetched',
  'upgrade-insecure-requests': 'automatically upgrades any http:// requests on the page to https://',
  'block-all-mixed-content': 'blocks any insecure http content on an https page',
  'report-uri': 'where the browser sends reports about policy violations (legacy reporting)',
  'report-to': 'where the browser sends reports about policy violations (modern reporting)',
  'sandbox': 'runs the page in a restricted sandbox, disabling scripts/forms/popups unless explicitly re-enabled',
  'require-trusted-types-for': 'requires Trusted Types for DOM sinks — a strong defence against DOM-based XSS',
  'trusted-types': 'defines allowed Trusted Types policies for safe DOM manipulation',
};

export function explainCsp(directive) {

  const first = norm(directive).split(/\s+/)[0];
  return lookup(CSP, first);
}





const SERVICES = {

  'stripe': 'Stripe — payment processing; the site can take card payments (card data goes to Stripe, not the site)',
  'paypal': 'PayPal — payment processing / checkout',
  'braintree': 'Braintree — payment processing (owned by PayPal)',
  'adyen': 'Adyen — payment processing',
  'square': 'Square — payment processing',


  'google analytics': 'Google Analytics — tracks visitor behaviour and traffic; sends usage data to Google',
  'google-analytics': 'Google Analytics — tracks visitor behaviour and traffic; sends usage data to Google',
  'ga': 'Google Analytics — tracks visitor behaviour and traffic; sends usage data to Google',
  'gtag': 'Google Analytics (gtag.js) — tracks visitor behaviour; sends usage data to Google',
  'gtm': 'Google Tag Manager — loads and manages other tracking/marketing tags on the page',
  'googletagmanager': 'Google Tag Manager — loads and manages other tracking/marketing tags on the page',
  'segment': 'Segment — collects user/event data and fans it out to many other analytics and marketing tools',
  'amplitude': 'Amplitude — product analytics; tracks how users move through the product',
  'mixpanel': 'Mixpanel — product analytics; tracks user events and funnels',
  'posthog': 'PostHog — product analytics (events, funnels, session replay), often self-hostable',
  'heap': 'Heap — product analytics that auto-captures user interactions',
  'hotjar': 'Hotjar — records sessions and heatmaps of how users interact with pages (privacy-sensitive)',
  'fullstory': 'FullStory — records full user sessions for analytics (privacy-sensitive)',


  'sentry': 'Sentry — error and crash monitoring; captures exceptions and performance data',
  'datadog': 'Datadog — application/infrastructure monitoring and logging',
  'new relic': 'New Relic — application performance monitoring',
  'newrelic': 'New Relic — application performance monitoring',
  'bugsnag': 'Bugsnag — error and crash monitoring',
  'rollbar': 'Rollbar — error monitoring and tracking',


  'firebase': 'Firebase — Google’s backend platform (database, auth, hosting, push); the app likely uses it for data and login',
  'auth0': 'Auth0 — hosted login/authentication; handles sign-in and identity',
  'clerk': 'Clerk — hosted user authentication and management',
  'cognito': 'AWS Cognito — Amazon’s hosted authentication and user pools',
  'okta': 'Okta — enterprise identity and single-sign-on provider',
  'supabase': 'Supabase — open-source backend platform (Postgres database, auth, storage)',


  'cloudflare': 'Cloudflare — CDN, DNS and security/DDoS protection sitting in front of the site',
  'fastly': 'Fastly — content delivery network (CDN) and edge caching',
  'akamai': 'Akamai — content delivery network (CDN) and edge security',
  'vercel': 'Vercel — hosting and edge network, commonly used with Next.js',
  'netlify': 'Netlify — hosting and edge network for web apps',


  'cloudinary': 'Cloudinary — image/video hosting, optimisation and transformation',
  'mux': 'Mux — video hosting and streaming infrastructure',
  'imgix': 'imgix — on-the-fly image optimisation and delivery',


  'intercom': 'Intercom — in-app customer support chat and messaging',
  'drift': 'Drift — customer support / sales chat widget',
  'zendesk': 'Zendesk — customer support and helpdesk (often the chat widget)',
  'crisp': 'Crisp — customer support chat widget',


  'mapbox': 'Mapbox — interactive maps and location services',
  'google maps': 'Google Maps — interactive maps and location services from Google',
  'googlemaps': 'Google Maps — interactive maps and location services from Google',


  'optimizely': 'Optimizely — A/B testing and experimentation platform',
  'launchdarkly': 'LaunchDarkly — feature-flag management (turns features on/off per user)',


  'google fonts': 'Google Fonts — hosted web fonts loaded from Google (can leak visitor info to Google)',
  'googlefonts': 'Google Fonts — hosted web fonts loaded from Google',
  'fonts.googleapis': 'Google Fonts — hosted web fonts loaded from Google',
  'typekit': 'Adobe Typekit/Fonts — hosted web fonts from Adobe',
  'fonts.gstatic': 'Google Fonts — the static asset host that serves Google web fonts',


  'doubleclick': 'DoubleClick (Google) — advertising and ad-targeting; tracks users across sites for ads',
  'google ads': 'Google Ads — advertising and conversion tracking',
  'googlesyndication': 'Google AdSense/Ads — serves ads and tracks ad performance',
  'facebook pixel': 'Facebook Pixel — Meta’s ad-tracking tag; tracks visitors for ad targeting and measurement',
  'fbq': 'Facebook Pixel — Meta’s ad-tracking tag; tracks visitors for ad targeting',
};

export function explainService(name) {
  return lookup(SERVICES, name);
}





const KINDS = {
  entitlement: explainEntitlement,
  framework: explainFramework,
  header: explainHeader,
  csp: explainCsp,
  service: explainService,
};



export function explainMany(kind, items) {
  const fn = KINDS[norm(kind)];
  const list = Array.isArray(items) ? items : [];
  if (!fn) return list.map((item) => ({ item, explanation: null }));
  return list.map((item) => {
    let explanation = null;
    try { explanation = fn(item); } catch { explanation = null; }
    return { item, explanation };
  });
}
