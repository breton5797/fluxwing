-- private.fw_vs_delta gives the same numbers as the client's rpDelta (tests/rp-elo.test.js). Prints one row per case; every ok must be t.
select me, opp, res, rep, private.fw_vs_delta(me, opp, res, rep) as got, want, private.fw_vs_delta(me, opp, res, rep) = want as ok
from (values
  (1000, 1000, 'win', 0, 50), (1000, 1000, 'lose', 0, -50), (1000, 1000, 'draw', 0, 0),
  (1000, 1500, 'win', 0, 76), (1000, 1500, 'lose', 0, -24), (1500, 1000, 'win', 0, 24),
  (0, 8000, 'win', 0, 80), (8000, 0, 'win', 0, 20), (8000, 0, 'lose', 0, -80),
  (1000, 1000, 'win', 1, 25), (1000, 1000, 'win', 2, 13), (1000, 1000, 'lose', 4, -13)
) t(me, opp, res, rep, want);
