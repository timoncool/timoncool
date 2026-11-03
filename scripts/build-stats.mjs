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
// a studio stats page to link the telemetry to (any studio site serves the same stats.json)
const STATS_PAGE = 'https://timoncool.github.io/YuE2-Studio/stats.html';

// The featured studios, in order, with the hub id that carries their usage. Stars/releases are merged from GitHub.
const FEATURED = [
  { id: 'yue2', repo: 'YuE2-Studio', name: 'YuE2 Studio' },
  { id: 'ace', repo: 'ACE-Step-Studio', name: 'ACE-Step Studio' },
  { id: 'dub', repo: 'dub-studio', name: 'Dub Studio' },
  { id: 'minimax', repo: 'MiniMax-Music3-Studio', name: 'MiniMax Music3' },
  { id: 'speech', repo: 'speech-studio', name: 'Speech Studio' },
  { id: 'bulka', repo: 'Bulka', name: 'Bulka' },
  { id: 'dungeon', repo: 'dungeon-ultimate', name: 'Dungeon Ultimate' },
];

const LANGS = ['en', 'ru', 'zh', 'ja', 'ko', 'pt', 'es', 'fr'];
const LANGNAME = { en: 'English', ru: 'Русский', zh: '中文', ja: '日本語', ko: '한국어', pt: 'Português', es: 'Español', fr: 'Français' };
// the README chrome, translated; project names and descriptions stay in English (proper nouns / common on GitHub)
const T = {
  en: { eyebrow: 'OPEN TELEMETRY', people: 'people', installs: 'installs', countries: 'countries', languages: 'languages', tel_h: 'Who uses my apps', tel_see: 'See the live, open telemetry →', dev_h: 'The work, this month', issues: 'issues closed', commits: 'commits', releases: 'releases', stars: 'stars', updated: 'Updated', foot: 'Usage numbers update daily from open, anonymous telemetry.' },
  ru: { eyebrow: 'ОТКРЫТАЯ ТЕЛЕМЕТРИЯ', people: 'человек', installs: 'установок', countries: 'стран', languages: 'языков', tel_h: 'Кто пользуется приложениями', tel_see: 'Открытая телеметрия вживую →', dev_h: 'Работа за месяц', issues: 'ишью закрыто', commits: 'коммитов', releases: 'релизов', stars: 'звёзд', updated: 'Обновлено', foot: 'Числа использования обновляются раз в сутки из открытой анонимной телеметрии.' },
  zh: { eyebrow: '公开遥测', people: '人', installs: '次安装', countries: '个国家', languages: '种语言', tel_h: '谁在使用我的应用', tel_see: '查看实时公开遥测 →', dev_h: '本月的工作', issues: '个 issue 已解决', commits: '次提交', releases: '个版本', stars: '个 star', updated: '更新于', foot: '使用数据每天从公开匿名遥测更新。' },
  ja: { eyebrow: 'オープンテレメトリ', people: '人', installs: 'インストール', countries: 'か国', languages: '言語', tel_h: '誰が使っているか', tel_see: 'ライブのオープンテレメトリを見る →', dev_h: '今月の作業', issues: '件の課題を解決', commits: 'コミット', releases: 'リリース', stars: 'スター', updated: '更新', foot: '利用数は匿名のオープンテレメトリから毎日更新されます。' },
  ko: { eyebrow: '공개 텔레메트리', people: '명', installs: '설치', countries: '개국', languages: '개 언어', tel_h: '누가 사용하나', tel_see: '실시간 공개 텔레메트리 보기 →', dev_h: '이번 달의 작업', issues: '개 이슈 해결', commits: '커밋', releases: '릴리스', stars: '스타', updated: '업데이트', foot: '사용 수치는 익명 공개 텔레메트리에서 매일 갱신됩니다.' },
  pt: { eyebrow: 'TELEMETRIA ABERTA', people: 'pessoas', installs: 'instalações', countries: 'países', languages: 'idiomas', tel_h: 'Quem usa meus aplicativos', tel_see: 'Ver a telemetria aberta ao vivo →', dev_h: 'O trabalho, este mês', issues: 'issues resolvidas', commits: 'commits', releases: 'versões', stars: 'estrelas', updated: 'Atualizado', foot: 'Os números de uso são atualizados diariamente a partir de telemetria aberta e anônima.' },
  es: { eyebrow: 'TELEMETRÍA ABIERTA', people: 'personas', installs: 'instalaciones', countries: 'países', languages: 'idiomas', tel_h: 'Quién usa mis aplicaciones', tel_see: 'Ver la telemetría abierta en vivo →', dev_h: 'El trabajo, este mes', issues: 'issues cerradas', commits: 'commits', releases: 'versiones', stars: 'estrellas', updated: 'Actualizado', foot: 'Los números de uso se actualizan a diario desde telemetría abierta y anónima.' },
  fr: { eyebrow: 'TÉLÉMÉTRIE OUVERTE', people: 'personnes', installs: 'installations', countries: 'pays', languages: 'langues', tel_h: 'Qui utilise mes applications', tel_see: 'Voir la télémétrie ouverte en direct →', dev_h: 'Le travail, ce mois-ci', issues: 'tickets résolus', commits: 'commits', releases: 'versions', stars: 'étoiles', updated: 'Mis à jour', foot: "Les chiffres d'usage sont actualisés chaque jour à partir d'une télémétrie ouverte et anonyme." },
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
  const from = new Date(to.getTime() - 30 * 86400000);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){
      contributionsCollection(from:$from,to:$to){ totalCommitContributions }
      repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, orderBy:{field:STARGAZERS, direction:DESC}){
        nodes{ name stargazerCount releases{ totalCount } issues(states:CLOSED){ totalCount } }
      }
    }
  }`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'timoncool-stats' },
    body: JSON.stringify({ query, variables: { login: LOGIN, from: from.toISOString(), to: to.toISOString() } }),
  });
  if (!r.ok) throw new Error(`github graphql: ${r.status}`);
  const data = await r.json();
  if (data.errors) throw new Error(`github graphql: ${JSON.stringify(data.errors)}`);
  const user = data.data.user;
  const nodes = user.repositories.nodes;
  const byName = new Map(nodes.map((n) => [n.name.toLowerCase(), n]));
  const sum = (f) => nodes.reduce((a, n) => a + f(n), 0);
  return {
    byName,
    dev: {
      issues_closed: sum((n) => n.issues.totalCount),
      commits_month: user.contributionsCollection.totalCommitContributions,
      releases: sum((n) => n.releases.totalCount),
      stars: sum((n) => n.stargazerCount),
    },
  };
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

function telemetrySvg(s, lang) {
  const t = T[lang] || T.en;
  const W = 840, H = 150;
  const cells = [
    { n: fmt(s.totals.people), l: t.people },
    { n: fmt(s.totals.installs), l: t.installs },
    { n: fmt(realLen(s.countries)) + (hasOther(s.countries) ? '+' : ''), l: t.countries },
    { n: fmt(realLen(s.languages)) + (hasOther(s.languages) ? '+' : ''), l: t.languages },
  ];
  const cw = (W - 48) / cells.length;
  const items = cells.map((c, i) => {
    const x = 24 + cw * i + cw / 2;
    return `<text x="${x}" y="98" text-anchor="middle" fill="${C.ink}" font-size="38" font-weight="800" font-family="'Segoe UI',system-ui,sans-serif">${esc(c.n)}</text>` +
      `<text x="${x}" y="124" text-anchor="middle" fill="${C.mut}" font-size="15" font-family="'Segoe UI',system-ui,sans-serif">${esc(c.l)}</text>`;
  }).join('');
  const seps = cells.slice(1).map((_, i) => `<line x1="${24 + cw * (i + 1)}" y1="60" x2="${24 + cw * (i + 1)}" y2="118" stroke="${C.line}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.tel_h)}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${C.card}" stroke="${C.line}"/>
  <rect x="1" y="1" width="6" height="${H - 2}" rx="3" fill="${C.acc}"/>
  <text x="24" y="34" fill="${C.acc2}" font-size="13" font-weight="700" letter-spacing="2" font-family="'Segoe UI',system-ui,sans-serif">${esc(t.eyebrow)}</text>
  <text x="${W - 24}" y="34" text-anchor="end" fill="${C.mut}" font-size="13" font-family="'Segoe UI',system-ui,sans-serif">${esc(t.tel_h)}</text>
  ${seps}${items}
