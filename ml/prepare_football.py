"""Готовит дневные ряды футболисток из SoccerMon для дообучения модели риска травмы.

Источник: обработанная выгрузка SoccerMon (Midoglu et al., 2024, doi:10.1038/s41597-024-03386-x,
CC BY 4.0) из открытого репозитория github.com/Julie-Landrevie/womens-football-load-monitoring
(файл docs/data.js: дневная нагрузка sRPE, GPS-метры и дни с заявленной травмой, 50 игроков двух команд).

Правила честности:
  - день без записи (doc = 0) — это ПРОПУСК нагрузки, а не 0: в SoccerMon незаполненный день
    неотличим от отдыха, поэтому нагрузку берём только в документированные дни;
  - целевое событие — НАЧАЛО эпизода травмы (первый день после ≥ 3 дней без жалоб);
  - дни продолжающегося эпизода и 7 дней после начала исключаются из обучающих примеров.

Запуск: python ml/prepare_football.py <путь к docs/data.js> <выход .json>
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path


def main(src: str, out: str):
    txt = Path(src).read_text(encoding="utf-8")
    payload = txt[txt.index("{"): txt.rindex("}") + 1]
    d = json.loads(payload)
    series, injuries = d["series"], d["injuries"]
    players = []
    for pid, s in series.items():
        start = date.fromisoformat(s["start"])
        n = len(s["load"])
        load, hi, sessions = [], [], []
        for i in range(n):
            doc = s["doc"][i]
            l = s["load"][i]
            if not doc:
                load.append(None); sessions.append(None)
            else:
                load.append(float(l or 0)); sessions.append(1.0 if (l or 0) > 0 else 0.0)
            g = s.get("gps_hsr", [None] * n)[i]
            hi.append(None if g is None else float(g))
        inj_days = set(injuries.get(pid, []))
        inj_idx = sorted((date.fromisoformat(x) - start).days for x in inj_days
                         if 0 <= (date.fromisoformat(x) - start).days < n)
        # эпизоды: начало = день травмы, перед которым ≥ 3 дней без жалоб
        starts, prev = [], None
        for t in inj_idx:
            if prev is None or t - prev > 3:
                starts.append(t)
            prev = t
        players.append({
            "id": pid, "team": d["players"]["team"][d["players"]["id"].index(pid)],
            "start": s["start"], "n": n,
            "load": load, "hi": hi, "sessions": sessions,
            "injury_days": sorted(inj_idx), "episode_starts": starts,
        })
    meta = {
        "players": len(players),
        "days_documented": sum(sum(1 for v in p["load"] if v is not None) for p in players),
        "episodes": sum(len(p["episode_starts"]) for p in players),
        "injury_days": sum(len(p["injury_days"]) for p in players),
    }
    Path(out).write_text(json.dumps({"meta": meta, "players": players}))
    print(meta)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
