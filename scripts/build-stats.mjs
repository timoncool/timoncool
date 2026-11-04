// Builds the profile's stats.json, the SVG cards and the localized README files, once a day from a GitHub Action.
// The ONE source of the usage numbers is the hub's /v1/public; the development numbers come from the GitHub API.
// Everything downstream (the studios' stats.html, the donate blocks) reads the stats.json this writes — nothing is hardcoded.
//
// Env: GITHUB_TOKEN (the Action's token). Optional: HUB_URL (default below), HUB_FILE (a local /v1/public json, for testing).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HUB_URL = process.env.HUB_URL || 'https://studio-hub.timoncool.workers.dev/v1/public';
const LOGIN = 'timoncool';
// a studio stats page to link the usage numbers to (any studio site serves the same stats.json)
const STATS_PAGE = 'https://timoncool.github.io/YuE2-Studio/stats.html';

// The featured studios, in order, with the hub id that carries their usage. Stars/releases are merged from GitHub.
const FEATURED = [
  { id: 'yue2', repo: 'YuE2-Studio', name: 'YuE2 Studio', desc: 'Full songs with vocals from a prompt, an editable piano-roll score, covers and karaoke clips.' },
  { id: 'ace', repo: 'ACE-Step-Studio', name: 'ACE-Step Studio', desc: 'A local Suno — songs with vocals, covers and music videos, all generated on your own machine.' },
  { id: 'dub', repo: 'dub-studio', name: 'Dub Studio', desc: 'Open-source CapCut for AI dubbing: re-voice any video into another language with a cloned voice.' },
  { id: 'minimax', repo: 'MiniMax-Music3-Studio', name: 'MiniMax Music3', desc: 'A native local music studio built on MiniMax Music 3, with optional cloud models.' },
  { id: 'speech', repo: 'speech-studio', name: 'Speech Studio', desc: 'Text-to-speech, voice cloning, audiobooks and speech recognition — five engines, fully local.' },
  { id: 'bulka', repo: 'Bulka', name: 'Bulka', desc: 'Live-code music in the browser: a Strudel fork with a built-in AI agent that writes patterns with you.' },
  { id: 'dungeon', repo: 'dungeon-ultimate', name: 'Dungeon Ultimate', desc: 'An offline AI dungeon master — D&D mechanics, 3D dice, image generation and voice, no internet.' },
];

const LANGS = ['en', 'ru', 'zh', 'ja', 'ko', 'pt', 'es', 'fr'];
const LANGNAME = { en: 'English', ru: 'Русский', zh: '中文', ja: '日本語', ko: '한국어', pt: 'Português', es: 'Español', fr: 'Français' };
// the README chrome, translated; project names and descriptions stay in English (proper nouns / common on GitHub)
const T = {
  en: { eyebrow: 'LIVE USAGE', people: 'people', installs: 'installs', countries: 'countries', languages: 'languages', tel_h: 'Who uses my apps', tel_see: 'See the live usage stats →', dev_h: 'The work', dev_sub: 'GitHub · last 12 months', issues: 'issues closed', commits: 'commits', pulls: 'pull requests', releases: 'releases', stars: 'stars', updated: 'Updated', foot: 'Usage numbers update daily from anonymous, opt-in stats.' },
  ru: { eyebrow: 'ЖИВАЯ СТАТИСТИКА', people: 'человек', installs: 'установок', countries: 'стран', languages: 'языков', tel_h: 'Кто пользуется приложениями', tel_see: 'Открытая статистика вживую →', dev_h: 'Работа над проектами', dev_sub: 'GitHub · за 12 месяцев', issues: 'ишью закрыто', commits: 'коммитов', pulls: 'пулл-реквестов', releases: 'релизов', stars: 'звёзд', updated: 'Обновлено', foot: 'Числа использования обновляются раз в сутки из анонимной статистики.' },
  zh: { eyebrow: '实时使用', people: '人', installs: '次安装', countries: '个国家', languages: '种语言', tel_h: '谁在使用我的应用', tel_see: '查看实时使用统计 →', dev_h: '项目工作', dev_sub: 'GitHub · 过去 12 个月', issues: '个 issue 已解决', commits: '次提交', pulls: '个 PR', releases: '个版本', stars: '个 star', updated: '更新于', foot: '使用数据每天从匿名统计更新。' },
  ja: { eyebrow: 'リアルタイム利用', people: '人', installs: 'インストール', countries: 'か国', languages: '言語', tel_h: '誰が使っているか', tel_see: 'ライブの利用統計を見る →', dev_h: 'プロジェクトの作業', dev_sub: 'GitHub · 過去12か月', issues: '件の課題を解決', commits: 'コミット', pulls: 'プルリク', releases: 'リリース', stars: 'スター', updated: '更新', foot: '利用数は匿名の統計から毎日更新されます。' },
  ko: { eyebrow: '실시간 사용', people: '명', installs: '설치', countries: '개국', languages: '개 언어', tel_h: '누가 사용하나', tel_see: '실시간 사용 통계 보기 →', dev_h: '프로젝트 작업', dev_sub: 'GitHub · 지난 12개월', issues: '개 이슈 해결', commits: '커밋', pulls: 'PR', releases: '릴리스', stars: '스타', updated: '업데이트', foot: '사용 수치는 익명 통계에서 매일 갱신됩니다.' },
  pt: { eyebrow: 'USO AO VIVO', people: 'pessoas', installs: 'instalações', countries: 'países', languages: 'idiomas', tel_h: 'Quem usa meus aplicativos', tel_see: 'Ver as estatísticas de uso ao vivo →', dev_h: 'O trabalho', dev_sub: 'GitHub · últimos 12 meses', issues: 'issues resolvidas', commits: 'commits', pulls: 'pull requests', releases: 'versões', stars: 'estrelas', updated: 'Atualizado', foot: 'Os números de uso são atualizados diariamente a partir de estatísticas anônimas.' },
  es: { eyebrow: 'USO EN VIVO', people: 'personas', installs: 'instalaciones', countries: 'países', languages: 'idiomas', tel_h: 'Quién usa mis aplicaciones', tel_see: 'Ver las estadísticas de uso en vivo →', dev_h: 'El trabajo', dev_sub: 'GitHub · últimos 12 meses', issues: 'issues cerradas', commits: 'commits', pulls: 'pull requests', releases: 'versiones', stars: 'estrellas', updated: 'Actualizado', foot: 'Los números de uso se actualizan a diario desde estadísticas anónimas.' },
  fr: { eyebrow: 'USAGE EN DIRECT', people: 'personnes', installs: 'installations', countries: 'pays', languages: 'langues', tel_h: 'Qui utilise mes applications', tel_see: 'Voir les statistiques d’usage en direct →', dev_h: 'Le travail', dev_sub: 'GitHub · 12 derniers mois', issues: 'tickets résolus', commits: 'commits', pulls: 'pull requests', releases: 'versions', stars: 'étoiles', updated: 'Mis à jour', foot: "Les chiffres d'usage sont actualisés chaque jour à partir de statistiques anonymes." },
};

async function fetchPublic() {
  if (process.env.HUB_FILE) return JSON.parse(await readFile(process.env.HUB_FILE, 'utf8'));
  const r = await fetch(HUB_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`hub /v1/public: ${r.status}`);
  return r.json();
}