</svg>`;
}

function projectsSvg(featured) {
  const cols = 2, tw = 408, th = 96, gap = 16, pad = 2;
  const rows = Math.ceil(featured.length / cols);
  const W = pad * 2 + cols * tw + (cols - 1) * gap;
  const H = pad * 2 + rows * th + (rows - 1) * gap;
  const tiles = featured.map((p, i) => {
    const x = pad + (i % cols) * (tw + gap);
    const y = pad + Math.floor(i / cols) * (th + gap);
    const meta = [`★ ${k(p.stars)}`, p.people ? `👥 ${k(p.people)}` : null].filter(Boolean).join('   ');
    return `<g>
      <rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="12" fill="${C.card}" stroke="${C.line}"/>
      <rect x="${x}" y="${y}" width="4" height="${th}" rx="2" fill="${C.acc}"/>
      <text x="${x + 20}" y="${y + 33}" fill="${C.ink}" font-size="18" font-weight="700" font-family="'Segoe UI',system-ui,sans-serif">${esc(p.name)}</text>
      <text x="${x + 20}" y="${y + 58}" fill="${C.mut}" font-size="13" font-family="'Segoe UI',system-ui,sans-serif">${esc(p.desc)}</text>
      <text x="${x + 20}" y="${y + 80}" fill="${C.acc2}" font-size="13" font-weight="700" font-family="'Segoe UI',system-ui,sans-serif">${esc(meta)}</text>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projects">${tiles}</svg>`;
}

