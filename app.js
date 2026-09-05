"use strict";

const CONFIG = {
  draftId: "1367869106316926976",
  myUserId: "315270787781124096",
  mySlot: 8,
  teams: 12,
  rounds: 14,
  pollMs: 5000,
};

const USERS = {
  "315270787781124096": "etanetan",
  "338472345645641728": "HenryMyos",
  "439619168275263488": "charlieyouakim",
  "441097256750280704": "jyouakim",
  "448911379567472640": "davemyos",
  "449690204052123648": "CJ129",
  "449739408694833152": "28AllDay",
  "449765829966295040": "JohnStruyk",
  "522215629870362624": "ChampaignTornadoes",
  "724476867326840832": "DStruyk",
  "724709384508256256": "BenHur",
  "726251080672968704": "Iguanas",
};

// ---------- state ----------
let players = [];            // enriched RANKINGS
let realPicks = [];          // from Sleeper
let simPicks = [];           // test mode
let manualGone = new Set(JSON.parse(localStorage.getItem("fcffl_manual") || "[]"));
let slotToUser = {};         // draft slot -> user_id
let draftStatus = "loading";
let activeTab = "ALL";

function normName(s) {
  return (s || "").toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/\s+/g, " ").trim();
}
const keyOf = (name, pos) => normName(name) + "|" + (pos || "").toUpperCase();

// Rankings are compiled by hand, so team assignments can go stale after trades/signings.
// Sleeper's player database is authoritative — reconcile against it, cached for a day.
async function syncTeams() {
  const CACHE = "fcffl_teams_v1";
  let map = null;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (c && Date.now() - c.at < 864e5) map = c.map;
  } catch (e) { /* fall through to refetch */ }

  if (!map) {
    try {
      const r = await fetch("https://api.sleeper.app/v1/players/nfl");
      const all = await r.json();
      map = {};
      for (const id in all) {
        const p = all[id];
        if (!p.full_name || !["QB", "RB", "WR", "TE"].includes(p.position)) continue;
        if (p.status === "Inactive" && !p.team) continue;
        map[keyOf(p.full_name, p.position)] = p.team || "FA";
      }
      localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), map }));
    } catch (e) { return; }
  }

  const fixed = [];
  for (const p of players) {
    const real = map[p.key];
    if (real && real !== p.team) { fixed.push(`${p.name} ${p.team}→${real}`); p.team = real; }
  }
  if (fixed.length) console.log("team corrections:", fixed);
  render();
}

function init() {
  players = (window.RANKINGS || []).map(p => ({ ...p, key: keyOf(p.name, p.pos) }));
  fetchDraftMeta();
  syncTeams();
  poll();
  setInterval(poll, CONFIG.pollMs);
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    activeTab = b.dataset.pos;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    render();
  }));
  document.getElementById("hide-drafted").addEventListener("change", render);
  document.getElementById("sim-pick").addEventListener("click", simulatePick);
  document.getElementById("sim-my-pick").addEventListener("click", simulateMyPick);
  document.getElementById("sim-reset").addEventListener("click", () => { simPicks = []; render(); });
}

async function fetchDraftMeta() {
  try {
    const r = await fetch(`https://api.sleeper.app/v1/draft/${CONFIG.draftId}`);
    const d = await r.json();
    draftStatus = d.status;
    if (d.draft_order) {
      slotToUser = {};
      for (const [uid, slot] of Object.entries(d.draft_order)) slotToUser[slot] = uid;
    }
  } catch (e) { /* offline ok */ }
}

async function poll() {
  try {
    const r = await fetch(`https://api.sleeper.app/v1/draft/${CONFIG.draftId}/picks`);
    if (r.ok) {
      realPicks = await r.json();
      document.getElementById("sync-info").textContent =
        `synced ${new Date().toLocaleTimeString()} · ${realPicks.length} real picks`;
      if (realPicks.length && draftStatus !== "complete") draftStatus = "drafting";
    }
  } catch (e) {
    document.getElementById("sync-info").textContent = "offline — using manual/sim marks";
  }
  render();
}

// ---------- pick math ----------
function allPicks() { return realPicks.length ? realPicks : simPicks; }

function slotForPickNo(no) {
  const r = Math.ceil(no / CONFIG.teams);
  const idx = (no - 1) % CONFIG.teams;
  return r % 2 === 1 ? idx + 1 : CONFIG.teams - idx;
}
function myPickNos() {
  const out = [];
  for (let r = 1; r <= CONFIG.rounds; r++) {
    out.push(r % 2 === 1
      ? (r - 1) * CONFIG.teams + CONFIG.mySlot
      : (r - 1) * CONFIG.teams + (CONFIG.teams - CONFIG.mySlot + 1));
  }
  return out;
}

