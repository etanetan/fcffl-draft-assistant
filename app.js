"use strict";

// Draft assistant. Nothing here is hardcoded to a league: you give it a Sleeper
// username, it reads whatever league you pick, and every number on screen is
// derived from that league's own scoring settings and roster slots.
//
// The chain is: raw projected stats (data.js)
//   -> points, using league.scoring_settings
//   -> VOR, using league.roster_positions x team count
//   -> a blended rank (our model + FantasyPros ECR + ADP + ESPN)
//   -> recommendations, which rank on what you LOSE by waiting a turn.

const API = "https://api.sleeper.app/v1";
const POLL_MS = 5000;
const LS = { user: "da_user", season: "da_season", league: "da_league", manual: "da_manual_" };

const S = {
  season: "2026", username: "", userId: "",
  league: null, scoring: {}, rosterPos: [], teams: 12,
  superflex: false, ppr: 1,
  rosters: [], users: {}, rosterById: {},
  myRosterId: null, mySlot: null,
  draft: null, picks: [], traded: [], keeperIds: new Set(),
  players: [], byKey: new Map(),
  manualGone: new Set(),
  activeTab: "ALL", pollTimer: null,
};

// ---------- helpers ----------
const norm = s => (s || "").toLowerCase().replace(/[.'’`-]/g, "")
  .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "").replace(/\s+/g, " ").trim();
const keyOf = (name, pos) => norm(name) + "|" + (pos || "").toUpperCase();
const el = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function api(path) {
  const r = await fetch(API + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} on ${path}`);
  return r.json();
}

// ---------- setup ----------
function showSetup(msg) {
  el("setup").hidden = false;
  el("app").hidden = true;
  if (msg) el("su-msg").textContent = msg;
}

async function findLeagues() {
  const username = el("su-user").value.trim();
  const season = el("su-season").value.trim() || "2026";
  if (!username) return;
  el("su-msg").textContent = "looking up " + username + "…";
  el("su-leagues").innerHTML = "";
  try {
    const user = await api(`/user/${encodeURIComponent(username)}`);
    if (!user || !user.user_id) throw new Error("no such user");
    S.username = user.display_name || username;
    S.userId = user.user_id;
    S.season = season;
    const leagues = await api(`/user/${user.user_id}/leagues/nfl/${season}`);
    if (!leagues.length) { el("su-msg").textContent = `No ${season} leagues for ${S.username}.`; return; }
    el("su-msg").textContent = `${S.username} — ${leagues.length} league${leagues.length > 1 ? "s" : ""}:`;
    el("su-leagues").innerHTML = leagues.map(l => {
      const sf = (l.roster_positions || []).includes("SUPER_FLEX") ? "SUPERFLEX" : "";
      const ppr = (l.scoring_settings || {}).rec;
      const fmt = ppr >= 1 ? "PPR" : ppr > 0 ? "half-PPR" : "standard";
      const kp = (l.settings || {}).max_keepers > 0 ? `${l.settings.max_keepers} keepers` : "";
      return `<button class="lg-btn" data-id="${l.league_id}">
        <b>${esc(l.name)}</b>
        <span>${l.total_rosters}-team · ${fmt}${sf ? " · " + sf : ""}${kp ? " · " + kp : ""} · ${esc(l.status)}</span>
      </button>`;
    }).join("");
    el("su-leagues").querySelectorAll(".lg-btn").forEach(b =>
      b.addEventListener("click", () => {
        localStorage.setItem(LS.user, S.username);
        localStorage.setItem(LS.season, season);
        localStorage.setItem(LS.league, b.dataset.id);
        loadLeague(b.dataset.id);
      }));
  } catch (e) {
    el("su-msg").textContent = "Couldn't find that user — check the spelling. (" + e.message + ")";
  }
}

async function loadLeague(leagueId) {
  el("su-msg").textContent = "loading league…";
  try {
    const [league, rosters, users] = await Promise.all([
      api(`/league/${leagueId}`), api(`/league/${leagueId}/rosters`), api(`/league/${leagueId}/users`),
    ]);
    S.league = league;
    S.scoring = league.scoring_settings || {};
    S.rosterPos = league.roster_positions || [];
    S.teams = league.total_rosters || rosters.length || 12;
    S.superflex = S.rosterPos.includes("SUPER_FLEX") ||
      S.rosterPos.filter(p => p === "QB").length > 1;
    S.ppr = S.scoring.rec || 0;
    S.rosters = rosters;
    S.users = Object.fromEntries(users.map(u => [u.user_id, u.display_name]));
    S.rosterById = Object.fromEntries(rosters.map(r => [r.roster_id, r]));

    if (!S.userId) {
      const me = users.find(u => (u.display_name || "").toLowerCase() === S.username.toLowerCase());
      if (me) S.userId = me.user_id;
    }
    const mine = rosters.find(r => r.owner_id === S.userId) ||
                 rosters.find(r => (r.co_owners || []).includes(S.userId));
    S.myRosterId = mine ? mine.roster_id : null;

    // Keepers are off the board before the first pick is made, and they are the
    // whole reason a keeper league's board looks nothing like its ADP.
    S.keeperIds = new Set();
    for (const r of rosters) for (const k of (r.keepers || [])) S.keeperIds.add(String(k));

    S.manualGone = new Set(JSON.parse(localStorage.getItem(LS.manual + leagueId) || "[]"));

    if (league.draft_id) {
      const [draft, picks, traded] = await Promise.all([
        api(`/draft/${league.draft_id}`),
        api(`/draft/${league.draft_id}/picks`).catch(() => []),
        api(`/draft/${league.draft_id}/traded_picks`).catch(() => []),
      ]);
      S.draft = draft; S.picks = picks || []; S.traded = traded || [];
      const order = draft.slot_to_roster_id || {};
      for (const [slot, rid] of Object.entries(order)) if (rid === S.myRosterId) S.mySlot = Number(slot);
    }

    buildPlayers();
    el("setup").hidden = true;
    el("app").hidden = false;
    renderHeaderMeta();
    wireApp();
    render();
    if (S.pollTimer) clearInterval(S.pollTimer);
    S.pollTimer = setInterval(poll, POLL_MS);
  } catch (e) {
    showSetup("Couldn't load that league: " + e.message);
  }
}

// ---------- scoring ----------
// Multiply every projected stat by whatever this league pays for it. Keys the
// league doesn't score simply never match, so a standard league and a
// first-down-bonus league both come out right with no special cases.
const NON_SCORING = new Set(["gp", "pass_att", "pass_cmp", "rush_att", "rec_tgt"]);
function scoreStats(stats) {
  let pts = 0;
  for (const k in stats) {
    if (NON_SCORING.has(k)) continue;
    const w = S.scoring[k];
    if (typeof w === "number") pts += w * stats[k];
  }
  return pts;
}

// ---------- value model ----------
const FLEX_ELIG = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  WRRB_WRT: ["RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRTE_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const isFlex = p => !!FLEX_ELIG[p];
const REAL_POS = ["QB", "RB", "WR", "TE", "K", "DEF"];

// Replacement level = the best player at a position who does NOT get started
// anywhere in the league. Deriving it from the actual slot list is what makes
// superflex work: two QB-eligible slots per team drains the QB pool far deeper,
// the baseline drops, and every real QB's VOR rises without a hand-tuned bonus.
function computeReplacement(pool) {
  const byPos = {};
  for (const p of REAL_POS) byPos[p] = pool.filter(x => x.pos === p).sort((a, b) => b.pts - a.pts);
  const used = Object.fromEntries(REAL_POS.map(p => [p, 0]));

  for (const slot of S.rosterPos) {
    if (slot === "BN" || slot === "IR" || slot === "TAXI" || isFlex(slot)) continue;
    if (byPos[slot]) used[slot] += S.teams;
  }
  for (const slot of S.rosterPos) {
    if (!isFlex(slot)) continue;
    const elig = FLEX_ELIG[slot].filter(p => byPos[p]);
    for (let t = 0; t < S.teams; t++) {
      let best = null;
      for (const p of elig) {
        const cand = byPos[p][used[p]];
        if (cand && (!best || cand.pts > best.pts)) best = { pos: p, pts: cand.pts };
      }
      if (best) used[best.pos]++;
    }
  }
  const rep = {};
  for (const p of REAL_POS) {
    const list = byPos[p];
    if (!list.length) { rep[p] = 0; continue; }
    const i = Math.min(used[p], list.length - 1);
    rep[p] = list[i] ? list[i].pts : list[list.length - 1].pts;
  }
  return rep;
}

// Blend our model with the market. Ranks (not points) are averaged, because the
// outside sources only ever give us an ordering. When the league is superflex we
// use FantasyPros' superflex board and 2QB ADP; ESPN only publishes a 1-QB PPR
// rank, so its QB ordering is thrown away there rather than dragging QBs down.
const WEIGHTS = { model: 0.42, ecr: 0.28, adp: 0.20, espn: 0.10 };

// Positions this league actually starts. A league with no K or DEF slot should
// never see a kicker on its board, let alone be told to draft one.
function usedPositions() {
  const set = new Set();
  for (const slot of S.rosterPos) {
    if (isFlex(slot)) FLEX_ELIG[slot].forEach(p => set.add(p));
    else if (REAL_POS.includes(slot)) set.add(slot);
  }
  if (!set.size) REAL_POS.forEach(p => set.add(p));
  return set;
}

function buildPlayers() {
  const raw = window.PLAYER_DATA || [];
  const use = usedPositions();
  S.usedPos = use;
  const pool = raw.filter(p => use.has(p.pos)).map(p => ({
    ...p,
    key: keyOf(p.name, p.pos),
    pts: Math.round(scoreStats(p.stats) * 10) / 10,
    ecr: S.superflex ? (p.fpSf || p.fpHalf) : (p.fpHalf || p.fpSf),
    tier: S.superflex ? (p.fpSfTier || p.fpHalfTier) : (p.fpHalfTier || p.fpSfTier),
    adp: S.superflex ? (p.ffc2qb || p.adp2qb) : (p.ffcHalf || p.adpHalf || p.adpPpr),
  }));

  const rep = computeReplacement(pool);
  for (const p of pool) p.vor = Math.round((p.pts - (rep[p.pos] ?? 0)) * 10) / 10;

  // rank each signal, then blend the ranks we actually have
  const rankMap = (list, get) => {
    const m = new Map();
    list.filter(p => get(p) != null).sort((a, b) => get(a) - get(b))
      .forEach((p, i) => m.set(p.key, i + 1));
    return m;
  };
  const rModel = rankMap(pool, p => -p.vor);
  const rEcr = rankMap(pool, p => p.ecr);
  const rAdp = rankMap(pool, p => p.adp);
  const rEspn = rankMap(pool, p => (S.superflex && p.pos === "QB") ? null : p.espn);

  for (const p of pool) {
    const parts = [
      [WEIGHTS.model, rModel.get(p.key)],
      [WEIGHTS.ecr, rEcr.get(p.key)],
      [WEIGHTS.adp, rAdp.get(p.key)],
      [WEIGHTS.espn, rEspn.get(p.key)],
    ].filter(([, r]) => r != null);
    const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
    p.blend = parts.reduce((a, [w, r]) => a + w * r, 0) / wsum;
    p.sources = parts.length;

    // Expert spread doubles as a risk profile: a big gap between a player's best
    // and worst expert rank is exactly what "boom/bust" means.
    const spread = (p.best != null && p.worst != null && p.ecr) ? p.worst - p.best : null;
    const scale = Math.max(18, p.ecr ? p.ecr * 0.40 : 18);
    p.upside = spread ? Math.max(1, Math.min(5, Math.round(1 + (p.ecr - p.best) / scale))) : 3;
    p.risk = spread ? Math.max(1, Math.min(5, Math.round(1 + (p.worst - p.ecr) / scale))) : 3;
  }

  pool.sort((a, b) => a.blend - b.blend);
  pool.forEach((p, i) => { p.rank = i + 1; });
  S.players = pool;
  S.byKey = new Map(pool.map(p => [p.key, p]));
  S.replacement = rep;
}

// ---------- draft structure ----------
function slotForPick(no) {
  const t = S.teams, rnd = Math.ceil(no / t), idx = (no - 1) % t;
  const type = S.draft?.type || "snake";
  if (type !== "snake") return idx + 1;
  let rev = rnd % 2 === 0;
  const rr = S.draft?.settings?.reversal_round || 0;
  if (rr && rnd >= rr) rev = !rev;          // 3rd-round-reversal style drafts
  return rev ? t - idx : idx + 1;
}
function tradedMap() {
  const m = new Map();
  for (const t of S.traded) m.set(t.round + "|" + t.roster_id, t.owner_id);
  return m;
}
function ownerOfPick(no, tmap) {
  const rnd = Math.ceil(no / S.teams);
  const orig = (S.draft?.slot_to_roster_id || {})[slotForPick(no)];
  return tmap.get(rnd + "|" + orig) ?? orig;
}
// Picks I still get to make: mine by trade-adjusted ownership, minus any that a
// keeper has already been slotted into.
function myPickNumbers() {
  if (!S.draft || S.myRosterId == null) return [];
  const rounds = S.draft.settings?.rounds || S.rosterPos.filter(p => p !== "IR" && p !== "TAXI").length;
  const tmap = tradedMap();
  const taken = new Set(S.picks.map(p => p.pick_no));
  const out = [];
  for (let no = 1; no <= rounds * S.teams; no++) {
    if (ownerOfPick(no, tmap) === S.myRosterId && !taken.has(no)) out.push(no);
  }
  return out;
}

function pickInfo(p) {
  const m = p.metadata || {};
  const name = m.position === "DEF" ? (m.last_name || m.first_name || "")
    : `${m.first_name || ""} ${m.last_name || ""}`.trim();
  return { name, pos: (m.position || "").toUpperCase(), team: m.team || "",
           key: keyOf(name, m.position), pickNo: p.pick_no, rosterId: p.roster_id,
           isKeeper: !!p.is_keeper };
}
function goneMap() {
  const g = new Map();
  for (const pk of S.picks) {
    const i = pickInfo(pk);
    g.set(i.key, { pickNo: i.pickNo, rosterId: i.rosterId, keeper: i.isKeeper });
  }
  // Keepers that Sleeper has not yet slotted into a pick still are not draftable.
  for (const p of S.players) {
    if (S.keeperIds.has(p.id) && !g.has(p.key)) {
      const r = S.rosters.find(r => (r.keepers || []).map(String).includes(p.id));
      g.set(p.key, { pickNo: null, rosterId: r?.roster_id, keeper: true });
    }
  }
  return g;
}
const isGone = (p, g) => g.has(p.key) || S.manualGone.has(p.key);

function myRoster(gone) {
  const out = [];
  for (const [key, v] of gone) {
    if (v.rosterId !== S.myRosterId) continue;
    const p = S.byKey.get(key);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.pts - a.pts);
}

// ---------- lineup math ----------
// Greedy best starting lineup for a set of players against this league's slots.
// Dedicated slots first, then flexes take the best remaining eligible player, so
// a superflex slot naturally grabs a QB2 when one is on the roster.
function lineupValue(roster) {
  const byPos = {};
  for (const p of roster) (byPos[p.pos] = byPos[p.pos] || []).push(p.pts);
  for (const k in byPos) byPos[k].sort((a, b) => b - a);
  const used = {};
  let total = 0;
  const take = pos => {
    const i = used[pos] || 0;
    if (byPos[pos] && byPos[pos][i] != null) { total += byPos[pos][i]; used[pos] = i + 1; return true; }
    return false;
  };
  for (const slot of S.rosterPos) {
    if (slot === "BN" || slot === "IR" || slot === "TAXI" || isFlex(slot)) continue;
    take(slot);
  }
  for (const slot of S.rosterPos) {
    if (!isFlex(slot)) continue;
    let best = null;
    for (const pos of FLEX_ELIG[slot]) {
      const i = used[pos] || 0;
      const v = byPos[pos] && byPos[pos][i];
      if (v != null && (!best || v > best.v)) best = { pos, v };
    }
    if (best) { total += best.v; used[best.pos] = (used[best.pos] || 0) + 1; }
  }
  return total;
}

// ---------- recommendations ----------
// The question at a pick is never "who is best" — it is "who will I regret not
// taking". So each candidate is scored on how much starting-lineup value he adds
// NOW versus the best I could still get at that position on my next turn, after
// the room has taken its ADP-expected chunk out of the board.
function recommend(gone) {
  const avail = S.players.filter(p => !isGone(p, gone));
  // Sleeper slots keepers into the LAST rounds before the draft opens, so
  // "highest pick_no seen" would report a 16-round draft as finished before it
  // starts. The live pick is the first slot nobody has filled, counting up.
  const taken = new Set(S.picks.map(p => p.pick_no));
  let currentPick = 1;
  while (taken.has(currentPick)) currentPick++;
  // Picks actually made in order — excludes those parked keeper rows, which
  // would otherwise read as a QB run in the last 8 picks.
  const made = S.picks.filter(p => p.pick_no < currentPick);
  const myNos = myPickNumbers();
  const nextMine = myNos.find(n => n >= currentPick) ?? null;
  const afterMine = myNos.find(n => n > (nextMine ?? 0)) ?? null;
  const round = nextMine ? Math.ceil(nextMine / S.teams) : Math.ceil(currentPick / S.teams);
  const mine = myRoster(gone);

  // Board state at my NEXT turn: assume the room takes the top ADP players left.
  const gap = afterMine && nextMine ? afterMine - nextMine - 1 : S.teams - 1;
  const byAdp = avail.filter(p => p.adp != null).sort((a, b) => a.adp - b.adp);
  const goneNext = new Set(byAdp.slice(0, Math.max(0, gap)).map(p => p.key));
  const laterPool = avail.filter(p => !goneNext.has(p.key));

  // Raw ADP is measured in a league where nobody is kept. Here 40-odd players
  // are already off the board, so every survivor's true draft slot moves up by
  // however many players ahead of him are gone. Position in the AVAILABLE
  // ADP order is that corrected number, and it is what "will he last?" needs.
  const expPick = new Map();
  byAdp.forEach((p, i) => expPick.set(p.key, currentPick + i));

  const base = lineupValue(mine);
  const bestLaterGain = {};
  for (const pos of REAL_POS) {
    let b = 0;
    for (const p of laterPool) {
      if (p.pos !== pos) continue;
      b = Math.max(b, lineupValue(mine.concat([p])) - base);
      break; // laterPool is already in board order; the first is the best
    }
    bestLaterGain[pos] = b;
  }

  const posLeftInTier = {};
  for (const p of avail) {
    if (!p.tier) continue;
    const k = p.pos + "|" + p.tier;
    posLeftInTier[k] = (posLeftInTier[k] || 0) + 1;
  }
  // Recent positional run: the room telling you a tier is about to empty.
  const last = made.slice(-8).map(p => (p.metadata?.position || "").toUpperCase());
  const runCount = {};
  last.forEach(p => runCount[p] = (runCount[p] || 0) + 1);

  // A finished draft (or one where every pick I own is spent) has no decision in
  // it; scoring the leftovers just produces confident-looking noise.
  if (nextMine == null) return { list: [], currentPick, nextMine, afterMine, round, mine, avail, made, done: true };

  const scored = avail.slice(0, 70).map(p => {
    const gain = lineupValue(mine.concat([p])) - base;
    const wait = bestLaterGain[p.pos] || 0;
    const why = [];
    // Core number: value that disappears if you pass.
    let score = gain - wait;

    if (gain <= 0) why.push("bench depth only");
    else if (wait === 0) why.push(`fills ${p.pos} — nothing comparable next turn`);
    else why.push(`+${Math.round(gain)} now vs +${Math.round(wait)} if you wait`);

    const left = p.tier ? posLeftInTier[p.pos + "|" + p.tier] : null;
    if (left === 1) { score += 8; why.push(`last ${p.pos} in tier ${p.tier}`); }
    else if (left === 2) { score += 4; why.push(`only 2 left in ${p.pos} tier ${p.tier}`); }

    const exp = expPick.get(p.key);
    if (exp != null && afterMine && exp > afterMine) {
      why.push(`should still be there at #${afterMine}`);
    } else if (exp != null && nextMine && exp <= nextMine + Math.max(1, gap)) {
      why.push(`expected gone by #${afterMine || nextMine + gap}`);
    }
    if (runCount[p.pos] >= 4) { score += 4; why.push(`${p.pos} run: ${runCount[p.pos]} of last 8`); }
    if (p.risk >= 5) { score -= 4; why.push("high bust risk"); }

    return { p, score, gain, wait, why };
  });

  scored.sort((a, b) => b.score - a.score);

  // Show real alternatives, but graded — anything well below the leader is
  // dimmed rather than presented as a co-contender.
  const list = [], perPos = {};
  const top = scored.length ? scored[0].score : 0;
  for (const s of scored) {
    if (list.length >= 6) break;
    if (top > 0 && s.score < top * 0.45 && list.length >= 3) break;
    if ((perPos[s.p.pos] || 0) >= 2) continue;
    perPos[s.p.pos] = (perPos[s.p.pos] || 0) + 1;
    s.marginal = top > 0 && s.score < top * 0.75;
    list.push(s);
  }
  return { list, currentPick, nextMine, afterMine, round, mine, avail, made };
}

