// Renders assets/github-activity.svg from the public GitHub contribution calendar.
// Usage (GitHub Actions): GH_USERNAME=<login> GITHUB_TOKEN=<token> node scripts/build-activity.mjs
// Usage (offline layout preview): PLACEHOLDER=1 node scripts/build-activity.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const user = process.env.GH_USERNAME || "Dhanux05";
const OUT = "assets/github-activity.svg";
const COLORS = ["#1B1B1B", "#5A4D00", "#BDA500", "#E8C400", "#FFD900"];
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function load() {
  if (process.env.PLACEHOLDER) {
    // 53 empty weeks ending today, used only to draw the first (empty) version.
    const weeks = [];
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (52 * 7 + end.getDay()));
    for (let w = 0; w < 53; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + w * 7 + d);
        if (dt <= end) days.push({ date: dt.toISOString().slice(0, 10), count: 0, level: 0 });
      }
      weeks.push(days);
    }
    return { weeks, total: null };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required (or set PLACEHOLDER=1).");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-activity" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = await res.json();
  const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error("No calendar in response: " + JSON.stringify(json).slice(0, 300));
  const weeks = cal.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 }))
  );
  return { weeks, total: cal.totalContributions };
}

function stats(weeks, total) {
  const days = weeks.flat();
  const active = days.filter((d) => d.count > 0).length;
  let best = 0, run = 0, longest = 0;
  for (const d of days) {
    best = Math.max(best, d.count);
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // current streak: walk back from today (skip today if still empty)
  let cur = 0, i = days.length - 1;
  if (days[i] && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) cur++;
  const sum = total ?? days.reduce((a, d) => a + d.count, 0);
  return { sum, active, longest, best, cur };
}

function render({ weeks, total }, placeholder) {
  const S = stats(weeks, total);
  const X0 = 40, Y0 = 104, P = 13, C = 11;
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  let cells = "";
  const labels = [];
  let last = -1;
  weeks.forEach((w, wi) => {
    const m = new Date(w[0].date + "T00:00:00Z").getUTCMonth();
    if (m !== last) { labels.push({ wi, m }); last = m; }
    w.forEach((d) => {
      const y = Y0 + new Date(d.date + "T00:00:00Z").getUTCDay() * P;
      cells += `<rect x="${X0 + wi * P}" y="${y}" width="${C}" height="${C}" fill="${COLORS[d.level]}"><title>${d.count} on ${d.date}</title></rect>`;
    });
  });
  // avoid crowded labels at either end of the grid
  if (labels.length > 1 && labels[1].wi - labels[0].wi < 3) labels.shift();
  if (labels.length > 1 && weeks.length - labels[labels.length - 1].wi < 3) labels.pop();
  const months = labels.map((l) => `<text class="m" x="${X0 + l.wi * P}" y="86" font-size="11" letter-spacing="1">${MON[l.m]}</text>`).join("");
  const stamp = new Date().toISOString().slice(0, 10);
  const fmt = (n) => (placeholder ? "—" : String(n));
  const cols = [[fmt(S.sum), "CONTRIBUTIONS"], [fmt(S.active), "ACTIVE DAYS"], [fmt(S.longest), "LONGEST STREAK"], [fmt(S.best), "BEST DAY"]];
  const stat = cols.map(([n, l], i) => `<text class="c y" x="${40 + i * 180}" y="318" font-size="64">${n}</text><text class="m" x="${40 + i * 180}" y="346" font-size="12">${l}</text>`).join("");
  const legend = COLORS.map((c, i) => `<rect x="${600 + i * 16}" y="206" width="11" height="11" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 380" width="800" height="380" role="img" aria-label="GitHub contribution heatmap for ${user}${placeholder ? " (waiting for first refresh)" : ""}.">
<style>
.c{font-family:Impact,Haettenschweiler,"Arial Narrow Bold","Arial Narrow",sans-serif;fill:#F3EFE4}
.m{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;letter-spacing:2px;fill:#B8B5AC}
.y{fill:#FFD900}
</style>
<rect width="800" height="380" fill="#0B0B0B"/>
<text class="m" x="40" y="42"><tspan class="y">05.1</tspan>  /  LAST 12 MONTHS</text>
<text class="m" x="760" y="42" text-anchor="end" font-size="12">${placeholder ? "AWAITING FIRST SYNC" : "SYNCED " + stamp}</text>
<path d="M40 60H760" stroke="#303030"/>
${months}${cells}
<text class="m" x="552" y="215" font-size="11">LESS</text>${legend}<text class="m" x="686" y="215" font-size="11">MORE</text>
<path d="M40 250H760" stroke="#303030"/>
${stat}
</svg>
`;
}

const data = await load();
mkdirSync("assets", { recursive: true });
writeFileSync(OUT, render(data, !!process.env.PLACEHOLDER));
console.log("wrote", OUT);