function pickInfo(pick) {
  const m = pick.metadata || {};
  return {
    name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
    pos: (m.position || "").toUpperCase(),
    team: m.team || "",
    key: keyOf(`${m.first_name || ""} ${m.last_name || ""}`, m.position),
    pickNo: pick.pick_no,
    by: pick.picked_by || slotToUser[pick.draft_slot] || "",
  };
}

function computeGone() {
  const gone = new Map(); // key -> {pickNo, byName}
  for (const p of allPicks()) {
    const info = pickInfo(p);
    gone.set(info.key, { pickNo: info.pickNo, byName: USERS[info.by] || `slot ${slotForPickNo(info.pickNo)}` , by: info.by });
  }
  return gone;
}

// ---------- recommendation engine (hero-RB build) ----------
function recommend(gone) {
  const avail = players.filter(p => !isGone(p, gone));
  const currentPick = allPicks().length + 1;
  const myNos = myPickNos();
  const nextMine = myNos.find(n => n >= currentPick) || myNos[myNos.length - 1];
  const afterMine = myNos.find(n => n > nextMine) || nextMine + 24;
  const round = Math.ceil(nextMine / CONFIG.teams);

  // draft trend: positional run in the last 8 picks
  const last8 = allPicks().slice(-8).map(p => (p.metadata?.position || "").toUpperCase());
  const runCounts = {};
  last8.forEach(pos => runCounts[pos] = (runCounts[pos] || 0) + 1);
  const runPos = Object.entries(runCounts).find(([, n]) => n >= 4)?.[0] || null;

  const mine = myRoster(gone);
  const c = { QB: 0, RB: 0, WR: 0, TE: 0 };
  mine.forEach(p => c[p.pos] = (c[p.pos] || 0) + 1);

  // tier remaining counts
  const tierLeft = {};
  for (const p of avail) {
    const k = p.pos + p.tier;
    tierLeft[k] = (tierLeft[k] || 0) + 1;
  }

  const onClock = currentPick >= nextMine;

  const scored = avail.slice(0, 60).map(p => {
    const why = [];
    const adp = p.adp || p.rank;
    // Base value is rank-driven so talent stays primary; needs apply as bounded bonuses.
    let score = Math.max(0, 250 - p.rank);

    // hero-RB build: 1 anchor RB early, WRs through both flexes, elite TE/QB windows, RB2+ later
    if (p.pos === "RB") {
      if (c.RB === 0 && round <= 3) { score += 20; why.push("hero RB anchor"); }
      else if (c.RB >= 1 && round <= 6) score -= 16;
      else if (round >= 7 && c.RB < 4) { score += 14; why.push("RB2/3 window"); }
    } else if (p.pos === "WR") {
      if (c.WR < 6 && round <= 10) { score += 16; why.push("WR-through-flex build"); }
      else if (c.WR >= 6) score -= 12;
    } else if (p.pos === "TE") {
      if (c.TE === 0) {
        if (p.tier === 1) { score += 18; why.push("elite TE = flex cheat code"); }
        else if (round >= 8) { score += 14; why.push("TE need"); }
        else score -= 20;
      } else score -= 45;
    } else if (p.pos === "QB") {
      if (c.QB === 0) {
        if (p.tier <= 2 && round >= 4 && round <= 7) { score += 14; why.push("elite QB value window"); }
        else if (round >= 8) { score += 18; why.push("QB need — this league drafts QBs late"); }
        else score -= 25;
      } else score -= round >= 13 ? 15 : 60;
    }

    const left = tierLeft[p.pos + p.tier] || 0;
    if (left === 1) { score += 30; why.push(`LAST ${p.pos} in tier ${p.tier} — cliff after him`); }
    else if (left === 2) { score += 14; why.push(`only 2 left in ${p.pos} tier ${p.tier}`); }

    if (onClock && currentPick - adp > 4) {
      score += Math.min(24, (currentPick - adp) / 2);
      why.push(`falling: ADP ${adp}, on the clock at ${currentPick}`);
    }
    if (!onClock && adp < nextMine) {
      // Looking ahead — the further below your pick his ADP is, the likelier he's gone.
      score -= Math.min(45, (nextMine - adp) * 6);
      why.push(`likely gone by #${nextMine} (ADP ${adp})`);
    }
    if (adp > afterMine + 2) {
      // Snake turn: he should survive the round trip, so spend this pick elsewhere.
      score -= 12;
      why.push(`can likely wait — ADP ${adp}, you pick again at #${afterMine}`);
    } else if (adp <= afterMine && adp >= nextMine - 2) {
      score += 8;
      why.push(`won't last to your next pick (#${afterMine})`);
    }

    if (runPos && p.pos === runPos) { score += 10; why.push(`${runPos} run — ${runCounts[runPos]} of last 8 picks`); }
    if (currentPick >= 105 && (p.upside || 0) >= 4) { score += 22; why.push("late-round ceiling swing"); }
    if ((p.bust || 0) >= 4) { score -= 6; why.push("high bust risk"); }
    if (/injury|susp/.test(p.note || "")) { score -= 4; why.push(`⚠ ${p.note}`); }

    return { p, score, why };
  });

  scored.sort((a, b) => b.score - a.score);
  // Keep the shortlist positionally diverse so the real alternatives are always visible.
  const list = [], perPos = {};
  for (const s of scored) {
    if ((perPos[s.p.pos] || 0) >= 2) continue;
    perPos[s.p.pos] = (perPos[s.p.pos] || 0) + 1;
    list.push(s);
    if (list.length === 5) break;
  }
  return { list, currentPick, nextMine, round };
}