// ---------- polling ----------
async function poll() {
  if (!S.league?.draft_id) return;
  try {
    const picks = await api(`/draft/${S.league.draft_id}/picks`);
    S.picks = picks || [];
    el("sync-info").textContent =
      `synced ${new Date().toLocaleTimeString()} · ${S.picks.length} picks`;
  } catch (e) {
    el("sync-info").textContent = "offline — using manual marks";
  }
  render();
}

// ---------- render ----------
function renderHeaderMeta() {
  const fmt = S.ppr >= 1 ? "full PPR" : S.ppr > 0 ? `${S.ppr} PPR` : "standard";
  const slots = S.rosterPos.filter(p => p !== "BN" && p !== "IR" && p !== "TAXI");
  el("lg-name").textContent = S.league.name;
  el("lg-sub").textContent =
    `${S.username} · ${S.teams}-team · ${fmt}${S.superflex ? " · SUPERFLEX" : ""}` +
    `${S.mySlot ? " · slot " + S.mySlot : ""} · ${slots.length} starters` +
    `${S.draft ? " · " + S.draft.type : ""}`;
  const m = window.DATA_META || {};
  el("src-note").innerHTML =
    `Ranks blend our projection model (${(WEIGHTS.model * 100) | 0}%), FantasyPros ECR (${(WEIGHTS.ecr * 100) | 0}%), ` +
    `live ADP (${(WEIGHTS.adp * 100) | 0}%) and ESPN (${(WEIGHTS.espn * 100) | 0}%). ` +
    `Points come from <b>your</b> league's scoring settings; VOR from your roster slots. ` +
    `Sources: ${esc(m.sources?.fantasypros_superflex || "")} · ${esc(m.sources?.ffc_2qb || "")} · built ${esc((m.built || "").slice(0, 16))}.`;
}