const DESC = {
  yue2: 'Full songs with vocals and an editable score',
  ace: 'Suno at home — songs, covers, videos',
  dub: 'Open-source CapCut for AI dubbing',
  minimax: 'Local AI music studio on MiniMax Music 3',
  speech: 'TTS, voice cloning, speech recognition',
  bulka: 'Live-coding music with an AI agent',
  dungeon: 'Offline AI dungeon master',
};

// ---- README -----------------------------------------------------------------------------------
// section headers, translated; the catalog below stays English (project names are proper nouns)
const SEC = {
  en: { apps: 'Apps', more: 'More projects', tech: 'Tech stack' },
  ru: { apps: 'Приложения', more: 'Другие проекты', tech: 'Стек' },
  zh: { apps: '应用', more: '更多项目', tech: '技术栈' },
  ja: { apps: 'アプリ', more: 'そのほかのプロジェクト', tech: '技術スタック' },
  ko: { apps: '앱', more: '다른 프로젝트', tech: '기술 스택' },
  pt: { apps: 'Aplicativos', more: 'Outros projetos', tech: 'Stack' },
  es: { apps: 'Aplicaciones', more: 'Otros proyectos', tech: 'Stack' },
  fr: { apps: 'Applications', more: 'Autres projets', tech: 'Stack technique' },
};

const HERO = `<a href="https://github.com/timoncool">
  <img src="https://readme-typing-svg.demolab.com/?lines=Free+local+AI+apps+for+everyone;Music+%C2%B7+Speech+%C2%B7+Video;Portable.+One+click.+Local-first.;Co-Founder+of+ArtGeneration.me&font=Fira+Code&center=true&width=500&height=50&color=58a6ff&vCenter=true&pause=1000&size=20" alt="" />
</a>

[![Telegram](https://img.shields.io/badge/Telegram-nerual__dreming-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/nerual_dreming)
[![Website](https://img.shields.io/badge/neuro--cartel.com-000?style=for-the-badge&logo=google-chrome&logoColor=white)](https://neuro-cartel.com)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@nerual_dreming)
[![Sponsor](https://img.shields.io/badge/Sponsor-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://timoncool.github.io/YuE2-Studio/donate.html)`;

const star = (repo) => `![stars](https://img.shields.io/github/stars/timoncool/${repo}?style=flat-square&label=%E2%98%85&labelColor=0d1117&color=1f6feb)`;
const row = ([name, repo, desc]) => `| **[${name}](https://github.com/timoncool/${repo})** | ${desc} | ${star(repo)} |`;
const cat = (title, rows) => `<details>
<summary><h4>${title}</h4></summary>

| Project | Description | Stars |
|---|---|---|
${rows.map(row).join('\n')}

</details>`;

