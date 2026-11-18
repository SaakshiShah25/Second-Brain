# MyConfía LinkedIn page: posting guide

Everything you need to run the MyConfía company page for 6 weeks: 23 posts, in order, with the media for each.

- **The text for every post** is in [posts.md](posts.md). Copy the whole grey box for a post: the hook is at the top and the hashtags are at the end.
- **Images, carousels and thumbnails** are in [out/](out/).
- **Videos** are in [../v2/out/](../v2/out/).

Post between **8:30 and 10:00 AM IST**.

## Before the first post

Set up the page (Admin view → Edit page):

1. **Logo:** [out/page-assets/logo-400.png](out/page-assets/logo-400.png)
2. **Cover image:** [out/page-assets/cover-1128x191.png](out/page-assets/cover-1128x191.png)
3. **Tagline** and **About:** copy them from the "Page setup" section of [posts.md](posts.md).

## The order

| # | Date | Type | Post | Media |
|---|---|---|---|---|
| **Week 1** |||||
| 1 | Mon 23 Nov | Image | Welcome | `out/images/p01-welcome.png` |
| 2 | Tue 24 Nov | Video | You're not one person | `../v2/out/01-intro.mp4` · thumb `out/thumbnails/01-intro.jpg` |
| 3 | Wed 25 Nov | Image | Meet the five | `out/images/p02-meet-the-five.png` |
| 4 | Thu 26 Nov | Video | Say it once, it's everywhere | `../v2/out/02-everywhere.mp4` · thumb `02-everywhere.jpg` |
| **Week 2** |||||
| 5 | Mon 30 Nov | Carousel | How it works | `out/carousels/p03-how-it-works.pdf` |
| 6 | Tue 1 Dec | Video | On the web | `../v2/out/03-web.mp4` · thumb `03-web.jpg` |
| 7 | Wed 2 Dec | Image | It's not a to-do app | `out/images/p04-not-a-todo-app.png` |
| 8 | Thu 3 Dec | Video | On your phone | `../v2/out/04-mobile.mp4` · thumb `04-mobile.jpg` |
| **Week 3** |||||
| 9 | Mon 7 Dec | Image | "The palest ink…" quote | `out/images/p05-palest-ink.png` |
| 10 | Tue 8 Dec | Video | Inside Claude | `../v2/out/05-claude.mp4` · thumb `05-claude.jpg` |
| 11 | Wed 9 Dec | Carousel | Connect to Claude | `out/carousels/p06-claude-setup.pdf` |
| 12 | Thu 10 Dec | Video | Your data, in plain words | `../v2/out/06-secure.mp4` · thumb `06-secure.jpg` |
| **Week 4** |||||
| 13 | Mon 14 Dec | Image | Light or dark? (vote) | `out/images/p07-light-or-dark.png` |
| 14 | Tue 15 Dec | Video | Most apps think you're one person | `../v2/out/07-five.mp4` · thumb `07-five.jpg` |
| 15 | Wed 16 Dec | Image | Say it messy | `out/images/p08-say-it-messy.png` |
| 16 | Thu 17 Dec | Video | Students | `../v2/out/08-student.mp4` · thumb `08-student.jpg` |
| — | 21 Dec – 1 Jan | — | **Holiday break, no posts** | |
| **Week 5** |||||
| 17 | Mon 4 Jan | Image | What we shipped | `out/images/p09-shipped.png` |
| 18 | Tue 5 Jan | Video | Founders | `../v2/out/09-founder.mp4` · thumb `09-founder.jpg` |
| 19 | Wed 6 Jan | Image | Which of your five forgets? (poll) | `out/images/p10-which-one.png` |
| 20 | Thu 7 Jan | Video | 9-to-5 + side hustle | `../v2/out/10-professional.mp4` · thumb `10-professional.jpg` |
| **Week 6** |||||
| 21 | Mon 11 Jan | Image | 5 privacy questions | `out/images/p11-privacy.png` |
| 22 | Tue 12 Jan | Video | Parents | `../v2/out/11-parent.mp4` · thumb `11-parent.jpg` |
| 23 | Thu 14 Jan | Video | Join the waitlist | `../v2/out/12-waitlist.mp4` · thumb `12-waitlist.jpg` |

The post numbers match the numbered sections in [posts.md](posts.md).

## How to post each type

**Image post**
1. Start a post from the page and add the image.
2. Paste the text from posts.md.

**Video post**
1. Upload the MP4 itself. Don't post a YouTube or Drive link; LinkedIn shows native videos to far more people.
2. Before posting, open the video's settings and choose **Edit thumbnail**, then upload the matching `.jpg` from `out/thumbnails/` (same number as the video).
3. Paste the text.

**Carousel post**
1. Choose **Add a document** and upload the PDF.
2. LinkedIn asks for a document title; use the one listed under that post in posts.md.
3. Paste the text.

## After each post

- **First hour:** reply to every comment. That's when LinkedIn decides how widely to show a post.
- **Personal profiles:** ask Sanket (and anyone else on the team) to re-share the post from their own profile, adding one line of their own.

## To do along the way

- [ ] **Week 2:** check that MyConfía is live on Google Play before post 8, which says it is.
- [ ] **Week 4 / Week 6:** posts 13 and 19 promise to share results "next week". Write a short results post: one for post 13 (around Wed 23 Dec, or just after the break) and one for post 19 on Wed 13 Jan.
- [ ] **Before 4 Jan:** post 17 lists features shipped in mid-November; ask Sanket what's new and update it.
- [ ] **Before 14 Jan:** get the waitlist link and put it in place of `[WAITLIST LINK]` in post 23's first comment. Post that comment straight after publishing.

## Preview everything in a browser (optional)

If you have the repo and Node installed, you can see every post with its media and a **Copy post** button:

```
cd marketing/linkedin
npm install
node serve.mjs
```

Then open http://localhost:4173/page/.