function isGone(p, gone) { return gone.has(p.key) || manualGone.has(p.key); }

function myRoster(gone) {
  const out = [];
  for (const pick of allPicks()) {
    const info = pickInfo(pick);
    if (info.by === CONFIG.myUserId || (!info.by && slotForPickNo(info.pickNo) === CONFIG.mySlot) || slotForPickNo(info.pickNo) === CONFIG.mySlot && realPicks.length === 0) {
      // sim picks attribute by slot; real picks by picked_by
    }
    const isMine = realPicks.length
      ? info.by === CONFIG.myUserId
      : slotForPickNo(info.pickNo) === CONFIG.mySlot;
    if (isMine) out.push({ name: info.name, pos: info.pos, team: info.team, pickNo: info.pickNo, key: info.key });
  }
  return out;
}

// ---------- simulation ----------
function fakePick(player, pickNo) {
  const [first, ...rest] = player.name.split(" ");
  return {
    pick_no: pickNo, round: Math.ceil(pickNo / CONFIG.teams), draft_slot: slotForPickNo(pickNo),
    picked_by: slotToUser[slotForPickNo(pickNo)] || "",
    metadata: { first_name: first, last_name: rest.join(" "), position: player.pos, team: player.team },
  };
}
function simulatePick() {
  if (realPicks.length) { alert("Real draft has started — sim disabled."); return; }
  const gone = computeGone();
  const avail = players.filter(p => !isGone(p, gone));
  if (!avail.length) return;
  const jitter = Math.floor(Math.random() * Math.min(5, avail.length));
  simPicks.push(fakePick(avail[jitter], simPicks.length + 1));
  render();
}
function simulateMyPick() {
  if (realPicks.length) { alert("Real draft has started — sim disabled."); return; }
  const gone = computeGone();
  const currentPick = simPicks.length + 1;
  while (simPicks.length + 1 < myPickNos().find(n => n >= currentPick)) simulatePick();
  const rec = recommend(computeGone());
  if (rec.list.length) { simPicks.push(fakePick(rec.list[0].p, simPicks.length + 1)); render(); }
}

// ---------- render ----------
function render() {
  const gone = computeGone();
  const { list, currentPick, nextMine, round } = recommend(gone);
  const total = CONFIG.teams * CONFIG.rounds;

  // status bar
  const st = document.getElementById("draft-status");
  st.textContent = realPicks.length ? `LIVE — pick ${currentPick}/${total}` :
    (simPicks.length ? `SIM — pick ${currentPick}/${total}` : `pre-draft`);
  st.classList.toggle("live", !!realPicks.length);
  const onClockSlot = slotForPickNo(Math.min(currentPick, total));
  document.getElementById("clock").textContent =
    `On the clock: ${USERS[slotToUser[onClockSlot]] || "slot " + onClockSlot} (R${Math.ceil(currentPick / CONFIG.teams)})`;
  const until = nextMine - currentPick;
  document.getElementById("mynext").textContent = until <= 0
    ? "YOU ARE ON THE CLOCK" : `Your pick: #${nextMine} (in ${until})`;

  // recommendations
  document.getElementById("rec-context").textContent = `— for your pick #${nextMine} (R${round})`;
  document.getElementById("recs").innerHTML = list.map((r, i) => `
    <div class="rec ${i === 0 ? "top" : ""}">
      <span class="score">${Math.round(r.score)}</span>
      <div class="name"><span class="pos-${r.p.pos}">${r.p.pos}</span> ${r.p.name} <span style="color:var(--dim)">${r.p.team} · rk ${r.p.rank} · ADP ${r.p.adp || "—"} · T${r.p.tier}</span> ${stars(r.p.upside, "up")}</div>
      <div class="why">${r.why.join(" · ") || "best available"}</div>
    </div>`).join("");

  // roster
  const mine = myRoster(gone);
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX"];
  const pool = [...mine];
  const lineup = slots.map(s => {
    const i = pool.findIndex(p => s === "FLEX" ? ["RB", "WR", "TE"].includes(p.pos) : p.pos === s);
    return { slot: s, p: i >= 0 ? pool.splice(i, 1)[0] : null };
  });
  document.getElementById("roster-count").textContent = `(${mine.length}/${CONFIG.rounds})`;
  document.getElementById("roster").innerHTML =
    lineup.map(l => `<div class="slot"><span class="pos">${l.slot}</span>${l.p ? `<span class="pos-${l.p.pos}">${l.p.name}</span>` : `<span class="empty">—</span>`}</div>`).join("")
    + (pool.length ? `<div class="slot"><span class="pos">BN</span><span>${pool.map(p => p.name).join(", ")}</span></div>` : "");

  // ticker
  const recent = allPicks().slice(-8).reverse();
  document.getElementById("ticker").innerHTML = recent.map(p => {
    const i = pickInfo(p);
    return `<div>#${i.pickNo} <b>${i.name}</b> ${i.pos} → ${USERS[i.by] || "slot " + slotForPickNo(i.pickNo)}</div>`;
  }).join("") || `<div>No picks yet.</div>`;

  renderBoard(gone);
}