const MORE = [
  cat('🎬 Video &amp; Vision', [
    ['VideoSOS', 'videosos', 'AI video production in the browser — 100+ models, lip sync, image-to-video'],
    ['SuperCaption Qwen3-VL', 'SuperCaption_Qwen3-VL', 'Image &amp; video captioning + tagging — Qwen3-VL, 50+ templates'],
  ]),
  cat('🔌 MCP Servers', [
    ['telegram-api-mcp', 'telegram-api-mcp', 'Full Telegram Bot API as an MCP server — all 185 methods'],
    ['civitai-mcp-ultimate', 'civitai-mcp-ultimate', 'Civitai API as an MCP server — models, images, trends'],
    ['trail-spec', 'trail-spec', 'TRAIL — cross-MCP content tracking protocol'],
    ['HotA MCP', 'hota-mcp', 'An AI agent plays Heroes III: Horn of the Abyss as a real player'],
  ]),
  cat('🧠 AI Agents &amp; Claude Code', [
    ['givememod', 'givememod', 'Say /givememod and Claude Code builds a mod for the task in front of you'],
    ['Prompt Warrior', 'prompt-warrior', 'Gamified analytical portrait of your AI workflow'],
    ['satori', 'satori', 'Self-learning loop for Claude Code — corrections become skills'],
    ['dream-skill', 'dream-skill', 'Memory consolidation for Claude Code — dream/wake passes'],
    ['Angry Switcher', 'angry-switcher', 'Swear at Claude Code all you like — it reads the clean version'],
    ['slapbox', 'slapbox', 'A stress-relief mod for Claude Code when it messes up'],
    ['Jarvis Codex Bot', 'jarvis-codex-bot', 'Telegram assistant on Codex + OpenRouter — text, voice, images'],
  ]),
  cat('🧰 Tools &amp; Fun', [
    ['Strudel for Godot', 'godot-strudel', 'Strudel live-coding engine ported to GDScript'],
    ['Hermes RU Locale', 'hermes-ru-locale', 'Full Russian localization for Hermes Agent Desktop'],
    ['GitLife', 'gitlife', 'Your life as a GitHub contribution graph'],
    ['tg-challenge-bot', 'tg-challenge-bot', 'AI challenge bot for Telegram art communities'],
    ['PiP Twin', 'pip-twin', 'Chrome extension — the same playing video in a second window'],
  ]),
].join('\n\n');

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
  const dev = s.dev || {};
  const devline = [
    `**${fmt(dev.issues_closed)}** ${t.issues}`,
    `**${fmt(dev.commits_month)}** ${t.commits}`,
    `**${fmt(dev.releases)}** ${t.releases}`,
    `**${fmt(dev.stars)}** ${t.stars}`,
  ].join(' · ');
  return `<div align="center">

${switcher}

${HERO}

<a href="${STATS_PAGE}"><img src="dist/telemetry-${lang}.svg" alt="${esc(t.tel_h)}" width="840"></a>

**[${t.tel_see}](${STATS_PAGE})**

</div>

### ${sec.apps}

<img src="dist/projects.svg" alt="Apps" width="840">

### ${t.dev_h}

${devline}

### ${sec.more}

${MORE}

### ${sec.tech}

${TECH.replace('__TECH__', sec.tech)}

<div align="center"><sub>${t.updated}: ${updated} · ${t.foot}</sub></div>
`;
}

// ---- main -------------------------------------------------------------------------------------
async function main() {
  const [pub, gh] = await Promise.all([fetchPublic(), fetchGithub()]);
  const peopleById = new Map((pub.programs || []).map((p) => [p.id, p.people]));
  const featured = FEATURED.map((f) => {
    const node = gh.byName.get(f.repo.toLowerCase());
    return { id: f.id, name: f.name, desc: DESC[f.id] || '', stars: node ? node.stargazerCount : 0, people: peopleById.get(f.id) || 0, repo: `https://github.com/${LOGIN}/${f.repo}` };
  });
  const stats = { ...pub, dev: gh.dev, repos: featured.map(({ id, name, stars, people, repo }) => ({ id, name, stars, people, url: repo })) };

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
  await writeFile(join(ROOT, 'dist', 'projects.svg'), projectsSvg(featured));
  for (const lang of LANGS) {
    await writeFile(join(ROOT, 'dist', `telemetry-${lang}.svg`), telemetrySvg(stats, lang));
    await writeFile(join(ROOT, lang === 'en' ? 'README.md' : `README.${lang}.md`), readme(stats, lang));
  }
  console.log(`[OK] stats.json + ${LANGS.length} READMEs + ${LANGS.length + 1} svg · people=${stats.totals.people} stars=${stats.dev.stars} commits=${stats.dev.commits_month}`);
}

main().catch((e) => {
  console.error('[ERROR]', e.message);
  process.exit(1);
});