function stars(n, cls) {
  n = Math.max(0, Math.min(5, n || 0));
  return `<span class="stars ${cls}">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

function render() {
  if (!S.league) return;
  const gone = goneMap();
  const R = recommend(gone);
  const rounds = S.draft?.settings?.rounds || 15;
  const total = S.teams * rounds;

  const st = el("draft-status");
  const live = !!S.draft && S.draft.status !== "pre_draft" && R.made.length > 0;
  st.textContent = S.draft
    ? (live ? `LIVE — pick ${R.currentPick}/${total}` : `${S.draft.status} — ${total} picks`)
    : "no draft";
  st.classList.toggle("live", live);

  const onSlot = slotForPick(Math.min(R.currentPick, total));
  const onRid = (S.draft?.slot_to_roster_id || {})[onSlot];
  const onOwner = S.rosterById[onRid]?.owner_id;
  el("clock").textContent = S.draft
    ? `On the clock: ${S.users[onOwner] || "slot " + onSlot} (R${Math.ceil(R.currentPick / S.teams)})` : "";

  const until = R.nextMine ? R.nextMine - R.currentPick : null;
  el("mynext").textContent = R.nextMine == null ? "no picks left"
    : until <= 0 ? "YOU ARE ON THE CLOCK" : `Your pick: #${R.nextMine} (in ${until})`;

  el("rec-context").textContent = R.nextMine == null ? "" :
    until <= 0 ? `— ON THE CLOCK, #${R.nextMine} (R${R.round})`
               : `— your pick #${R.nextMine} (R${R.round})`;

  el("recs").innerHTML = R.list.map((r, i) => `
    <div class="rec ${i === 0 ? "top" : ""} ${r.marginal ? "marginal" : ""}">
      <span class="score">${r.score > 0 ? "+" : ""}${Math.round(r.score)}</span>
      <div class="name"><span class="pos-${r.p.pos}">${r.p.pos}</span> ${esc(r.p.name)}
        <span class="meta">${esc(r.p.team)} · ${Math.round(r.p.pts)} pts · VOR ${Math.round(r.p.vor)}${r.p.tier ? " · T" + r.p.tier : ""}</span>
      </div>
      <div class="why">${r.why.map(esc).join(" · ")}</div>
    </div>`).join("") || `<div class="rec"><div class="why">${R.done
      ? "No picks left to make — this draft is done for you."
      : "No recommendations — the board is empty."}</div></div>`;

  // roster by slot
  const pool = R.mine.slice();
  const slots = S.rosterPos.filter(p => p !== "IR" && p !== "TAXI");
  const rows = [];
  const usedIdx = new Set();
  const grab = elig => {
    let bi = -1;
    pool.forEach((p, i) => {
      if (usedIdx.has(i) || !elig.includes(p.pos)) return;
      if (bi < 0 || p.pts > pool[bi].pts) bi = i;
    });
    if (bi >= 0) { usedIdx.add(bi); return pool[bi]; }
    return null;
  };
  for (const slot of slots) {
    if (slot === "BN") continue;
    const elig = isFlex(slot) ? FLEX_ELIG[slot] : [slot];
    rows.push({ slot, p: grab(elig) });
  }
  const bench = pool.filter((_, i) => !usedIdx.has(i));
  el("roster-count").textContent = `(${R.mine.length})`;
  el("roster").innerHTML = rows.map(r =>
    `<div class="slot"><span class="pos">${r.slot.replace("SUPER_FLEX", "SFLX").replace("_FLEX", "FLX")}</span>` +
    (r.p ? `<span class="pos-${r.p.pos}">${esc(r.p.name)}</span><span class="rpts">${Math.round(r.p.pts)}</span>`
         : `<span class="empty">—</span>`) + `</div>`).join("") +
    (bench.length ? `<div class="slot"><span class="pos">BN</span><span class="bn">${bench.map(p => esc(p.name)).join(", ")}</span></div>` : "");

  const remaining = myPickNumbers().filter(n => n >= R.currentPick);
  el("mypicks").innerHTML = remaining.length
    ? `<div class="picks">Your picks: ${remaining.slice(0, 10).map(n => `#${n}`).join(" · ")}${remaining.length > 10 ? " …" : ""}</div>` : "";

  el("ticker").innerHTML = R.made.slice().sort((a, b) => b.pick_no - a.pick_no).slice(0, 8).map(p => {
    const i = pickInfo(p);
    const owner = S.users[S.rosterById[i.rosterId]?.owner_id] || `roster ${i.rosterId}`;
    return `<div>#${i.pickNo} <b>${esc(i.name)}</b> ${esc(i.pos)} → ${esc(owner)}${i.isKeeper ? " <i>(keeper)</i>" : ""}</div>`;
  }).join("") || `<div>No picks yet.</div>`;

  renderBoard(gone, R);
}

