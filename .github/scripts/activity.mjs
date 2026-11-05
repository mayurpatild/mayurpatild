// Renders the last N public events into README.md between the activity markers.
// Covers pushes, new repos/branches, PRs, issues and releases — not just PR/issue events.
import { readFileSync, writeFileSync } from 'node:fs';

const user = process.env.GH_USER ?? 'mayurpatild';
const max = Number(process.env.MAX_LINES ?? 6);
let events;
if (process.env.EVENTS_FILE) {
  events = JSON.parse(readFileSync(process.env.EVENTS_FILE, 'utf8'));   // offline testing
} else {
  const res = await fetch(`https://api.github.com/users/${user}/events/public?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`events: ${res.status}`);
  events = await res.json();
}

const repoLink = (r) => `[${r.name.split('/')[1]}](https://github.com/${r.name})`;
const lines = [];
const seen = new Set();
for (const e of events) {
  let line;
  const r = e.repo, p = e.payload;
  switch (e.type) {
    case 'PushEvent': {
      const n = p.commits?.length || p.distinct_size || p.size || 0;
      const msg = p.commits?.at(-1)?.message?.split('\n')[0];
      line = n ? `Pushed ${n} commit${n === 1 ? '' : 's'} to ${repoLink(r)}${msg ? ` — ${msg}` : ''}` : `Pushed to ${repoLink(r)}`;
      break;
    }
    case 'CreateEvent':
      if (p.ref_type === 'branch' && /^(main|master)$/.test(p.ref)) continue;   // initial branch of a new repo is not news
      line = p.ref_type === 'repository' ? `Created ${repoLink(r)}` : `Created ${p.ref_type} \`${p.ref}\` in ${repoLink(r)}`; break;
    case 'PullRequestEvent': line = `${p.action === 'closed' && p.pull_request?.merged ? 'Merged' : p.action[0].toUpperCase() + p.action.slice(1)} PR [#${p.number}](${p.pull_request.html_url}) in ${repoLink(r)} — ${p.pull_request.title}`; break;
    case 'IssuesEvent': line = `${p.action[0].toUpperCase() + p.action.slice(1)} issue [#${p.issue.number}](${p.issue.html_url}) in ${repoLink(r)} — ${p.issue.title}`; break;
    case 'ReleaseEvent': line = `Released [${p.release.tag_name}](${p.release.html_url}) in ${repoLink(r)}`; break;
    case 'WatchEvent': line = `Starred ${repoLink(r)}`; break;
    default: continue;
  }
  const key = line.replace(/\d+ commits?/, 'N commits');
  if (seen.has(key)) continue;
  seen.add(key);
  lines.push(`- ${line}`);
  if (lines.length >= max) break;
}

const start = '<!--START_SECTION:activity-->', end = '<!--END_SECTION:activity-->';
const readme = readFileSync('README.md', 'utf8');
const [before, rest] = readme.split(start);
const after = rest.split(end)[1];
const body = lines.length ? lines.join('\n') : '- Quiet week. See [repositories](https://github.com/mayurpatild?tab=repositories).';
const next = `${before}${start}\n${body}\n${end}${after}`;
if (next !== readme) { writeFileSync('README.md', next); console.log(`updated with ${lines.length} lines`); } else console.log('no change');
