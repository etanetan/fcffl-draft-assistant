#!/usr/bin/env node
// Builds data.js — the shared player database the app scores at runtime.
// Run: node build-data.js
//
// Design note: this file deliberately stores RAW PROJECTED STATS, not points.
// Points depend on the league (half vs full PPR, 4 vs 6 point pass TDs, first-down
// bonuses...), so scoring happens in the browser against whatever league the user
// picked. One data file therefore serves every league instead of one per format.
//
// Sources:
//   Sleeper   — season stat projections (also supplies ids/teams/byes/ages)
//   FantasyPros — expert consensus ranks + tiers, superflex AND half-PPR boards
//   ESPN      — their own PPR draft ranks, as an independent third opinion
//   FFC       — live ADP (2QB and half-PPR) = what the market is actually doing

const fs = require("fs");
const path = require("path");

const SEASON = process.env.SEASON || "2026";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const norm = s => (s || "").toLowerCase()
  .replace(/[.'’`-]/g, "")
  .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "")
  .replace(/\s+/g, " ").trim();
const keyOf = (name, pos) => norm(name) + "|" + (pos || "").toUpperCase();

async function getJSON(url, opts) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(opts?.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
// A dead source should cost us that source, not the whole build.
async function soft(label, fn) {
  try { const v = await fn(); console.log(`  ok   ${label}`); return v; }
  catch (e) { console.warn(`  MISS ${label}: ${e.message}`); return null; }
}

// Only the stat keys any Sleeper scoring setting can reference. Keeping the
// whitelist here (rather than dumping every key) is what holds data.js to a
// sane size — the raw projections payload is ~3 MB.
const STAT_KEYS = [
  "gp", "pass_yd", "pass_td", "pass_int", "pass_2pt", "pass_fd", "pass_cmp", "pass_att",
  "rush_yd", "rush_td", "rush_2pt", "rush_fd", "rush_att",
  "rec", "rec_yd", "rec_td", "rec_2pt", "rec_fd", "rec_tgt",
  "fum_lost", "bonus_rush_td_qb",
  "bonus_rec_yd_100", "bonus_rush_yd_100", "bonus_pass_yd_300",
  "fgm", "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_40_49", "fgm_50p", "xpm", "fgmiss", "xpmiss",
  "pts_allow", "def_st_td", "def_td", "sack", "int", "fum_rec", "safe", "blk_kick",
  "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13", "pts_allow_14_20",
  "pts_allow_21_27", "pts_allow_28_34", "pts_allow_35p",
];

async function main() {
  console.log(`Building data.js for ${SEASON}…`);

  // ---- Sleeper season projections (the backbone) ----
  const posQS = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => `position[]=${p}`).join("&");
  const proj = await getJSON(
    `https://api.sleeper.com/projections/nfl/${SEASON}?season_type=regular&${posQS}&order_by=pts_half_ppr`);
  console.log(`  ok   sleeper projections (${proj.length} rows)`);

  const players = new Map(); // key -> record
  for (const row of proj) {
    const pl = row.player || {}, st = row.stats || {};
    const pos = (pl.position || "").toUpperCase();
    if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos)) continue;
    const name = pos === "DEF"
      ? (pl.last_name || pl.first_name || row.player_id)
      : `${pl.first_name || ""} ${pl.last_name || ""}`.trim();
    if (!name) continue;
    const stats = {};
    for (const k of STAT_KEYS) if (typeof st[k] === "number") stats[k] = Math.round(st[k] * 100) / 100;
    players.set(keyOf(name, pos), {
      id: String(row.player_id), name, pos,
      team: pl.team || "FA",
      age: pl.age || null,
      exp: pl.years_exp,
      bye: null,
      stats,
      adp2qb: st.adp_2qb || null,
      adpHalf: st.adp_half_ppr || null,
      adpPpr: st.adp_ppr || null,
      adpDyn: st.adp_dynasty_2qb || null,
    });
  }

  // ---- FantasyPros consensus (superflex + half-PPR), for ranks and tiers ----
  async function fpBoard(slug) {
    const html = await getText(`https://www.fantasypros.com/nfl/rankings/${slug}.php`);
    const m = html.match(/var\s+ecrData\s*=\s*(\{.*?\});\s*\n/s);
    if (!m) throw new Error("ecrData not found");
    const d = JSON.parse(m[1]);
    const out = new Map();
    for (const p of d.players || []) {
      out.set(keyOf(p.player_name, p.player_position_id), {
        rank: Number(p.rank_ecr) || null,
        tier: Number(p.tier) || null,
        bye: Number(p.player_bye_week) || null,
        best: Number(p.rank_min) || null,
        worst: Number(p.rank_max) || null,
        sd: Number(p.rank_std) || null,
      });
    }
    return { map: out, updated: d.last_updated, experts: d.total_experts };
  }
  const fpSf = await soft("fantasypros superflex", () => fpBoard("superflex-cheatsheets"));
  const fpHalf = await soft("fantasypros half-ppr", () => fpBoard("half-point-ppr-cheatsheets"));

  // ---- ESPN draft ranks ----
  const espn = await soft("espn draft ranks", async () => {
    const filter = { players: { limit: 400, sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "PPR" } } };
    const d = await getJSON(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`,
      { headers: { "x-fantasy-filter": JSON.stringify(filter) } });
    const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
    const out = new Map();
    for (const row of d.players || []) {
      const p = row.player || {};
      const pos = POS[p.defaultPositionId];
      if (!pos) continue;
      const r = (p.draftRanksByRankType || {}).PPR || {};
      if (r.rank) out.set(keyOf(p.fullName, pos), Number(r.rank));
    }
    return out;
  });

  // ---- FFC live ADP (what drafters actually do this week) ----
  async function ffc(fmt, teams) {
    const d = await getJSON(`https://fantasyfootballcalculator.com/api/v1/adp/${fmt}?teams=${teams}&year=${SEASON}`);
    const out = new Map();
    for (const p of d.players || []) out.set(keyOf(p.name, p.position === "PK" ? "K" : p.position), p.adp);
    return { map: out, meta: d.meta };
  }
  const ffc2qb = await soft("ffc adp 2qb", () => ffc("2qb", 12));
  const ffcHalf = await soft("ffc adp half-ppr", () => ffc("half-ppr", 12));

  // ---- merge ----
  for (const [key, p] of players) {
    const sf = fpSf?.map.get(key), hf = fpHalf?.map.get(key);
    p.fpSf = sf?.rank || null;
    p.fpSfTier = sf?.tier || null;
    p.fpHalf = hf?.rank || null;
    p.fpHalfTier = hf?.tier || null;
    // Expert disagreement, kept as a real signal: a wide best/worst spread is a
    // boom/bust profile, which the app turns into upside and risk stars.
    const src = sf || hf;
    p.best = src?.best || null;
    p.worst = src?.worst || null;
    p.bye = sf?.bye || hf?.bye || null;
    p.espn = espn?.get(key) || null;
    p.ffc2qb = ffc2qb?.map.get(key) ?? null;
    p.ffcHalf = ffcHalf?.map.get(key) ?? null;
  }

  // A 10-to-14-team draft is at most ~250 picks, and this board is read on a
  // phone on draft day, so depth past the low 400s is weight without value.
  // Keep anyone a source ranks that deep, plus every projecting K/DEF.
  const DEPTH = 420;
  const within = (r) => r != null && r <= DEPTH;
  const keep = [...players.values()].filter(p => {
    if (["K", "DEF"].includes(p.pos)) return (p.stats.gp || 0) > 0;
    return within(p.fpSf) || within(p.fpHalf) || within(p.espn) ||
           within(p.ffc2qb) || within(p.ffcHalf) || within(p.adp2qb);
  });
  keep.sort((a, b) => (a.fpSf || a.fpHalf || a.espn || 999) - (b.fpSf || b.fpHalf || b.espn || 999));

  const meta = {
    season: SEASON,
    built: new Date().toISOString(),
    sources: {
      sleeper_projections: proj.length,
      fantasypros_superflex: fpSf ? `${fpSf.map.size} players / ${fpSf.experts} experts / ${fpSf.updated}` : null,
      fantasypros_half: fpHalf ? `${fpHalf.map.size} players / ${fpHalf.experts} experts / ${fpHalf.updated}` : null,
      espn: espn ? `${espn.size} players` : null,
      ffc_2qb: ffc2qb ? `${ffc2qb.meta.total_drafts} drafts thru ${ffc2qb.meta.end_date}` : null,
      ffc_half: ffcHalf ? `${ffcHalf.meta.total_drafts} drafts thru ${ffcHalf.meta.end_date}` : null,
    },
  };

  const out = `// GENERATED by build-data.js — do not hand-edit.
// Raw projected stats + multi-source ranks. Points are computed in the browser
// from the selected league's own scoring settings, so this file is format-agnostic.
window.DATA_META = ${JSON.stringify(meta, null, 2)};
window.PLAYER_DATA = [
${keep.map(p => JSON.stringify(p)).join(",\n")}
];
`;
  fs.writeFileSync(path.join(__dirname, "data.js"), out);
  console.log(`\nwrote data.js — ${keep.length} players, ${(out.length / 1024).toFixed(0)} KB`);
  console.log(JSON.stringify(meta.sources, null, 2));
}

main().catch(e => { console.error("build failed:", e); process.exit(1); });
