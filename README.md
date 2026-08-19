<div align="center">

# Cinetier

**Turn your film history into a tier list.**

Import your IMDb or Letterboxd data, filter it however you like, and rank it.
Everything runs in your browser — no account, no upload, no server.

[Open Cinetier](https://myqzurdux3.github.io/cinetier/)

> **Status:** in development — importing and browsing your library work today. Filtering and the tier board land next.

</div>

---

## What it does

You have rated hundreds of films on IMDb or Letterboxd. Cinetier turns that
history into a tier list you can share.

- **Import your own data.** Drop in an IMDb export or a Letterboxd export
  `.zip`, exactly as those services give it to you — ratings, watchlists and
  lists alike, films and series alike, in whatever language your account uses.
- **Filter before you rank.** Only films you watched this year. Only those you
  rated above four stars. Only 1980s horror under 100 minutes. Only the ones you
  liked far more than everyone else did.
- **Start from your ratings, or from nothing.** Cinetier pre-fills the tiers
  from the scores you already gave, and you drag from there — or empty the board
  and rank entirely by hand.
- **Export a PNG** to share, and keep as many saved tier lists as you like.

## Privacy

Your ratings never leave your browser. There is no server and no account.
Films are stored locally, and the only outbound requests are to TMDB, which
receive a title, year, or IMDb identifier in order to fetch a poster — never
your ratings and never your history.

## Getting your data

**IMDb** — Your Ratings page > the three-dot menu > Export. You will receive
`ratings.csv` by email or download.

**Letterboxd** — Settings > Import & Export > Export Your Data. Upload the
`.zip` as it is; Cinetier unpacks it for you. If you do not see an export option
in your settings, Letterboxd may require a Pro subscription for it; an IMDb
export works on any account, free or paid.

Because IMDb does not export watch dates, Cinetier uses your rating date instead
for IMDb imports, and labels it as such. Letterboxd diary entries carry real
watch dates.

## Running it locally

```bash
git clone https://github.com/myqzurdux3/cinetier.git
cd cinetier
npm install
cp .env.example .env.local   # then add a free TMDB API key
npm run dev
```

Get a TMDB key at https://www.themoviedb.org/settings/api. The key is read-only
and ships in the client bundle by design — this application has no backend to
hide it behind.

## Development

```bash
npm run test        # watch mode
npm run test:run    # single run
npm run lint
npm run typecheck
npm run build
```

Architecture is layered: `parsers/` turns exported files into a unified `Film`
model, `domain/` holds every rule worth testing as pure TypeScript, `services/`
owns the only network and storage access, `enrich/` composes those services into
the progressive TMDB fill-in, and `ui/` renders. `domain/` and `parsers/` import
nothing from the outer layers, which is enforced by ESLint.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Licence

MIT. See [LICENSE](LICENSE).

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

Cinetier is not affiliated with, endorsed by, or connected to IMDb or Letterboxd.
