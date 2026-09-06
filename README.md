# Fantasy Football Draft Assistant

Live draft board for **any Sleeper league**. Enter your username, pick a league, and
the whole cheat sheet re-derives itself from that league's settings.

**https://etanetan.github.io/fantasy-football-draft-assistant/**

## What it adapts to automatically

- **Scoring** — points come from the league's own `scoring_settings`, so half vs full
  PPR, 4 vs 6 point passing TDs and bonuses like per-first-down all land correctly.
- **Roster slots** — replacement level is computed from `roster_positions` x team count.
  This is what makes superflex work: two QB-eligible slots per team drain the QB pool
  deeper, the baseline drops, and QBs gain value without a hand-tuned bonus.
- **Keepers** — kept players are off the board before pick 1.
- **Draft shape** — snake, linear, third-round reversal, and traded picks, so "your
  next pick" is the real pick number you own.

## Where the ranks come from

A blend, not one list: our projection model 42%, [FantasyPros](https://www.fantasypros.com)
expert consensus 28%, live [FFC](https://fantasyfootballcalculator.com) ADP 20%, ESPN 10%.
In superflex leagues it uses the superflex ECR board and 2QB ADP.

Recommendations rank on **what you lose by waiting** — lineup value added now minus the
best you could still get at that position on your next turn — not on raw player value.

## Refreshing the data

```bash
node build-data.js
```

Pulls Sleeper stat projections, both FantasyPros boards, ESPN draft ranks and FFC ADP,
then writes `data.js`. It stores **raw projected stats, not points**, so one data file
serves every league format and the browser does the scoring.

Ranks past ~150 are looser than the top of the board — sanity-check late-round calls.