function renderBoard(gone, R) {
  const hide = el("hide-drafted").checked;
  const list = S.players.filter(p => S.activeTab === "ALL" || p.pos === S.activeTab);
  const byTier = S.activeTab !== "ALL";
  const left = {};
  for (const p of S.players) if (!isGone(p, gone) && p.tier) {
    left[p.pos + "|" + p.tier] = (left[p.pos + "|" + p.tier] || 0) + 1;
  }
  let rows = "", lastTier = null, shown = 0;
  for (const p of list) {
    if (shown >= 300) break;
    const g = isGone(p, gone);
    if (hide && g) continue;
    shown++;
    if (byTier && p.tier !== lastTier) {
      lastTier = p.tier;
      const n = left[p.pos + "|" + p.tier] || 0;
      rows += `<tr><td colspan="9" class="tier-head">Tier ${p.tier ?? "—"}` +
        (n > 0 && n <= 2 ? `<span class="cliff">only ${n} left</span>` : n === 0 ? `<span class="cliff">gone</span>` : "") + `</td></tr>`;
    }
    const t = gone.get(p.key);
    const isMine = t && t.rosterId === S.myRosterId;
    const owner = t ? (S.users[S.rosterById[t.rosterId]?.owner_id] || "") : "";
    const diff = p.adp != null ? Math.round(p.adp - p.rank) : null;
    rows += `<tr class="player ${g ? "gone" : ""} ${isMine ? "mine-row" : ""}" data-key="${esc(p.key)}">
      <td class="rk">${p.rank}</td>
      <td class="nm">${esc(p.name)}${isMine ? ' <span class="badge mine">MINE</span>' : ""}${t?.keeper ? ' <span class="badge kp">KEPT</span>' : ""}</td>
      <td class="pos pos-${p.pos}">${p.pos}${p.tier || ""}</td>
      <td class="tm">${esc(p.team)}</td>
      <td class="num">${Math.round(p.pts)}</td>
      <td class="num vor">${Math.round(p.vor)}</td>
      <td class="num">${p.ecr || "—"}</td>
      <td class="num adp ${diff >= 8 ? "pos" : diff <= -8 ? "neg" : ""}">${p.adp != null ? Math.round(p.adp) : "—"}</td>
      <td class="taken">${t ? (t.keeper ? "keeper " : "#" + t.pickNo + " ") + esc(owner) : S.manualGone.has(p.key) ? "manual ✕" : ""}</td>
    </tr>`;
  }
  el("players").innerHTML = `<table class="sheet"><thead><tr>
      <th title="Blended rank: our model, FantasyPros ECR, live ADP, ESPN.">RK</th>
      <th>PLAYER</th><th>POS</th><th>TM</th>
      <th class="num" title="Season projection scored with YOUR league's settings.">PTS</th>
      <th class="num help" id="th-vor" title="Value over replacement in your league. Tap for details.">VOR</th>
      <th class="num" title="FantasyPros expert consensus rank.">ECR</th>
      <th class="num" title="Live ADP — where the market drafts him.">ADP</th>
      <th>STATUS</th></tr></thead><tbody>${rows}</tbody></table>`;

  const vh = el("th-vor");
  if (vh) vh.addEventListener("click", () => { el("legend").hidden = !el("legend").hidden; });
  el("players").querySelectorAll("tr.player").forEach(row => row.addEventListener("click", () => {
    const k = row.dataset.key;
    if (S.manualGone.has(k)) S.manualGone.delete(k); else S.manualGone.add(k);
    localStorage.setItem(LS.manual + S.league.league_id, JSON.stringify([...S.manualGone]));
    render();
  }));
}

