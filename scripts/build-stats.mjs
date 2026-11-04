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

// ---- SVG cards (dark, read well on both GitHub themes) ----------------------------------------
const C = { bg: '#0d1117', card: '#161b22', line: '#30363d', ink: '#e6edf3', mut: '#8b949e', acc: '#1f6feb', acc2: '#58a6ff' };

const F = "font-family=\"'Segoe UI',system-ui,-apple-system,sans-serif\"";

// A wide stat banner: 4 big numbers with labels, an accent stripe and an eyebrow. Native SVG elements only —
// GitHub strips <style>, CSS, @keyframes, foreignObject and JS from SVGs loaded through <img>, but renders text/rect/line.
function cardSvg(cells, eyebrow, titleRight) {
  const W = 840, H = 150;
  const cw = (W - 48) / cells.length;
  const items = cells.map((c, i) => {
    const x = 24 + cw * i + cw / 2;
    return `<text x="${x}" y="98" text-anchor="middle" fill="${C.ink}" font-size="38" font-weight="800" ${F}>${esc(c.n)}</text>` +
      `<text x="${x}" y="124" text-anchor="middle" fill="${C.mut}" font-size="15" ${F}>${esc(c.l)}</text>`;
  }).join('');
  const seps = cells.slice(1).map((_, i) => `<line x1="${24 + cw * (i + 1)}" y1="60" x2="${24 + cw * (i + 1)}" y2="118" stroke="${C.line}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titleRight)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="6" height="${H - 2}" rx="3" fill="${C.acc}"/>
  <text x="24" y="34" fill="${C.acc2}" font-size="13" font-weight="700" letter-spacing="2" ${F}>${esc(eyebrow)}</text>
  <text x="${W - 24}" y="34" text-anchor="end" fill="${C.mut}" font-size="13" ${F}>${esc(titleRight)}</text>
  ${seps}${items}
</svg>`;
}

const DEVLABEL = { en: 'DEVELOPMENT', ru: 'РАЗРАБОТКА', zh: '开发', ja: '開発', ko: '개발', pt: 'DESENVOLVIMENTO', es: 'DESARROLLO', fr: 'DÉVELOPPEMENT' };

function usageSvg(s, lang) {
  const t = T[lang] || T.en;
  return cardSvg([
    { n: fmt(s.totals.people), l: t.people },
    { n: fmt(s.totals.installs), l: t.installs },
    { n: fmt(realLen(s.countries)) + (hasOther(s.countries) ? '+' : ''), l: t.countries },
    { n: fmt(realLen(s.languages)) + (hasOther(s.languages) ? '+' : ''), l: t.languages },
  ], t.eyebrow, t.tel_h);
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
  const W = 840, H = 300;
  const cells = [
    { n: fmt(d.commits), l: t.commits },
    { n: fmt(d.issues_closed), l: t.issues },
    { n: fmt(d.releases), l: t.releases },
    { n: fmt(d.pulls), l: t.pulls },
  ];
  const cw = (W - 48) / cells.length;
  const stats = cells.map((c, i) => {
    const x = 24 + cw * i + cw / 2;
    return `<text x="${x}" y="96" text-anchor="middle" fill="${C.ink}" font-size="34" font-weight="800" ${F}>${esc(c.n)}</text>` +
      `<text x="${x}" y="118" text-anchor="middle" fill="${C.mut}" font-size="13" ${F}>${esc(c.l)}</text>`;
  }).join('');
  const seps = cells.slice(1).map((_, i) => `<line x1="${24 + cw * (i + 1)}" y1="60" x2="${24 + cw * (i + 1)}" y2="112" stroke="${C.line}"/>`).join('');
  const series = (d.activity || []).map((p) => p.c);
  const graph = areaGraph(series, 24, 150, W - 48, 118, 'devg');
  const ticks = monthTicks(d.activity || [], 24, W - 48, 290);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.dev_h)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="6" height="${H - 2}" rx="3" fill="${C.acc}"/>
  <text x="24" y="34" fill="${C.acc2}" font-size="13" font-weight="700" letter-spacing="2" ${F}>${esc(DEVLABEL[lang] || DEVLABEL.en)}</text>
  <text x="${W - 24}" y="34" text-anchor="end" fill="${C.mut}" font-size="13" ${F}>${esc(t.dev_sub)}</text>
  ${seps}${stats}${graph}${ticks}
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

// One project card as a standalone SVG (408x108): name, a wrapped 1-sentence description, and a metrics line.
// Each card is its own file so the README can wrap it in a real link — a single big SVG wouldn't be clickable per tile.
function tileSvg(p) {
  const tw = 408, th = 108;
  const lines = wrap(p.desc, 52, 2);
  const dl = lines.map((ln, j) => `<text x="22" y="${54 + j * 19}" fill="${C.mut}" font-size="13" ${F}>${esc(ln)}</text>`).join('');
  const meta = [
    p.stars != null ? `★ ${k(p.stars)}` : null,
    p.people ? `${k(p.people)} users` : null,
    p.downloads ? `${k(p.downloads)} downloads` : null,
  ].filter(Boolean).join('   ·   ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}" role="img" aria-label="${esc(p.name)}">
  <rect x="1" y="1" width="${tw - 2}" height="${th - 2}" rx="14" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="4" height="${th - 2}" rx="2" fill="${C.acc}"/>
  <text x="22" y="31" fill="${C.ink}" font-size="17" font-weight="700" ${F}>${esc(p.name)}</text>
  ${dl}
  <text x="22" y="${th - 16}" fill="${C.acc2}" font-size="12.5" font-weight="700" ${F}>${esc(meta)}</text>
</svg>`;
}

// A 2-column table of clickable project cards: each cell links its tile image to the repo.
function linkGrid(items) {
  const cell = (p) => `<td width="416" valign="top"><a href="https://github.com/${LOGIN}/${p.repo}"><img src="dist/tile-${p.repo}.svg" width="408" alt="${esc(p.name)}"></a></td>`;
  let rows = '';
  for (let i = 0; i < items.length; i += 2) {
    rows += `  <tr>\n    ${cell(items[i])}\n    ${items[i + 1] ? cell(items[i + 1]) : '<td></td>'}\n  </tr>\n`;
  }
  return `<table>\n${rows}</table>`;
}

// The rest of the catalog, grouped. Stars are merged from the GitHub API in main(); descriptions are one sentence each.
const CATS = [
  { title: '🎬 Video & Vision', items: [
    { repo: 'videosos', name: 'VideoSOS', desc: 'AI video production in the browser — 100+ models, lip sync and image-to-video.' },
    { repo: 'SuperCaption_Qwen3-VL', name: 'SuperCaption Qwen3-VL', desc: 'Image and video captioning and tagging with Qwen3-VL and 50+ ready templates.' },
  ] },
  { title: '🔌 MCP Servers', items: [
    { repo: 'telegram-api-mcp', name: 'telegram-api-mcp', desc: 'The whole Telegram Bot API as an MCP server — all 185 methods in one place.' },
    { repo: 'civitai-mcp-ultimate', name: 'civitai-mcp-ultimate', desc: 'The Civitai API as an MCP server: models, images and trends for your agent.' },
    { repo: 'trail-spec', name: 'trail-spec', desc: 'TRAIL — a cross-MCP protocol for tracking where generated content came from.' },
    { repo: 'hota-mcp', name: 'HotA MCP', desc: 'An AI agent that plays Heroes III: Horn of the Abyss like a real human player.' },
  ] },
  { title: '🧠 AI Agents & Claude Code', items: [
    { repo: 'givememod', name: 'givememod', desc: 'Say /givememod and Claude Code builds a mod for the task in front of you.' },
    { repo: 'prompt-warrior', name: 'Prompt Warrior', desc: 'A gamified, analytical portrait of how you actually work with AI.' },
    { repo: 'satori', name: 'satori', desc: 'A self-learning loop for Claude Code — your corrections become reusable skills.' },
    { repo: 'dream-skill', name: 'dream-skill', desc: 'Memory consolidation for Claude Code with dream and wake passes.' },
    { repo: 'angry-switcher', name: 'Angry Switcher', desc: 'Swear at Claude Code all you like — it quietly reads the cleaned-up version.' },
    { repo: 'slapbox', name: 'slapbox', desc: 'A stress-relief mod for Claude Code to reach for when it messes up.' },
    { repo: 'jarvis-codex-bot', name: 'Jarvis Codex Bot', desc: 'A Telegram assistant on Codex and OpenRouter — text, voice, images and files.' },
  ] },
  { title: '🧰 Tools & Fun', items: [
    { repo: 'godot-strudel', name: 'Strudel for Godot', desc: 'The Strudel live-coding engine ported to GDScript so patterns play inside a game.' },
    { repo: 'hermes-ru-locale', name: 'Hermes RU Locale', desc: 'A full Russian localization for the Hermes Agent desktop app.' },
    { repo: 'gitlife', name: 'GitLife', desc: 'Your whole life laid out as a GitHub contribution graph.' },
    { repo: 'tg-challenge-bot', name: 'tg-challenge-bot', desc: 'An AI challenge bot for Telegram art communities.' },
    { repo: 'pip-twin', name: 'PiP Twin', desc: 'A Chrome extension that mirrors the playing video into a second window.' },
  ] },
];

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
  en: { usage: 'Anonymous, opt-in usage from inside the apps — aggregated, no personal data, refreshed daily.', dev: 'Public activity from the GitHub API — refreshed daily.' },
  ru: { usage: 'Анонимно и по согласию, из самих приложений — агрегировано, без личных данных, обновляется раз в сутки.', dev: 'Открытая активность из GitHub API — обновляется раз в сутки.' },
  zh: { usage: '匿名且经用户同意，来自应用内部 — 聚合统计、无个人数据，每日更新。', dev: '来自 GitHub API 的公开活动 — 每日更新。' },
  ja: { usage: '匿名・オプトイン、アプリ内から集計 — 個人データなし、毎日更新。', dev: 'GitHub API の公開アクティビティ — 毎日更新。' },
  ko: { usage: '익명·동의 기반, 앱 내부에서 집계 — 개인정보 없음, 매일 갱신.', dev: 'GitHub API의 공개 활동 — 매일 갱신.' },
  pt: { usage: 'Uso anônimo e opcional, de dentro dos apps — agregado, sem dados pessoais, atualizado diariamente.', dev: 'Atividade pública via GitHub API — atualizada diariamente.' },
  es: { usage: 'Uso anónimo y opcional, desde dentro de las apps — agregado, sin datos personales, actualizado a diario.', dev: 'Actividad pública vía GitHub API — actualizada a diario.' },
  fr: { usage: "Usage anonyme et volontaire, depuis les applis — agrégé, sans données personnelles, mis à jour chaque jour.", dev: "Activité publique via l’API GitHub — mise à jour chaque jour." },
};

const HERO = `<a href="https://github.com/timoncool">
  <img src="https://readme-typing-svg.demolab.com/?lines=Free+local+AI+apps+for+everyone;Music+%C2%B7+Speech+%C2%B7+Video;Portable.+One+click.+Local-first.;Co-Founder+of+ArtGeneration.me&font=Fira+Code&center=true&width=500&height=50&color=58a6ff&vCenter=true&pause=1000&size=20" alt="" />
</a>

[![Telegram](https://img.shields.io/badge/Telegram-nerual__dreming-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/nerual_dreming)
[![Website](https://img.shields.io/badge/neuro--cartel.com-000?style=for-the-badge&logo=google-chrome&logoColor=white)](https://neuro-cartel.com)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@nerual_dreming)
[![Sponsor](https://img.shields.io/badge/Sponsor-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://timoncool.github.io/YuE2-Studio/donate.html)`;

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
  const more = CATS.map((c) => `#### ${c.title}\n\n${linkGrid(c.items)}`).join('\n\n');
  return `<div align="center">

${switcher}

${HERO}

<a href="${STATS_PAGE}"><img src="dist/usage-${lang}.svg" alt="${esc(t.tel_h)}" width="840"></a>

**[${t.tel_see}](${STATS_PAGE})**

<sub>${note.usage}</sub>

</div>

### ${sec.apps}

${linkGrid(FEATURED)}

### ${t.dev_h}

<img src="dist/dev-${lang}.svg" alt="${esc(t.dev_h)}" width="840">

<sub>${note.dev}</sub>

### ${sec.more}

${more}

### ${sec.tech}

${TECH.replace('__TECH__', sec.tech)}

### ${sec.support}

<div align="center">

${SUP[lang] || SUP.en}

[![All donation methods](https://img.shields.io/badge/All_donation_methods-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://timoncool.github.io/YuE2-Studio/donate.html)
[![dalink.to](https://img.shields.io/badge/Bank_card-dalink.to-29ABE2?style=for-the-badge&logo=stripe&logoColor=white)](https://dalink.to/nerual_dreming)
[![Boosty](https://img.shields.io/badge/Monthly-Boosty-F15F2C?style=for-the-badge)](https://boosty.to/neuro_art)

<sub>

**BTC:** \`1E7dHL22RpyhJGVpcvKdbyZgksSYkYeEBC\` · **ETH:** \`0xb5db65adf478983186d4897ba92fe2c25c594a0c\` · **USDT:** \`TQST9Lp2TjK6FiVkn4fwfGUee7NmkxEE7C\`

</sub>

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0d1117&height=80&section=footer" width="100%" alt="" />

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
  // one tile per project so each can be its own link in the README
  for (const p of featured) await writeFile(join(ROOT, 'dist', `tile-${p.repo}.svg`), tileSvg(p));
  for (const c of CATS) for (const it of c.items) {
    await writeFile(join(ROOT, 'dist', `tile-${it.repo}.svg`), tileSvg({ ...it, stars: starsOf(it.repo), downloads: dlOf(it.repo) }));
  }
  for (const lang of LANGS) {
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
