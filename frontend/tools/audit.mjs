import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const entry = join(root, 'index.html');
const html = readFileSync(entry, 'utf8');
const themeController = readFileSync(join(root, 'assets/wp-content/themes/bigxon/js/controller.js'), 'utf8');
const cms = readFileSync(join(root, 'assets/js/cms.js'), 'utf8');
const auth = readFileSync(join(root, 'assets/js/auth.js'), 'utf8');
const commerce = readFileSync(join(root, 'assets/js/commerce.js'), 'utf8');
const i18n = readFileSync(join(root, 'assets/js/i18n.js'), 'utf8');
const siteCss = readFileSync(join(root, 'assets/css/site.css'), 'utf8');
const accountCss = readFileSync(join(root, 'assets/css/account.css'), 'utf8');
const mobilePanels = readFileSync(join(root, 'assets/js/mobile-panels.js'), 'utf8');
const errors = [];
const warnings = [];
const checked = new Set();
const extensions = new Set(['.css', '.js', '.json', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.mp4', '.webm', '.avif']);

function checkFile(url, fromFile = entry) {
  const clean = url.replaceAll('\\/', '/').split(/[?#]/, 1)[0];
  if (!clean || /^(?:data:|https?:|\/\/|mailto:|tel:|#)/i.test(clean)) return;
  const looksLikeLocalAsset = /^(?:\.\/|\/)?assets\//.test(clean);
  if (!extensions.has(extname(clean).toLowerCase()) && clean !== './site.webmanifest' && !looksLikeLocalAsset) return;

  const target = clean.startsWith('/')
    ? normalize(join(root, clean.replace(/^\/+/, '')))
    : normalize(resolve(dirname(fromFile), clean));
  if (!target.startsWith(`${root}${sep}`) || checked.has(target)) return;
  checked.add(target);

  if (!existsSync(target) || !statSync(target).isFile()) {
    errors.push(`Missing asset: ${clean} (from ${target.replace(root, '.')})`);
    return;
  }

  if (extname(target).toLowerCase() === '.css') {
    const css = readFileSync(target, 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)/gi)) checkFile(match[1], target);
  }
}

for (const match of html.matchAll(/(?:src|href|poster|data-img|data-src)=["']([^"']+)|url\(\s*["']?([^"')]+)/gi)) {
  checkFile(match[1] || match[2]);
}
for (const match of html.matchAll(/srcset=["']([^"']+)/gi)) {
  for (const candidate of match[1].split(',')) checkFile(candidate.trim().split(/\s+/, 1)[0]);
}

for (const runtimeAsset of [
  './assets/wp-content/plugins/elementor/assets/js/shared-frontend-handlers.03caa53373b56d3bab67.bundle.min.js',
  './assets/wp-content/plugins/revslider/public/js/migration.js',
  './assets/wp-content/plugins/revslider/public/css/sr7.lp.css',
  './assets/wp-content/plugins/revslider/public/css/sr7.btns.css',
  './assets/wp-content/plugins/revslider/public/css/sr7.filters.css',
  './assets/wp-content/plugins/revslider/public/css/sr7.nav.css',
  './assets/wp-content/plugins/revslider/public/css/sr7.media.css',
  './assets/wp-content/plugins/revslider/public/css/preloaders/t5.css'
]) checkFile(runtimeAsset);

for (const brandAsset of [
  './assets/images/categories/logoSite.png',
  './assets/brand/favicon-32.png',
  './assets/brand/apple-touch-icon.png',
  './assets/brand/icon-192.png',
  './assets/brand/icon-512.png'
]) checkFile(brandAsset);

const categoryManifestPath = join(root, 'assets/images/categories/sources.json');
checkFile('./assets/images/categories/sources.json');
const categoryManifest = JSON.parse(readFileSync(categoryManifestPath, 'utf8'));
const categoryEntries = Object.entries(categoryManifest.items ?? {});
if (categoryEntries.length !== 41) errors.push(`Category media manifest must contain 41 entries, found ${categoryEntries.length}`);
if (new Set(categoryEntries.map(([, asset]) => asset.src)).size !== categoryEntries.length) errors.push('Category media paths must be unique');
for (const [route, asset] of categoryEntries) {
  const localUrl = `.${asset.src}`;
  checkFile(localUrl);
  if (asset.width !== 640 || asset.height !== 640 || !asset.alt || asset.source?.license !== 'CC0-1.0') {
    errors.push(`Invalid category media metadata: ${route}`);
  }
  const target = join(root, asset.src.replace(/^\/+/, ''));
  if (existsSync(target) && createHash('sha256').update(readFileSync(target)).digest('hex') !== asset.sha256) {
    errors.push(`Category media checksum mismatch: ${route}`);
  }
}
for (const route of ['/magaza/', '/endirimler/', '/kampaniyalar/', '/jurnal/', '/baki-club/', '/elanlar/', '/biznes/']) {
  const asset = categoryManifest.items[route];
  if (!asset || !html.includes(`src=".${asset.src}"`)) errors.push(`Homepage category photo missing: ${route}`);
}

const required = [
  ['one title', (html.match(/<title\b/gi) || []).length === 1],
  ['meta description', /<meta name="description" content="[^"]{50,160}"/i.test(html)],
  ['canonical URL', /<link rel="canonical" href="\/"/i.test(html)],
  ['indexable robots directive', /<meta name="robots" content="index, follow/i.test(html)],
  ['one H1', (html.match(/<h1\b/gi) || []).length === 1],
  ['main landmark', /<main\b[^>]*data-cms-region="main"/i.test(html)],
  ['Open Graph metadata', /property="og:title"/i.test(html)],
  ['structured data', /type="application\/ld\+json"/i.test(html)],
  ['Gündəlik Bakı metadata and schema branding', /property="og:site_name" content="Gündəlik Bakı"/.test(html) && /"@type":"WebSite","name":"Gündəlik Bakı"/.test(html) && !/Daily\s+Baku/i.test(html.replaceAll('Gündəlik Bakı Poçtu-Daily Baku Mail', ''))],
  ['Gündəlik Bakı logo', (html.match(/assets\/images\/categories\/logoSite\.png/gi) || []).length >= 6 && !/assets\/brand\/(?:daily-baku-logo\.svg|gundelik-baki-logo(?:-white)?\.png)/i.test(html)],
  ['brand favicon', /assets\/brand\/favicon-32\.png/i.test(html)],
  ['legacy language selectors removed', !/elementor-widget-et_language_switcher|class="current-lang"/i.test(html)],
  ['responsive custom AZ and EN language pickers', (html.match(/data-language-picker/g) || []).length === 2 && (html.match(/data-language-trigger/g) || []).length === 2 && (html.match(/data-language-option="az"/g) || []).length === 2 && (html.match(/data-language-option="en"/g) || []).length === 2 && !/data-language-select|db-language-switcher-label/.test(html)],
  ['language picker is centered with adjacent header controls', /\.db-language-switcher\s*\{[^}]*align-items:\s*center;[^}]*align-self:\s*center;/s.test(siteCss)],
  ['mobile language picker lives in the hamburger panel header', html.indexOf('class="db-language-switcher db-language-switcher-mobile"') > html.indexOf('class="mobile-container ') && html.indexOf('class="db-language-switcher db-language-switcher-mobile"') < html.indexOf('class="db-mobile-store-pane ')],
  ['language picker switches cleanly between desktop and hamburger layouts', /@media \(max-width: 1023px\)[\s\S]*?\.db-language-switcher-desktop\s*\{\s*display:\s*none;/s.test(siteCss) && siteCss.includes('.et-mobile-container-top > .db-language-switcher-mobile')],
  ['localization runtime loads before interactive homepage scripts', html.indexOf('./assets/js/i18n.js') > -1 && html.indexOf('./assets/js/i18n.js') < html.indexOf('./assets/js/commerce.js')],
  ['localization runtime persists and observes language state', /gundelikBakiLanguage/.test(i18n) && /SUPPORTED_LANGUAGES = new Set\(\['az', 'en'\]\)/.test(i18n) && /dailybaku:languagechange/.test(i18n) && /MutationObserver/.test(i18n)],
  ['dynamic homepage content uses the localization layer', /products = products\.map\(localizeProduct\)/.test(cms) && /posts = posts\.map\(localizePost\)/.test(cms) && /categories = categories\.map\(localizeCategory\)/.test(cms) && /dailybaku:languagechange/.test(cms)],
  ['commerce keeps canonical product data across language changes', /canonicalizeProduct/.test(i18n) && /canonicalizeProduct\(cleaned\)/.test(commerce) && /dailybaku:languagechange/.test(commerce)],
  ['footer Sitemap link removed', !/<a href="\/sitemap\.xml"[^>]*>/i.test(html)],
  ['footer payment logos disabled', /<!-- Payment method logos are intentionally disabled\.[\s\S]*?elementor-element-6d02874[\s\S]*?-->/i.test(html)],
  ['footer company identity', /Gündəlik Bakı Poçtu-Daily Baku Mail/.test(html) && /"Gündəlik Bakı" Panorama Reklam MMC nin satış platformasıdır/.test(html) && /VÖEN 2007614681/.test(html)],
  ['header login uses customer auth fields', /<form[^>]+data-auth-form="login"[^>]*>[\s\S]*?name="email"[\s\S]*?name="password"[\s\S]*?<\/form>/i.test(html)],
  ['vendor accounts enter the dedicated seller portal', /vendor_owner/.test(auth) && /vendor_staff/.test(auth) && /destination = '\/satici-paneli\/'/.test(auth)],
  ['management accounts use role-aware menus with logout', /ADMIN_PORTAL_ROLES/.test(auth) && /VENDOR_PORTAL_ROLES/.test(auth) && /renderPanelAccount/.test(auth) && /accountMenuMarkup/.test(auth) && /data-account-logout/.test(auth) && /DailyBakuPanelPath/.test(auth) && /panelLinks/.test(mobilePanels) && !/window\.location\.assign\(panelPath\)/.test(mobilePanels)],
  ['customer header account menu uses the redesigned accessible layout', /db-header-account-menu/.test(auth) && /navigationLabel = 'Hesab keçidləri'/.test(auth) && /db-header-account-logout/.test(auth) && /\.et__login\.db-customer-account \.login-box/.test(siteCss)],
  ['seller login is linked from desktop and mobile account entry points', /href="\/satici-girisi\/" class="db-header-vendor-login"/.test(html) && /db-mobile-panel-vendor[^>]*href="\/satici-girisi\/"|href="\/satici-girisi\/"[^>]*db-mobile-panel-vendor/.test(mobilePanels)],
  ['seller registration and login use dedicated auth APIs', /type === 'vendor-login'[\s\S]*authApi\('\/vendor-login'/.test(auth) && /type === 'vendor-register'[\s\S]*authApi\('\/vendor-register'/.test(auth)],
  ['customer and seller registration complete automatic sign-in', /type === 'register'[\s\S]*?authApi\('\/register'[\s\S]*?completeAuthentication\('\/hesabim\/'\)/.test(auth) && /type === 'vendor-register'[\s\S]*?authApi\('\/vendor-register'[\s\S]*?completeAuthentication\('\/satici-paneli\/'\)/.test(auth)],
  ['all public password inputs receive accessible visibility controls', /initializePasswordFields\(\)/.test(auth) && /Şifrəni göstər/.test(auth) && /MutationObserver/.test(auth) && /\.db-password-toggle/.test(siteCss)],
  ['seller registration consent remains left aligned', /\.db-auth-consent\{[^}]*justify-content:flex-start!important;[^}]*text-align:left!important/s.test(accountCss)],
  ['header login theme validation supports email inputs', /input\[type="email"\], input\[type="text"\]/.test(themeController)],
  ['Slider Revolution keyboard listener preserves editable fields', /__dailyBakuPatched/.test(html) && /hasKeyboardEvent/.test(html) && /active\.matches\('input, textarea, select/.test(html) && /defer data-wp-strategy="defer" id="tp-tools-js"/.test(html)],
  ['public contact phone', (html.match(/\+994 50 264 54 00/g) || []).length >= 3 && !/tel:(?:55555555|\+994120000000)/.test(html) && !/37499833889/.test(html)],
  ['public contact address', (html.match(/Cəfər Cabbarlı 33, AZ1065, Bakı\/Azərbaycan/g) || []).length >= 2 && !/Bakı şəhəri, Azərbaycan/.test(html)],
  ['demo product cards', (html.match(/class="db-product-card"/g) || []).length >= 20],
  ['featured product slider', /class="db-featured-track"/.test(html) && !/class="db-featured-controls"/.test(html)],
  ['popular product slider', /class="db-popular-track"/.test(html) && /data-popular-prev/.test(html) && /data-popular-next/.test(html) && /class="db-popular-pagination"/.test(html)],
  ['popular and top-picks sliders have 68 horizontal products', (html.match(/class="db-popular-card"/g) || []).length === 68],
  ['top-picks has four category sliders', (html.match(/data-top-picks-products/g) || []).length === 4 && (html.match(/class="db-top-picks-track"/g) || []).length === 4],
  ['top-picks category controls', /data-section-tab-title="Power Tools"/.test(html) && /data-section-tab-title="Hand Tools"/.test(html) && /data-section-tab-title="Air Tools"/.test(html) && /data-section-tab-title="Machine tools"/.test(html)],
  ['top-picks category controller updates panels directly', /function enhanceTopPicksTabs/.test(cms) && /panel\.classList\.toggle\('active', active\)/.test(cms) && /activate\(tabs\.indexOf\(selected\)\)/.test(cms)],
  ['Gündəlik Bakı news slider', /class="db-news-track"/.test(html) && /data-news-prev/.test(html) && /data-news-next/.test(html) && /class="db-news-pagination"/.test(html)],
  ['Gündəlik Bakı news slider has eight cards', (html.match(/class="db-news-card"/g) || []).length === 8],
  ['Gündəlik Bakı news cards have no hover actions', !/db-news-(?:actions?|wishlist|quick-view|whatsapp)/.test(html)],
  ['interactive sliders have 88 quick actions', (html.match(/data-quick-view=/g) || []).length === 88],
  ['interactive sliders have 88 WhatsApp actions', (html.match(/class="db-(?:product-action|popular-action) db-product-whatsapp"/g) || []).length === 88],
  ['featured compare action removed', !/db-product-compare|data-compare=/.test(html)]
];
for (const [name, valid] of required) if (!valid) errors.push(`SEO check failed: ${name}`);

for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
  if (!/\balt=["'][^"']*["']/i.test(match[0])) errors.push('Image without alt attribute');
  if (!/\b(?:loading="lazy"|fetchpriority="high")/i.test(match[0])) warnings.push('Image without an explicit loading priority');
}

for (const forbidden of [
  'theme-test.local',
  'enovathemes.com/bigxon/wp-content',
  'wp-admin/admin-ajax.php',
  '/?action=kirki-styles',
  '/?wc-ajax=',
  'platüçün',
  'perüçün',
  'Inüçün',
  '#mehsul-',
  '/product-category/',
  '/shop/',
  '/my-account/',
  'daily-baku-logo.svg',
  'cropped-favicon.webp',
  'xmlrpc.php',
  '<meta name="generator"'
]) {
  if (html.includes(forbidden)) errors.push(`Export residue found: ${forbidden}`);
}

console.log(`Checked ${checked.size} local asset dependencies.`);
console.log(`SEO checks: ${required.length - errors.filter((item) => item.startsWith('SEO check failed')).length}/${required.length} passed.`);
if (warnings.length) console.log(`Warnings: ${new Set(warnings).size} type(s), ${warnings.length} occurrence(s).`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Frontend audit passed.');
}