async function fetchGithub() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const to = new Date();
  const yearFrom = new Date(to.getTime() - 364 * 86400000);
  const closedSince = yearFrom.toISOString().slice(0, 10);
  // Everything in the "work" card is one time slice: the last 12 months.
  const query = `query($login:String!,$yearFrom:DateTime!,$to:DateTime!,$closedQ:String!){
    user(login:$login){
      year: contributionsCollection(from:$yearFrom,to:$to){
        totalCommitContributions
        totalPullRequestContributions
        contributionCalendar{ weeks{ contributionDays{ date contributionCount } } }
      }
      repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, orderBy:{field:STARGAZERS, direction:DESC}){
        nodes{ name stargazerCount releases(first:100){ nodes{ publishedAt } } }
      }
    }
    issuesClosed: search(query:$closedQ, type:ISSUE){ issueCount }
  }`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'timoncool-stats' },
    body: JSON.stringify({ query, variables: { login: LOGIN, yearFrom: yearFrom.toISOString(), to: to.toISOString(), closedQ: `user:${LOGIN} is:issue is:closed closed:>=${closedSince}` } }),
  });
  if (!r.ok) throw new Error(`github graphql: ${r.status}`);
  const data = await r.json();
  if (data.errors) throw new Error(`github graphql: ${JSON.stringify(data.errors)}`);
  const user = data.data.user;
  const nodes = user.repositories.nodes;
  const byName = new Map(nodes.map((n) => [n.name.toLowerCase(), n]));
  const sum = (f) => nodes.reduce((a, n) => a + f(n), 0);
  // releases published within the 12-month window
  const yearMs = yearFrom.getTime();
  const releasesYear = sum((n) => n.releases.nodes.filter((r) => r.publishedAt && Date.parse(r.publishedAt) >= yearMs).length);
  // weekly contribution counts over the last year — the series the activity area chart draws
  const activity = user.year.contributionCalendar.weeks.map((w) => ({
    w: w.contributionDays.length ? w.contributionDays[0].date : '',
    c: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
  }));
  return {
    byName,
    // GitHub stats. The four card KPIs are all the last 12 months; stars/downloads are lifetime totals, shown per app.
    dev: {
      commits: user.year.totalCommitContributions,
      pulls: user.year.totalPullRequestContributions,
      issues_closed: data.data.issuesClosed.issueCount,
      releases: releasesYear,
      stars: sum((n) => n.stargazerCount),
      activity,
    },
  };
}

