// Writes posts.md (all copy, ready to paste) from posts.js: node build-posts.mjs
import { writeFile } from 'node:fs/promises';
import { posts, schedule } from './posts.js';

let md = `# MyConfía · LinkedIn campaign\n\n`;
md += `**Cadence:** ${schedule.cadence}.  \n**Format:** each post has a 1080×1350 (4:5) MP4 with sound in \`out/\`, plus a .jpg thumbnail.  \n`;
md += `**Links:** put the waitlist link in the first comment, not in the post. Replace \`[WAITLIST LINK]\` everywhere.\n\n`;
md += `| # | When | Post | Video |\n|---|---|---|---|\n`;
posts.forEach((p, i) => { md += `| ${i + 1} | ${p.week} | ${p.series} | \`out/${p.id}.mp4\` |\n`; });
posts.forEach((p, i) => {
  md += `\n---\n\n## ${String(i + 1).padStart(2, '0')} · ${p.series}\n\n`;
  md += `**When:** ${p.week} · **Video:** \`out/${p.id}.mp4\` · **Thumbnail:** \`out/${p.id}.jpg\`\n\n`;
  md += `**Hook:** ${p.headline}\n\n`;
  md += '```text\n' + p.body + '\n\n' + p.hashtags.join(' ') + '\n```\n\n';
  md += `**First comment:** ${p.comment}\n`;
});
await writeFile(new URL('./posts.md', import.meta.url), md);
console.log(`posts.md written (${posts.length} posts)`);
