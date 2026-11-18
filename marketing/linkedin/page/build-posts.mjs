// Writes posts.md (every post, ready to paste) from posts.js: node build-posts.mjs
import { writeFile } from 'node:fs/promises';
import { posts, schedule, pageAssets, pageAbout } from './posts.js';

const KIND = { video: '🎬 Video', image: '🖼️ Image', carousel: '📑 Carousel (PDF)' };
let md = `# MyConfía · LinkedIn page posts\n\n**Campaign line:** You’re not one person. You’re five.  \n**Cadence:** ${schedule.cadence}.  \n`;
md += `**Count:** ${posts.filter(p => p.kind === 'video').length} video posts + ${posts.filter(p => p.kind !== 'video').length} image/carousel posts.  \n`;
md += `**Call to action:** only the last post mentions the waitlist; its link goes in the first comment (replace \`[WAITLIST LINK]\`).\n\n`;
md += `**Posting tips**\n${schedule.tips.map(t => `- ${t}`).join('\n')}\n\n`;
md += `## Page setup\n\n${pageAssets.map(a => `- ${a.use}: \`${a.file}\``).join('\n')}\n- Tagline: ${pageAbout.tagline}\n\n**About**\n\n\`\`\`text\n${pageAbout.about}\n\`\`\`\n\n`;
md += `## Calendar\n\n| # | When | Type | Post | Media |\n|---|---|---|---|---|\n`;
posts.forEach((p, i) => { md += `| ${i + 1} | ${p.when} | ${KIND[p.kind]} | ${p.series} | \`${p.media}\` |\n`; });
posts.forEach((p, i) => {
  md += `\n---\n\n## ${String(i + 1).padStart(2, '0')} · ${p.series}  (${KIND[p.kind]})\n\n`;
  md += `**When:** ${p.when}  \n**Media:** \`${p.media}\`  \n`;
  if (p.thumb) md += `**Thumbnail:** \`${p.thumb}\`  \n`;
  if (p.docTitle) md += `**Document title:** ${p.docTitle}  \n`;
  md += `**Hook:** ${p.hook}\n\n`;
  md += '```text\n' + p.body + '\n\n' + p.hashtags.join(' ') + '\n```\n';
  if (p.comment) md += `\n**First comment:** ${p.comment}\n`;
});
await writeFile(new URL('./posts.md', import.meta.url), md);
console.log(`posts.md written (${posts.length} posts)`);