// Release-asset download totals via the REST API, for the given repos. Kept separate so the GraphQL query
// stays under GitHub's node-resource limit. A repo whose releases can't be read counts as 0 (and warns).
async function fetchDownloads(repos) {
  const token = process.env.GITHUB_TOKEN;
  const h = { authorization: `bearer ${token}`, 'user-agent': 'timoncool-stats', accept: 'application/vnd.github+json' };
  const out = new Map();
  await Promise.all(repos.map(async (repo) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${LOGIN}/${repo}/releases?per_page=100`, { headers: h });
      if (!r.ok) { console.warn(`[WARN] downloads ${repo}: HTTP ${r.status}`); out.set(repo.toLowerCase(), 0); return; }
      const rels = await r.json();
      out.set(repo.toLowerCase(), rels.reduce((a, rel) => a + (rel.assets || []).reduce((b, x) => b + (x.download_count || 0), 0), 0));
    } catch (e) {
      console.warn(`[WARN] downloads ${repo}: ${e.message}`);
      out.set(repo.toLowerCase(), 0);
    }
  }));
  return out;
}

// ---- formatting -------------------------------------------------------------------------------
const nf = new Intl.NumberFormat('en-US');
const fmt = (n) => (n == null ? '—' : nf.format(n));
const k = (n) => (n >= 1000 ? Math.floor(n / 100) / 10 + 'k' : String(n));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const realLen = (a) => (a || []).filter((x) => x.k !== 'other').length;
const hasOther = (a) => (a || []).some((x) => x.k === 'other');
// rough pixel width of a formatted number at digit-width dw (thin separators count less)
const numWidth = (s, dw) => [...String(s)].reduce((a, ch) => a + (ch === ',' || ch === '.' ? dw * 0.42 : dw), 0);

// ---- SVG cards (dark, read well on both GitHub themes) ----------------------------------------
const C = { bg: '#0d1117', card: '#161b22', line: '#30363d', ink: '#e6edf3', mut: '#8b949e', acc: '#1f6feb', acc2: '#58a6ff' };

const F = "font-family=\"'Segoe UI',system-ui,-apple-system,sans-serif\"";

// A wide stat banner: 4 big numbers with labels, an accent stripe and an eyebrow. Native SVG elements only —
// GitHub strips <style>, CSS, @keyframes, foreignObject and JS from SVGs loaded through <img>, but renders text/rect/line.
function cardSvg(cells, eyebrow, titleRight, note) {
  const W = 840, H = 104;
  const cw = (W - 48) / cells.length;
  const items = cells.map((c, i) => {
    const x = 24 + cw * i + cw / 2;
    const numW = numWidth(c.n, 19);
    const gx = x - (24 + numW) / 2; // centre the icon+number group
    return (c.ic ? kpiIcon(c.ic, gx + 9, 34) : '') +
      `<text x="${c.ic ? gx + 26 : x}" y="44" ${c.ic ? '' : 'text-anchor="middle" '}fill="${C.ink}" font-size="34" font-weight="800" ${F}>${esc(c.n)}</text>` +
      `<text x="${x}" y="64" text-anchor="middle" fill="${C.mut}" font-size="14" ${F}>${esc(c.l)}</text>`;
  }).join('');
  const seps = cells.slice(1).map((_, i) => `<line x1="${24 + cw * (i + 1)}" y1="14" x2="${24 + cw * (i + 1)}" y2="62" stroke="${C.line}"/>`).join('');
  // one footer line: eyebrow (left) · note (centre) · title (right)
  const noteLine = note ? `\n  <text x="${W / 2}" y="93" text-anchor="middle" fill="${C.mut}" font-size="11" ${F}>${esc(note)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titleRight)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="6" height="${H - 2}" rx="3" fill="${C.acc}"/>
  ${seps}${items}
  <line x1="24" y1="78" x2="${W - 24}" y2="78" stroke="${C.line}"/>
  <text x="24" y="93" fill="${C.acc2}" font-size="11.5" font-weight="700" letter-spacing="1.5" ${F}>${esc(eyebrow)}</text>
  <text x="${W - 24}" y="93" text-anchor="end" fill="${C.mut}" font-size="11.5" ${F}>${esc(titleRight)}</text>${noteLine}
</svg>`;
}

// Category icons for the "More projects" headers (line icons, same blue as everything else).
function catIcon(type) {
  const paths = {
    video: '<path d="M22 8l-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2.5"/>',
    mcp: '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6"/>',
    agents: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
    tools: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${C.acc2}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[type] || ''}</svg>`;
}

// Icons for the pill badges (hero + donate), drawn centered at (cx, cy).
function badgeIcon(type, cx, cy) {
  const s = `fill="none" stroke="${C.acc2}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const d = C.acc2;
  if (type === 'telegram') return `<path d="M${cx + 9},${cy - 7} L${cx - 9},${cy} L${cx - 3},${cy + 2.5} L${cx - 1},${cy + 7} L${cx + 1.5},${cy + 3} L${cx + 5},${cy + 6} Z" ${s}/>`;
  if (type === 'globe') return `<g ${s}><circle cx="${cx}" cy="${cy}" r="8"/><ellipse cx="${cx}" cy="${cy}" rx="3.4" ry="8"/><path d="M${cx - 8},${cy} L${cx + 8},${cy}"/></g>`;
  if (type === 'youtube') return `<g ${s}><rect x="${cx - 9}" y="${cy - 6.5}" width="18" height="13" rx="4"/><path d="M${cx - 2.5},${cy - 3} L${cx + 4},${cy} L${cx - 2.5},${cy + 3} Z" fill="${d}" stroke="none"/></g>`;
  if (type === 'heart') return `<path d="M${cx},${cy + 6.5} C${cx - 9},${cy - 1} ${cx - 6},${cy - 8} ${cx - 2.5},${cy - 5} C${cx - 1},${cy - 3.8} ${cx},${cy - 2.5} ${cx},${cy - 2.5} C${cx},${cy - 2.5} ${cx + 1},${cy - 3.8} ${cx + 2.5},${cy - 5} C${cx + 6},${cy - 8} ${cx + 9},${cy - 1} ${cx},${cy + 6.5} Z" fill="${d}" stroke="none"/>`;
  if (type === 'card') return `<g ${s}><rect x="${cx - 9}" y="${cy - 6}" width="18" height="12" rx="2"/><path d="M${cx - 9},${cy - 1.5} h18"/></g>`;
  if (type === 'spark') return `<path d="M${cx},${cy - 8} L${cx + 2.6},${cy - 2.6} L${cx + 8},${cy} L${cx + 2.6},${cy + 2.6} L${cx},${cy + 8} L${cx - 2.6},${cy + 2.6} L${cx - 8},${cy} L${cx - 2.6},${cy - 2.6} Z" fill="${d}" stroke="none"/>`;
  return '';
}

// A dark pill badge: blue icon + label, matching the cards. Width grows with the label.
function badgeSvg(label, icon) {
  const h = 36, pad = 15, iconSlot = icon ? 26 : 0, cy = h / 2;
  const tw = Math.round([...label].reduce((a, ch) => a + (ch.codePointAt(0) > 0x2e00 ? 15 : ch === ' ' ? 4.2 : /[.,'·]/.test(ch) ? 3.6 : /[iljtI]/.test(ch) ? 4.2 : /[mwMW]/.test(ch) ? 11 : 7.7), 0));
  const W = pad + iconSlot + tw + pad;
  const tx = pad + iconSlot;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
  <rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="9" fill="${C.card}" stroke="${C.line}"/>
  ${icon ? badgeIcon(icon, pad + 10, cy) : ''}
  <text x="${tx}" y="${cy + 5}" fill="${C.ink}" font-size="14" font-weight="600" ${F}>${esc(label)}</text>
</svg>`;
}

// The hero social row and the donate row, as pill badges.
const HERO_BADGES = [
  { file: 'telegram', label: 'Telegram', icon: 'telegram', href: 'https://t.me/nerual_dreming' },
  { file: 'youtube', label: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/@nerual_dreming' },
  { file: 'support', label: 'Support', icon: 'heart', href: 'https://timoncool.github.io/YuE2-Studio/donate.html' },
];
const DONATE_BADGES = [
  { file: 'donate', label: 'All donation methods', icon: 'heart', href: 'https://timoncool.github.io/YuE2-Studio/donate.html' },
  { file: 'card', label: 'Bank card — dalink.to', icon: 'card', href: 'https://dalink.to/nerual_dreming' },
  { file: 'boosty', label: 'Boosty', icon: 'spark', href: 'https://boosty.to/neuro_art' },
];
// Translatable badge labels (proper nouns like Telegram, YouTube, Boosty stay the same).
const BADGE_L10N = {
  Support: { ru: 'Поддержать', zh: '支持', ja: '支援', ko: '후원', pt: 'Apoiar', es: 'Apoyar', fr: 'Soutenir' },
  'All donation methods': { ru: 'Все способы доната', zh: '全部捐赠方式', ja: 'すべての支援方法', ko: '모든 후원 방법', pt: 'Formas de apoio', es: 'Formas de apoyo', fr: 'Moyens de don' },
  'Bank card — dalink.to': { ru: 'Карта — dalink.to', zh: '银行卡 — dalink.to', ja: 'カード — dalink.to', ko: '카드 — dalink.to', pt: 'Cartão — dalink.to', es: 'Tarjeta — dalink.to', fr: 'Carte — dalink.to' },
};
const badgeLabel = (label, lang) => (lang !== 'en' && BADGE_L10N[label] && BADGE_L10N[label][lang]) || label;

const DEVLABEL = { en: 'DEVELOPMENT', ru: 'РАЗРАБОТКА', zh: '开发', ja: '開発', ko: '개발', pt: 'DESENVOLVIMENTO', es: 'DESARROLLO', fr: 'DÉVELOPPEMENT' };

function usageSvg(s, lang) {
  const t = T[lang] || T.en;
  return cardSvg([
    { n: fmt(s.totals.people), l: t.people, ic: 'user' },
    { n: fmt(s.totals.installs), l: t.installs, ic: 'dl' },
    { n: fmt(realLen(s.countries)) + (hasOther(s.countries) ? '+' : ''), l: t.countries, ic: 'globe' },
    { n: fmt(realLen(s.languages)) + (hasOther(s.languages) ? '+' : ''), l: t.languages, ic: 'lang' },
  ], t.eyebrow, t.tel_h, (NOTE[lang] || NOTE.en).usage);
}

// Catmull-Rom through the points, emitted as a smooth cubic-bezier path.
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// A smooth area chart (gradient fill + line that draws itself in) over a numeric series.
function areaGraph(series, x0, y0, w, h, gid) {
  const n = series.length;
  if (!n) return '';
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => ({ x: x0 + (n === 1 ? w / 2 : (w * i) / (n - 1)), y: y0 + h - (v / max) * h }));
  const line = smoothPath(pts);
  const area = `${line} L${(x0 + w).toFixed(1)},${(y0 + h).toFixed(1)} L${x0.toFixed(1)},${(y0 + h).toFixed(1)} Z`;
  return `<defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.acc2}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${C.acc2}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${x0}" y1="${y0 + h}" x2="${x0 + w}" y2="${y0 + h}" stroke="${C.line}"/>
  <path d="${area}" fill="url(#${gid})" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="0.3s" fill="freeze"/></path>
  <path d="${line}" fill="none" stroke="${C.acc2}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.2s" begin="0s" fill="freeze"/></path>`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Month labels under the chart, one per month boundary.
function monthTicks(activity, x0, w, y) {
  const n = activity.length;
  if (!n) return '';
  const seen = new Set();
  let out = '';
  activity.forEach((p, i) => {
    if (!p.w) return;
    const m = new Date(p.w).getUTCMonth();
    if (seen.has(m)) return;
    seen.add(m);
    const x = x0 + (n === 1 ? w / 2 : (w * i) / (n - 1));
    out += `<text x="${x.toFixed(0)}" y="${y}" text-anchor="middle" fill="${C.mut}" font-size="11" ${F}>${MON[m]}</text>`;
  });
  return out;
}

// The "work" card: four totals on top, a 12-month contribution area chart below — the streak graph, remade.
function devSvg(s, lang) {
  const t = T[lang] || T.en;
  const d = s.dev || {};
  const W = 840, H = 242;
  const cells = [
    { n: fmt(d.commits), l: t.commits, ic: 'commit' },
    { n: fmt(d.issues_closed), l: t.issues, ic: 'issue' },
    { n: fmt(d.releases), l: t.releases, ic: 'tag' },
    { n: fmt(d.pulls), l: t.pulls, ic: 'pr' },
  ];
  const cw = (W - 48) / cells.length;
  const stats = cells.map((c, i) => {
    const x = 24 + cw * i + cw / 2;
    const gx = x - (22 + numWidth(c.n, 17)) / 2; // centre the icon+number group
    return kpiIcon(c.ic, gx + 8, 34) +
      `<text x="${gx + 24}" y="44" fill="${C.ink}" font-size="30" font-weight="800" ${F}>${esc(c.n)}</text>` +
      `<text x="${x}" y="64" text-anchor="middle" fill="${C.mut}" font-size="13" ${F}>${esc(c.l)}</text>`;
  }).join('');
  const seps = cells.slice(1).map((_, i) => `<line x1="${24 + cw * (i + 1)}" y1="14" x2="${24 + cw * (i + 1)}" y2="66" stroke="${C.line}"/>`).join('');
  const series = (d.activity || []).map((p) => p.c);
  const graph = areaGraph(series, 24, 82, W - 48, 108, 'devg');
  const ticks = monthTicks(d.activity || [], 24, W - 48, 206);
  const note = (NOTE[lang] || NOTE.en).dev;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.dev_h)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="6" height="${H - 2}" rx="3" fill="${C.acc}"/>
  ${seps}${stats}${graph}${ticks}
  <line x1="24" y1="216" x2="${W - 24}" y2="216" stroke="${C.line}"/>
  <text x="24" y="231" fill="${C.acc2}" font-size="11.5" font-weight="700" letter-spacing="1.5" ${F}>${esc(DEVLABEL[lang] || DEVLABEL.en)}</text>
  <text x="${W / 2}" y="231" text-anchor="middle" fill="${C.mut}" font-size="11" ${F}>${esc(note)}</text>
  <text x="${W - 24}" y="231" text-anchor="end" fill="${C.mut}" font-size="11.5" ${F}>${esc(t.dev_sub)}</text>
</svg>`;
}

// Greedy word-wrap into at most `lines` lines of about `max` characters; appends … if the text overflows.
function wrap(text, max, lines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const res = [''];
  for (const word of words) {
    const i = res.length - 1;
    if (!res[i]) res[i] = word;
    else if ((res[i] + ' ' + word).length <= max) res[i] += ' ' + word;
    else if (res.length < lines) res.push(word);
    else { res[i] += '…'; break; }
  }
  return res;
}

// Small line icons for the metrics, drawn at a center point (native SVG so they render on GitHub).
function statIcon(type, cx, cy) {
  if (type === 'star') return `<text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="${C.acc2}" font-size="17" ${F}>★</text>`;
  if (type === 'user') return `<g fill="none" stroke="${C.acc2}" stroke-width="1.7"><circle cx="${cx}" cy="${cy - 3}" r="3.3"/><path d="M${cx - 6},${cy + 7} a6,5.5 0 0 1 12,0"/></g>`;
  return `<g fill="none" stroke="${C.acc2}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M${cx},${cy - 7} L${cx},${cy + 3}"/><path d="M${cx - 4},${cy - 1} L${cx},${cy + 3} L${cx + 4},${cy - 1}"/><path d="M${cx - 6},${cy + 7} L${cx + 6},${cy + 7}"/></g>`;
}

// Icons for the big KPI cards (usage banner and the work card), drawn centered at (cx, cy), ~16px.
function kpiIcon(type, cx, cy) {
  const s = `fill="none" stroke="${C.acc2}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const d = C.acc2;
  if (type === 'user') return `<g ${s}><circle cx="${cx}" cy="${cy - 3}" r="3.6"/><path d="M${cx - 7},${cy + 8} a7,6.5 0 0 1 14,0"/></g>`;
  if (type === 'dl') return `<g ${s}><path d="M${cx},${cy - 8} L${cx},${cy + 3}"/><path d="M${cx - 4.5},${cy - 1.5} L${cx},${cy + 3} L${cx + 4.5},${cy - 1.5}"/><path d="M${cx - 7},${cy + 8} L${cx + 7},${cy + 8}"/></g>`;
  if (type === 'globe') return `<g ${s}><circle cx="${cx}" cy="${cy}" r="8"/><ellipse cx="${cx}" cy="${cy}" rx="3.4" ry="8"/><path d="M${cx - 8},${cy} L${cx + 8},${cy}"/></g>`;
  if (type === 'lang') return `<g ${s}><path d="M${cx - 8},${cy - 6} h16 v9 h-10 l-4,4 v-4 h-2 z"/></g>`;
  if (type === 'commit') return `<g ${s}><circle cx="${cx}" cy="${cy}" r="3.8"/><path d="M${cx - 8},${cy} h4.2 M${cx + 3.8},${cy} h4.2"/></g>`;
  if (type === 'issue') return `<g ${s}><circle cx="${cx}" cy="${cy}" r="7.2"/><circle cx="${cx}" cy="${cy}" r="1.7" fill="${d}" stroke="none"/></g>`;
  if (type === 'tag') return `<g ${s}><path d="M${cx - 1},${cy - 8} L${cx + 8},${cy - 8} L${cx + 8},${cy + 1} L${cx - 1},${cy + 10} L${cx - 10},${cy + 1} Z"/><circle cx="${cx + 3.8}" cy="${cy - 3.8}" r="1.5" fill="${d}" stroke="none"/></g>`;
  if (type === 'pr') return `<g ${s}><circle cx="${cx - 5.5}" cy="${cy - 5.5}" r="2.4"/><circle cx="${cx - 5.5}" cy="${cy + 5.5}" r="2.4"/><circle cx="${cx + 5.5}" cy="${cy + 5.5}" r="2.4"/><path d="M${cx - 5.5},${cy - 3.1} v6.2 M${cx - 3.1},${cy + 5.5} h6.2"/></g>`;
  return '';
}

// Character wrap for CJK text (no spaces to break on).
function wrapCjk(text, max, lines) {
  const out = [];
  let s = String(text);
  for (let i = 0; i < lines && s; i++) {
    if (s.length <= max || i === lines - 1) { out.push(i === lines - 1 && s.length > max ? s.slice(0, max - 1) + '…' : s); break; }
    out.push(s.slice(0, max));
    s = s.slice(max);
  }
  return out;
}

// One project card (408, two per row) in the given language: name + localized description on the left,
// the metrics as icon+number rows on the right. Each card is its own file so the README can link it.
function tileSvg(p, lang) {
  const W = 408, H = 112;
  const desc = (lang !== 'en' && DESC[p.repo] && DESC[p.repo][lang]) || p.desc || '';
  const cjk = lang === 'zh' || lang === 'ja' || lang === 'ko';
  const lines = cjk ? wrapCjk(desc, 20, 3) : wrap(desc, 42, 3);
  // vertically centre the name + description block
  const blockH = 22 + lines.length * 17;
  const ny = Math.round((H - blockH) / 2) + 14;
  const dl = lines.map((ln, j) => `<text x="20" y="${ny + 23 + j * 17}" fill="${C.mut}" font-size="12.5" ${F}>${esc(ln)}</text>`).join('');
  const metrics = [
    p.stars != null ? { ic: 'star', n: p.stars } : null,
    p.people ? { ic: 'user', n: p.people } : null,
    p.downloads ? { ic: 'dl', n: p.downloads } : null,
  ].filter(Boolean);
  // icons share one column (x=306); numbers start at one column (x=328) — both aligned
  const rowH = 26, mTop = Math.round((H - metrics.length * rowH) / 2);
  const rows = metrics.map((m, i) => {
    const by = mTop + rowH * i + 17;
    return statIcon(m.ic, 306, by - 5) + `<text x="328" y="${by}" fill="${C.ink}" font-size="16" font-weight="700" ${F}>${esc(k(m.n))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="4" height="${H - 2}" rx="2" fill="${C.acc}"/>
  <text x="20" y="${ny}" fill="${C.ink}" font-size="16.5" font-weight="700" ${F}>${esc(p.name)}</text>
  ${dl}
  <line x1="288" y1="16" x2="288" y2="${H - 16}" stroke="${C.line}"/>
  ${rows}
</svg>`;
}

// Two clickable project cards per row, as inline images at 48% width — responsive 2-up grid with no
// <table> (so GitHub draws no cell borders); the SVG tiles scale crisply to whatever the column width is.
function linkGrid(items, lang) {
  const cell = (p) => `<a href="https://github.com/${LOGIN}/${p.repo}"><img src="dist/tile-${p.repo}-${lang}.svg" width="48%" alt="${esc(p.name)}"></a>`;
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(cell(items[i]) + (items[i + 1] ? ' ' + cell(items[i + 1]) : ''));
  return rows.join('\n\n');
}

// The rest of the catalog, grouped. Stars are merged from the GitHub API in main(); descriptions are one sentence each.
const CATS = [
  { title: 'Video & Vision', icon: 'video', items: [
    { repo: 'videosos', name: 'VideoSOS', desc: 'AI video production in the browser — 100+ models, lip sync and image-to-video.' },
    { repo: 'SuperCaption_Qwen3-VL', name: 'SuperCaption Qwen3-VL', desc: 'Image and video captioning and tagging with Qwen3-VL and 50+ ready templates.' },
  ] },
  { title: 'MCP Servers', icon: 'mcp', items: [
    { repo: 'telegram-api-mcp', name: 'telegram-api-mcp', desc: 'The whole Telegram Bot API as an MCP server — all 185 methods in one place.' },
    { repo: 'civitai-mcp-ultimate', name: 'civitai-mcp-ultimate', desc: 'The Civitai API as an MCP server: models, images and trends for your agent.' },
    { repo: 'trail-spec', name: 'trail-spec', desc: 'TRAIL — a cross-MCP protocol for tracking where generated content came from.' },
    { repo: 'hota-mcp', name: 'HotA MCP', desc: 'An AI agent that plays Heroes III: Horn of the Abyss like a real human player.' },
  ] },
  { title: 'AI Agents & Claude Code', icon: 'agents', items: [
    { repo: 'givememod', name: 'givememod', desc: 'Say /givememod and Claude Code builds a mod for the task in front of you.' },
    { repo: 'prompt-warrior', name: 'Prompt Warrior', desc: 'A gamified, analytical portrait of how you actually work with AI.' },
    { repo: 'satori', name: 'satori', desc: 'A self-learning loop for Claude Code — your corrections become reusable skills.' },
    { repo: 'dream-skill', name: 'dream-skill', desc: 'Memory consolidation for Claude Code with dream and wake passes.' },
    { repo: 'angry-switcher', name: 'Angry Switcher', desc: 'Swear at Claude Code all you like — it quietly reads the cleaned-up version.' },
    { repo: 'slapbox', name: 'slapbox', desc: 'A stress-relief mod for Claude Code to reach for when it messes up.' },
    { repo: 'jarvis-codex-bot', name: 'Jarvis Codex Bot', desc: 'A Telegram assistant on Codex and OpenRouter — text, voice, images and files.' },
  ] },
  { title: 'Tools & Fun', icon: 'tools', items: [
    { repo: 'godot-strudel', name: 'Strudel for Godot', desc: 'The Strudel live-coding engine ported to GDScript so patterns play inside a game.' },
    { repo: 'hermes-ru-locale', name: 'Hermes RU Locale', desc: 'A full Russian localization for the Hermes Agent desktop app.' },
    { repo: 'gitlife', name: 'GitLife', desc: 'Your whole life laid out as a GitHub contribution graph.' },
    { repo: 'tg-challenge-bot', name: 'tg-challenge-bot', desc: 'An AI challenge bot for Telegram art communities.' },
    { repo: 'pip-twin', name: 'PiP Twin', desc: 'A Chrome extension that mirrors the playing video into a second window.' },
  ] },
];

// Localized one-sentence descriptions per repo (English comes from the card's own `desc` above).
const DESC = {
  'YuE2-Studio': { ru: 'Песни целиком с вокалом по промпту, редактируемая партитура, каверы и караоке-клипы.', zh: '按提示生成带人声的完整歌曲，可编辑乐谱、翻唱与卡拉OK片段。', ja: 'プロンプトからボーカル付きのフル楽曲、編集可能な譜面、カバーやカラオケ映像。', ko: '프롬프트로 보컬이 있는 완성곡, 편집 가능한 악보, 커버와 노래방 클립.', pt: 'Músicas completas com vocais a partir de um prompt, partitura editável, covers e clipes de karaokê.', es: 'Canciones completas con voces desde un prompt, partitura editable, covers y clips de karaoke.', fr: 'Chansons complètes avec voix depuis un prompt, partition éditable, reprises et clips karaoké.' },
  'ACE-Step-Studio': { ru: 'Локальная Suno — песни с вокалом, каверы и клипы, всё генерится на твоём компьютере.', zh: '本地版 Suno — 带人声的歌曲、翻唱与音乐视频，全部在你自己的电脑上生成。', ja: 'ローカル版 Suno — ボーカル付き楽曲、カバー、ミュージックビデオを自分の PC で生成。', ko: '로컬 Suno — 보컬 곡, 커버, 뮤직비디오를 내 컴퓨터에서 직접 생성.', pt: 'Um Suno local — músicas com vocais, covers e videoclipes, tudo gerado na sua máquina.', es: 'Un Suno local — canciones con voces, covers y videoclips, todo generado en tu equipo.', fr: 'Un Suno local — chansons avec voix, reprises et clips, le tout généré sur votre machine.' },
  'dub-studio': { ru: 'Open-source CapCut для ИИ-дубляжа: переозвучка любого видео на другой язык клонированным голосом.', zh: '开源版 CapCut 的 AI 配音：用克隆声音把任意视频重新配成另一种语言。', ja: 'AI 吹き替えのオープンソース版 CapCut：任意の動画をクローン音声で別言語に再録。', ko: 'AI 더빙용 오픈소스 CapCut: 어떤 영상이든 복제 음성으로 다른 언어로 재녹음.', pt: 'Um CapCut open-source para dublagem com IA: redublar qualquer vídeo em outro idioma com voz clonada.', es: 'Un CapCut open-source para doblaje con IA: redoblar cualquier vídeo a otro idioma con voz clonada.', fr: 'Un CapCut open-source pour le doublage IA : redoubler n’importe quelle vidéo avec une voix clonée.' },
  'MiniMax-Music3-Studio': { ru: 'Нативная локальная музыкальная студия на MiniMax Music 3, с опциональными облачными моделями.', zh: '基于 MiniMax Music 3 的本地原生音乐工作室，可选云端模型。', ja: 'MiniMax Music 3 によるネイティブなローカル音楽スタジオ。クラウドモデルも任意で。', ko: 'MiniMax Music 3 기반의 네이티브 로컬 음악 스튜디오, 선택형 클라우드 모델 지원.', pt: 'Um estúdio de música local nativo baseado no MiniMax Music 3, com modelos em nuvem opcionais.', es: 'Un estudio de música local nativo basado en MiniMax Music 3, con modelos en la nube opcionales.', fr: 'Un studio de musique local natif basé sur MiniMax Music 3, avec des modèles cloud en option.' },
  'speech-studio': { ru: 'Синтез речи, клонирование голоса, аудиокниги и распознавание речи — пять движков, всё локально.', zh: '语音合成、声音克隆、有声书与语音识别 — 五个引擎，全部本地运行。', ja: '音声合成、ボイスクローン、オーディオブック、音声認識 — 5 つのエンジン、すべてローカル。', ko: '음성 합성, 음성 복제, 오디오북, 음성 인식 — 다섯 개 엔진, 모두 로컬.', pt: 'Síntese de voz, clonagem de voz, audiolivros e reconhecimento de fala — cinco motores, tudo local.', es: 'Síntesis de voz, clonación de voz, audiolibros y reconocimiento de voz — cinco motores, todo local.', fr: 'Synthèse vocale, clonage de voix, livres audio et reconnaissance vocale — cinq moteurs, tout en local.' },
  'Bulka': { ru: 'Лайв-кодинг музыки в браузере: форк Strudel со встроенным ИИ-агентом, пишет паттерны вместе с тобой.', zh: '在浏览器里现场编写音乐：带内置 AI 智能体的 Strudel 分支，和你一起写节奏模式。', ja: 'ブラウザでの音楽ライブコーディング：AI エージェント内蔵の Strudel フォークが一緒にパターンを書く。', ko: '브라우저에서 라이브 코딩 음악: AI 에이전트가 내장된 Strudel 포크가 함께 패턴을 작성.', pt: 'Live-coding de música no navegador: um fork do Strudel com agente de IA que escreve padrões com você.', es: 'Live-coding de música en el navegador: un fork de Strudel con agente de IA que escribe patrones contigo.', fr: 'Live-coding musical dans le navigateur : un fork de Strudel avec un agent IA qui écrit les motifs avec vous.' },
  'dungeon-ultimate': { ru: 'Офлайн ИИ-мастер подземелий — механики D&D, 3D-кости, генерация картинок и голос, без интернета.', zh: '离线 AI 地下城主 — D&D 机制、3D 骰子、图像生成与语音，无需联网。', ja: 'オフラインの AI ダンジョンマスター — D&D ルール、3D ダイス、画像生成と音声、ネット不要。', ko: '오프라인 AI 던전 마스터 — D&D 규칙, 3D 주사위, 이미지 생성과 음성, 인터넷 불필요.', pt: 'Um mestre de masmorra com IA offline — mecânicas de D&D, dados 3D, geração de imagens e voz, sem internet.', es: 'Un máster de mazmorras con IA offline — mecánicas de D&D, dados 3D, generación de imágenes y voz, sin internet.', fr: 'Un maître de donjon IA hors ligne — mécaniques D&D, dés 3D, génération d’images et voix, sans internet.' },
  'videosos': { ru: 'ИИ-производство видео в браузере — 100+ моделей, липсинк и image-to-video.', zh: '浏览器中的 AI 视频制作 — 100+ 模型、口型同步与图生视频。', ja: 'ブラウザでの AI 動画制作 — 100 以上のモデル、リップシンク、画像から動画。', ko: '브라우저에서 AI 영상 제작 — 100개 이상의 모델, 립싱크, 이미지-투-비디오.', pt: 'Produção de vídeo com IA no navegador — mais de 100 modelos, lip sync e imagem-para-vídeo.', es: 'Producción de vídeo con IA en el navegador — más de 100 modelos, lip sync e imagen-a-vídeo.', fr: 'Production vidéo IA dans le navigateur — plus de 100 modèles, lip sync et image-vers-vidéo.' },
  'SuperCaption_Qwen3-VL': { ru: 'Описание и теги для картинок и видео на Qwen3-VL и 50+ готовых шаблонах.', zh: '用 Qwen3-VL 和 50+ 模板为图像和视频生成描述与标签。', ja: 'Qwen3-VL と 50 以上のテンプレートで画像・動画のキャプションとタグ付け。', ko: 'Qwen3-VL과 50개 이상의 템플릿으로 이미지·영상 캡션과 태깅.', pt: 'Legendas e tags para imagens e vídeos com Qwen3-VL e mais de 50 modelos prontos.', es: 'Descripciones y etiquetas para imágenes y vídeos con Qwen3-VL y más de 50 plantillas.', fr: 'Légendes et tags pour images et vidéos avec Qwen3-VL et plus de 50 modèles prêts.' },
  'telegram-api-mcp': { ru: 'Весь Telegram Bot API как MCP-сервер — все 185 методов в одном месте.', zh: '完整的 Telegram Bot API 作为 MCP 服务器 — 全部 185 个方法。', ja: 'Telegram Bot API 全体を MCP サーバーに — 185 メソッドすべて。', ko: '전체 Telegram Bot API를 MCP 서버로 — 185개 메서드 모두.', pt: 'Toda a API de bots do Telegram como servidor MCP — os 185 métodos num só lugar.', es: 'Toda la API de bots de Telegram como servidor MCP — los 185 métodos en un solo sitio.', fr: 'Toute l’API bot Telegram en serveur MCP — les 185 méthodes au même endroit.' },
  'civitai-mcp-ultimate': { ru: 'Civitai API как MCP-сервер: модели, картинки и тренды для твоего агента.', zh: 'Civitai API 作为 MCP 服务器：为你的智能体提供模型、图片与趋势。', ja: 'Civitai API を MCP サーバーに：エージェント向けのモデル・画像・トレンド。', ko: 'Civitai API를 MCP 서버로: 에이전트를 위한 모델, 이미지, 트렌드.', pt: 'A API do Civitai como servidor MCP: modelos, imagens e tendências para o seu agente.', es: 'La API de Civitai como servidor MCP: modelos, imágenes y tendencias para tu agente.', fr: 'L’API Civitai en serveur MCP : modèles, images et tendances pour votre agent.' },
  'trail-spec': { ru: 'TRAIL — кросс-MCP протокол для отслеживания происхождения сгенерированного контента.', zh: 'TRAIL — 跨 MCP 协议，用于追踪生成内容的来源。', ja: 'TRAIL — 生成コンテンツの出所を追跡するクロス MCP プロトコル。', ko: 'TRAIL — 생성 콘텐츠의 출처를 추적하는 크로스 MCP 프로토콜.', pt: 'TRAIL — um protocolo entre MCPs para rastrear a origem do conteúdo gerado.', es: 'TRAIL — un protocolo entre MCP para rastrear el origen del contenido generado.', fr: 'TRAIL — un protocole inter-MCP pour tracer l’origine du contenu généré.' },
  'hota-mcp': { ru: 'ИИ-агент играет в Heroes III: Horn of the Abyss как живой человек.', zh: 'AI 智能体像真人一样玩《英雄无敌 3：深渊号角》。', ja: 'AI エージェントが『Heroes III: Horn of the Abyss』を人間のようにプレイ。', ko: 'AI 에이전트가 사람처럼 Heroes III: Horn of the Abyss를 플레이.', pt: 'Um agente de IA que joga Heroes III: Horn of the Abyss como um jogador humano.', es: 'Un agente de IA que juega a Heroes III: Horn of the Abyss como un jugador humano.', fr: 'Un agent IA qui joue à Heroes III: Horn of the Abyss comme un vrai joueur.' },
  'givememod': { ru: 'Скажи /givememod — и Claude Code соберёт мод под задачу прямо перед тобой.', zh: '说一句 /givememod，Claude Code 就为眼前的任务做一个 mod。', ja: '/givememod と言えば、Claude Code が目の前のタスク用の mod を作る。', ko: '/givememod 한마디면 Claude Code가 눈앞의 작업에 맞는 mod를 만든다.', pt: 'Diga /givememod e o Claude Code cria um mod para a tarefa à sua frente.', es: 'Di /givememod y Claude Code crea un mod para la tarea que tienes delante.', fr: 'Dites /givememod et Claude Code fabrique un mod pour la tâche en cours.' },
  'prompt-warrior': { ru: 'Геймифицированный аналитический портрет того, как ты на самом деле работаешь с ИИ.', zh: '用游戏化方式分析你与 AI 实际协作方式的画像。', ja: 'あなたが実際に AI とどう向き合うかを描くゲーム化された分析ポートレート。', ko: '당신이 실제로 AI와 어떻게 일하는지 보여주는 게임화된 분석 초상.', pt: 'Um retrato analítico e gamificado de como você realmente trabalha com IA.', es: 'Un retrato analítico y gamificado de cómo trabajas realmente con la IA.', fr: 'Un portrait analytique et ludique de votre façon réelle de travailler avec l’IA.' },
  'satori': { ru: 'Самообучающийся цикл для Claude Code — твои правки становятся переиспользуемыми скиллами.', zh: 'Claude Code 的自我学习循环 — 你的修正会变成可复用的技能。', ja: 'Claude Code の自己学習ループ — あなたの修正が再利用可能なスキルになる。', ko: 'Claude Code를 위한 자기 학습 루프 — 당신의 수정이 재사용 가능한 스킬이 된다.', pt: 'Um ciclo de autoaprendizado para o Claude Code — suas correções viram skills reutilizáveis.', es: 'Un ciclo de autoaprendizaje para Claude Code — tus correcciones se vuelven skills reutilizables.', fr: 'Une boucle d’auto-apprentissage pour Claude Code — vos corrections deviennent des skills réutilisables.' },
  'dream-skill': { ru: 'Консолидация памяти для Claude Code с проходами «сон» и «пробуждение».', zh: 'Claude Code 的记忆整理，带“做梦”与“醒来”两道流程。', ja: 'Claude Code のメモリ統合。「夢」と「目覚め」のパスで整理。', ko: 'Claude Code를 위한 메모리 통합 — 꿈과 깨어남 패스로 정리.', pt: 'Consolidação de memória para o Claude Code com passagens de sonho e despertar.', es: 'Consolidación de memoria para Claude Code con pasadas de sueño y despertar.', fr: 'Consolidation de mémoire pour Claude Code avec des passes de rêve et de réveil.' },
  'angry-switcher': { ru: 'Ругайся на Claude Code сколько хочешь — он тихо читает вычищенную версию.', zh: '随便骂 Claude Code — 它只会悄悄读清理过的版本。', ja: 'Claude Code にいくら悪態をついても、裏で整えた版を読んでくれる。', ko: 'Claude Code에 마음껏 욕해도 — 조용히 정제된 버전을 읽는다.', pt: 'Xingue o Claude Code à vontade — ele lê, em silêncio, a versão limpa.', es: 'Insulta a Claude Code cuanto quieras — él lee, en silencio, la versión limpia.', fr: 'Insultez Claude Code autant que vous voulez — il lit discrètement la version nettoyée.' },
  'slapbox': { ru: 'Мод-антистресс для Claude Code, когда он накосячил.', zh: '当 Claude Code 搞砸时用的解压 mod。', ja: 'Claude Code がやらかした時のためのストレス解消 mod。', ko: 'Claude Code가 실수했을 때 쓰는 스트레스 해소 mod.', pt: 'Um mod antiestresse para o Claude Code quando ele erra.', es: 'Un mod antiestrés para Claude Code cuando se equivoca.', fr: 'Un mod anti-stress pour Claude Code quand il se plante.' },
  'jarvis-codex-bot': { ru: 'Telegram-ассистент на Codex и OpenRouter — текст, голос, картинки и файлы.', zh: '基于 Codex 和 OpenRouter 的 Telegram 助手 — 文本、语音、图片与文件。', ja: 'Codex と OpenRouter による Telegram アシスタント — テキスト・音声・画像・ファイル。', ko: 'Codex와 OpenRouter 기반 Telegram 어시스턴트 — 텍스트, 음성, 이미지, 파일.', pt: 'Um assistente de Telegram em Codex e OpenRouter — texto, voz, imagens e arquivos.', es: 'Un asistente de Telegram en Codex y OpenRouter — texto, voz, imágenes y archivos.', fr: 'Un assistant Telegram sur Codex et OpenRouter — texte, voix, images et fichiers.' },
  'godot-strudel': { ru: 'Движок лайв-кодинга Strudel, портированный на GDScript — паттерны играют прямо в игре.', zh: '把 Strudel 现场编码引擎移植到 GDScript，节奏模式直接在游戏里播放。', ja: 'Strudel のライブコーディングエンジンを GDScript に移植。ゲーム内でパターンが鳴る。', ko: 'Strudel 라이브 코딩 엔진을 GDScript로 포팅 — 게임 안에서 패턴이 재생.', pt: 'O motor de live-coding Strudel portado para GDScript — os padrões tocam dentro do jogo.', es: 'El motor de live-coding Strudel portado a GDScript — los patrones suenan dentro del juego.', fr: 'Le moteur de live-coding Strudel porté en GDScript — les motifs jouent dans le jeu.' },
  'hermes-ru-locale': { ru: 'Полная русская локализация десктоп-приложения Hermes Agent.', zh: 'Hermes Agent 桌面应用的完整俄语本地化。', ja: 'Hermes Agent デスクトップアプリの完全なロシア語ローカライズ。', ko: 'Hermes Agent 데스크톱 앱의 완전한 러시아어 현지화.', pt: 'Uma localização completa em russo para o app desktop Hermes Agent.', es: 'Una localización completa al ruso para la app de escritorio Hermes Agent.', fr: 'Une localisation russe complète de l’application de bureau Hermes Agent.' },
  'gitlife': { ru: 'Вся твоя жизнь в виде графа контрибуций GitHub.', zh: '把你的一生画成 GitHub 贡献图。', ja: 'あなたの人生を GitHub のコントリビューショングラフで。', ko: '당신의 인생을 GitHub 기여 그래프로.', pt: 'Toda a sua vida apresentada como um gráfico de contribuições do GitHub.', es: 'Toda tu vida representada como un gráfico de contribuciones de GitHub.', fr: 'Toute votre vie présentée comme un graphe de contributions GitHub.' },
  'tg-challenge-bot': { ru: 'ИИ-бот для челленджей в Telegram-сообществах художников.', zh: '面向 Telegram 艺术社区的 AI 挑战赛机器人。', ja: 'Telegram のアート系コミュニティ向け AI チャレンジボット。', ko: 'Telegram 아트 커뮤니티를 위한 AI 챌린지 봇.', pt: 'Um bot de desafios com IA para comunidades de arte no Telegram.', es: 'Un bot de retos con IA para comunidades de arte en Telegram.', fr: 'Un bot de défis IA pour les communautés d’art sur Telegram.' },
  'pip-twin': { ru: 'Расширение Chrome, которое дублирует проигрываемое видео во второе окно.', zh: '一个 Chrome 扩展，把正在播放的视频镜像到第二个窗口。', ja: '再生中の動画を 2 つ目のウィンドウに映す Chrome 拡張。', ko: '재생 중인 영상을 두 번째 창에 그대로 띄우는 Chrome 확장.', pt: 'Uma extensão do Chrome que espelha o vídeo em reprodução numa segunda janela.', es: 'Una extensión de Chrome que refleja el vídeo en reproducción en una segunda ventana.', fr: 'Une extension Chrome qui duplique la vidéo en lecture dans une seconde fenêtre.' },
};

// ---- README -----------------------------------------------------------------------------------
// section headers, translated; the catalog below stays English (project names are proper nouns)
const SEC = {
  en: { apps: 'Featured apps', more: 'More projects', tech: 'Tech stack', support: 'Support my work' },
  ru: { apps: 'Избранные приложения', more: 'Другие проекты', tech: 'Стек', support: 'Поддержать' },
  zh: { apps: '精选应用', more: '更多项目', tech: '技术栈', support: '支持我的工作' },
  ja: { apps: '注目のアプリ', more: 'そのほかのプロジェクト', tech: '技術スタック', support: '活動を支援する' },
  ko: { apps: '주요 앱', more: '다른 프로젝트', tech: '기술 스택', support: '후원하기' },
  pt: { apps: 'Apps em destaque', more: 'Outros projetos', tech: 'Stack', support: 'Apoie meu trabalho' },
  es: { apps: 'Apps destacadas', more: 'Otros proyectos', tech: 'Stack', support: 'Apoya mi trabajo' },
  fr: { apps: 'Applis en vedette', more: 'Autres projets', tech: 'Stack technique', support: 'Soutenir mon travail' },
};

// A short line under the support heading, translated.
const SUP = {
  en: 'I build free, open-source, local-first AI apps for everyone. Your support keeps them coming =)',
  ru: 'Делаю бесплатные локальные AI-приложения с открытым кодом для всех. Твоя поддержка помогает продолжать =)',
  zh: '我为所有人打造免费、开源、本地优先的 AI 应用。你的支持让它们不断更新 =)',
  ja: '誰もが使える無料・オープンソース・ローカル優先の AI アプリを作っています。応援が制作を支えます =)',
  ko: '누구나 쓸 수 있는 무료 오픈소스 로컬 우선 AI 앱을 만듭니다. 여러분의 후원이 큰 힘이 됩니다 =)',
  pt: 'Crio apps de IA gratuitos, open-source e local-first para todos. Seu apoio os mantém vivos =)',
  es: 'Creo apps de IA gratuitas, open-source y local-first para todos. Tu apoyo las mantiene vivas =)',
  fr: "Je crée des applis IA gratuites, open-source et local-first pour tous. Votre soutien les fait vivre =)",
};

// What each stat family is and how often it refreshes — usage (ours, from the apps) vs GitHub (public API).
const NOTE = {
  en: { usage: 'Anonymous · opt-in · daily', dev: 'GitHub API · daily' },
  ru: { usage: 'Анонимно · по согласию · раз в сутки', dev: 'GitHub API · раз в сутки' },
  zh: { usage: '匿名 · 经同意 · 每日更新', dev: 'GitHub API · 每日更新' },
  ja: { usage: '匿名 · 同意制 · 毎日更新', dev: 'GitHub API · 毎日更新' },
  ko: { usage: '익명 · 동의 · 매일 갱신', dev: 'GitHub API · 매일 갱신' },
  pt: { usage: 'Anônimo · opcional · diário', dev: 'GitHub API · diário' },
  es: { usage: 'Anónimo · opcional · a diario', dev: 'GitHub API · a diario' },
  fr: { usage: 'Anonyme · volontaire · quotidien', dev: 'API GitHub · quotidien' },
};

// The animated hero lines, per language.
const TYPING = {
  en: ['Free local AI apps for everyone', 'Music · Speech · Video', 'Portable. One click. Local-first.', 'Co-Founder of ArtGeneration.me'],
  ru: ['Бесплатные локальные AI-приложения', 'Музыка · Речь · Видео', 'Портативно. Один клик. Локально.', 'Сооснователь ArtGeneration.me'],
  zh: ['人人可用的免费本地 AI 应用', '音乐 · 语音 · 视频', '便携 · 一键 · 本地优先', 'ArtGeneration.me 联合创始人'],
  ja: ['誰でも使える無料ローカル AI アプリ', '音楽 · 音声 · 動画', 'ポータブル・ワンクリック・ローカル', 'ArtGeneration.me 共同創業者'],
  ko: ['누구나 쓰는 무료 로컬 AI 앱', '음악 · 음성 · 영상', '포터블 · 원클릭 · 로컬 우선', 'ArtGeneration.me 공동 창업자'],
  pt: ['Apps de IA locais e grátis para todos', 'Música · Voz · Vídeo', 'Portátil. Um clique. Local-first.', 'Cofundador da ArtGeneration.me'],
  es: ['Apps de IA locales y gratis para todos', 'Música · Voz · Vídeo', 'Portátil. Un clic. Local-first.', 'Cofundador de ArtGeneration.me'],
  fr: ['Applis IA locales et gratuites pour tous', 'Musique · Voix · Vidéo', 'Portable. Un clic. Local-first.', 'Co-fondateur d’ArtGeneration.me'],
};
function heroSvg(lang) {
  const lines = (TYPING[lang] || TYPING.en).map((l) => encodeURIComponent(l)).join(';');
  const url = `https://readme-typing-svg.demolab.com/?lines=${lines}&font=Fira+Code&center=true&width=520&height=50&color=58a6ff&vCenter=true&pause=1000&size=20`;
  return `<a href="https://github.com/timoncool">\n  <img src="${url}" alt="" />\n</a>`;
}

// a row of linked pill badges, localized per language
const badgeRow = (badges, lang) => badges.map((b) => `<a href="${b.href}"><img src="dist/badge-${b.file}-${lang}.svg" height="34" alt="${esc(b.label)}"></a>`).join('\n');

const TECH = `<details>
<summary><h4>__TECH__</h4></summary>

![Rust](https://img.shields.io/badge/Rust-2b2b2b?logo=rust&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white) ![C++](https://img.shields.io/badge/C%2B%2B-00599C?logo=cplusplus&logoColor=white) ![CUDA](https://img.shields.io/badge/CUDA-76B900?logo=nvidia&logoColor=white) ![GDScript](https://img.shields.io/badge/GDScript-478CBF?logo=godotengine&logoColor=white)

![Tauri](https://img.shields.io/badge/Tauri-24C8DB?logo=tauri&logoColor=black) ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

![ggml / llama.cpp](https://img.shields.io/badge/ggml_%2F_llama.cpp-333) ![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-005CED?logo=onnx&logoColor=white) ![Hugging Face](https://img.shields.io/badge/Hugging_Face-FFD21E?logo=huggingface&logoColor=black) ![MCP](https://img.shields.io/badge/MCP-2b2b2b?logo=modelcontextprotocol&logoColor=white) ![Claude Code](https://img.shields.io/badge/Claude_Code-D97757?logo=claude&logoColor=white) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflareworkers&logoColor=white)

</details>`;

function readme(s, lang) {
  const t = T[lang] || T.en;
  const sec = SEC[lang] || SEC.en;
  const file = (l) => (l === 'en' ? 'README.md' : `README.${l}.md`);
  const switcher = LANGS.map((l) => (l === lang ? `**${LANGNAME[l]}**` : `[${LANGNAME[l]}](${file(l)})`)).join(' · ');
  const updated = new Date(s.updated || Date.now()).toISOString().slice(0, 10);
  const note = NOTE[lang] || NOTE.en;
  const more = CATS.map((c) => `#### <img src="dist/cat-${c.icon}.svg" width="18" valign="middle"> ${c.title}\n\n${linkGrid(c.items, lang)}`).join('\n\n');
  return `<div align="center">

${switcher}

${heroSvg(lang)}

${badgeRow(HERO_BADGES, lang)}

<a href="${STATS_PAGE}"><img src="dist/usage-${lang}.svg" alt="${esc(t.tel_h)}" width="840"></a>

**[${t.tel_see}](${STATS_PAGE})**

</div>

### ${sec.apps}

${linkGrid(FEATURED, lang)}

### ${t.dev_h}

<img src="dist/dev-${lang}.svg" alt="${esc(t.dev_h)}" width="840">

### ${sec.more}

${more}

### ${sec.support}

<div align="center">

${SUP[lang] || SUP.en}

${badgeRow(DONATE_BADGES, lang)}

<sub>

**BTC:** \`1E7dHL22RpyhJGVpcvKdbyZgksSYkYeEBC\` · **ETH:** \`0xb5db65adf478983186d4897ba92fe2c25c594a0c\` · **USDT:** \`TQST9Lp2TjK6FiVkn4fwfGUee7NmkxEE7C\`

</sub>

</div>

<div align="center"><sub>${t.updated}: ${updated} · ${t.foot}</sub></div>
`;
}

// ---- main -------------------------------------------------------------------------------------
async function main() {
  const repoList = [...FEATURED.map((f) => f.repo), ...CATS.flatMap((c) => c.items.map((it) => it.repo))];
  const [pub, gh, downloads] = await Promise.all([fetchPublic(), fetchGithub(), fetchDownloads(repoList)]);
  const peopleById = new Map((pub.programs || []).map((p) => [p.id, p.people]));
  const starsOf = (repo) => { const n = gh.byName.get(repo.toLowerCase()); return n ? n.stargazerCount : 0; };
  const dlOf = (repo) => downloads.get(repo.toLowerCase()) || 0;
  const featured = FEATURED.map((f) => ({
    id: f.id, name: f.name, desc: f.desc, repo: f.repo,
    stars: starsOf(f.repo), people: peopleById.get(f.id) || 0, downloads: dlOf(f.repo),
  }));
  const devTotal = { ...gh.dev, downloads: repoList.reduce((a, r) => a + dlOf(r), 0) };
  const stats = { ...pub, dev: devTotal, repos: featured.map(({ id, name, stars, people, downloads, repo }) => ({ id, name, stars, people, downloads, url: `https://github.com/${LOGIN}/${repo}` })) };

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
  for (const c of CATS) await writeFile(join(ROOT, 'dist', `cat-${c.icon}.svg`), catIcon(c.icon));
  for (const lang of LANGS) for (const b of [...HERO_BADGES, ...DONATE_BADGES]) await writeFile(join(ROOT, 'dist', `badge-${b.file}-${lang}.svg`), badgeSvg(badgeLabel(b.label, lang), b.icon));
  // one tile per project per language (localized description), so each card is its own clickable link
  const catItems = CATS.flatMap((c) => c.items.map((it) => ({ ...it, stars: starsOf(it.repo), downloads: dlOf(it.repo) })));
  const allTiles = [...featured, ...catItems];
  for (const lang of LANGS) {
    for (const p of allTiles) await writeFile(join(ROOT, 'dist', `tile-${p.repo}-${lang}.svg`), tileSvg(p, lang));
    await writeFile(join(ROOT, 'dist', `usage-${lang}.svg`), usageSvg(stats, lang));
    await writeFile(join(ROOT, 'dist', `dev-${lang}.svg`), devSvg(stats, lang));
    await writeFile(join(ROOT, lang === 'en' ? 'README.md' : `README.${lang}.md`), readme(stats, lang));
  }
  const tiles = featured.length + CATS.reduce((a, c) => a + c.items.length, 0);
  const weeks = (gh.dev.activity || []).length;
  console.log(`[OK] stats.json + ${LANGS.length} READMEs + ${tiles} tiles + ${LANGS.length * 2} lang-svg · people=${stats.totals.people} stars=${stats.dev.stars} dl=${stats.dev.downloads} commits=${stats.dev.commits} issues=${stats.dev.issues_closed} rel=${stats.dev.releases} weeks=${weeks}`);
}

main().catch((e) => {
  console.error('[ERROR]', e.message);
  process.exit(1);
});