// ---------- wiring ----------
function syncHeaderOffset() {
  const h = document.querySelector("header");
  if (h) document.documentElement.style.setProperty("--hdr", Math.round(h.getBoundingClientRect().height) + "px");
}
let wired = false;
function wireApp() {
  syncHeaderOffset();
  if (wired) return;
  wired = true;
  if (window.ResizeObserver) new ResizeObserver(syncHeaderOffset).observe(document.querySelector("header"));
  window.addEventListener("resize", syncHeaderOffset);
  document.querySelectorAll(".tab").forEach(b => {
    if (b.dataset.pos !== "ALL" && S.usedPos && !S.usedPos.has(b.dataset.pos)) b.hidden = true;
  });
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    S.activeTab = b.dataset.pos;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    render();
  }));
  el("hide-drafted").addEventListener("change", render);
  el("switch-league").addEventListener("click", () => {
    if (S.pollTimer) clearInterval(S.pollTimer);
    showSetup("");
    findLeagues();
  });
}

el("su-go").addEventListener("click", findLeagues);
el("su-user").addEventListener("keydown", e => { if (e.key === "Enter") findLeagues(); });

// Come back to the league you were drafting in, not the setup form.
(function boot() {
  const u = localStorage.getItem(LS.user), s = localStorage.getItem(LS.season), l = localStorage.getItem(LS.league);
  if (u) el("su-user").value = u;
  if (s) el("su-season").value = s;
  if (u && l) {
    S.username = u; S.season = s || "2026";
    api(`/user/${encodeURIComponent(u)}`).then(x => { S.userId = x.user_id; return loadLeague(l); })
      .catch(() => showSetup(""));
  } else showSetup("");
})();