function stars(n, cls) {
  n = Math.max(0, Math.min(5, n || 0));
  return `<span class="stars ${cls}">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

function renderBoard(gone) {
  const hideDrafted = document.getElementById("hide-drafted").checked;
  const list = players.filter(p => activeTab === "ALL" || p.pos === activeTab);
  const byTier = activeTab !== "ALL";
  let rows = "", lastTier = null;

  // tier cliff info (per position)
  const tierLeft = {};
  players.forEach(p => { if (!isGone(p, gone)) tierLeft[p.pos + p.tier] = (tierLeft[p.pos + p.tier] || 0) + 1; });

  for (const p of list) {
    const g = isGone(p, gone);
    if (hideDrafted && g) continue;
    if (byTier && p.tier !== lastTier) {
      lastTier = p.tier;
      const left = tierLeft[p.pos + p.tier] || 0;
      rows += `<tr class="tier-row"><td colspan="9" class="tier-head">Tier ${p.tier}${left <= 2 && left > 0 ? `<span class="cliff">⚠ only ${left} left</span>` : ""}${left === 0 ? `<span class="cliff">gone</span>` : ""}</td></tr>`;
    }
    const taken = gone.get(p.key);
    const manual = manualGone.has(p.key);
    const isMine = taken && taken.by === CONFIG.myUserId;
    const badges = [
      p.note && /sleeper|rookie|upside/.test(p.note) ? `<span class="badge up">${p.note}</span>` : "",
      p.note && /injury|susp/.test(p.note) ? `<span class="badge warn">${p.note}</span>` : "",
      isMine ? `<span class="badge mine">MINE</span>` : "",
    ].join("");
    const val = p.adp ? Math.round(p.adp - p.rank) : 0;
    rows += `<tr class="player ${g ? "gone" : ""} ${isMine ? "mine-row" : ""}" data-key="${p.key}">
      <td class="rk">${p.rank}</td>
      <td class="nm">${p.name}${badges}</td>
      <td class="pos pos-${p.pos}">${p.pos}${p.tier}</td>
      <td class="tm">${p.team}</td>
      <td class="adp">${p.adp || "—"}</td>
      <td class="val ${val >= 3 ? "pos" : val <= -3 ? "neg" : ""}">${val > 0 ? "+" + val : val || ""}</td>
      <td>${stars(p.upside, "up")}</td>
      <td>${stars(p.bust, "bust")}</td>
      <td class="taken">${taken ? `#${taken.pickNo} ${taken.byName}` : manual ? "manual ✕" : ""}</td>
    </tr>`;
  }
  const el = document.getElementById("players");
  el.innerHTML = `<table class="sheet">
    <thead><tr><th>RK</th><th>PLAYER</th><th>POS</th><th>TM</th><th>ADP</th><th>+/-</th><th>UPSIDE</th><th>BUST</th><th>DRAFTED</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  el.querySelectorAll("tr.player").forEach(row => row.addEventListener("click", () => {
    const k = row.dataset.key;
    if (manualGone.has(k)) manualGone.delete(k); else manualGone.add(k);
    localStorage.setItem("fcffl_manual", JSON.stringify([...manualGone]));
    render();
  }));
}

init();
