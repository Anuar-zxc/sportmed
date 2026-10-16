"""Проверка: признаки и прогнозы в браузере (model.js) совпадают с Python (features.py + sklearn).

Генерирует случайные дневные ряды с пропусками и днями отдыха, считает признаки и прогнозы в Python,
затем запускает тот же расчёт в Node.js на models.js + model.js и сравнивает.
Запуск: python ml/verify_js.py   (из корня репозитория, нужен node)
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
from export import contributions_py, predict_raw_py  # noqa: E402
from features import (INJURY_FEATURES, READINESS_FEATURES, injury_features_at,  # noqa: E402
                      personal_norms, readiness_features_at)


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def calibrate(cal, raw):
    return float(sigmoid(cal["a"] * raw + cal["b"]))


def series(rng, n):
    load = rng.gamma(4, 120, n)
    load[rng.random(n) < 0.18] = 0
    load[rng.random(n) < 0.06] = np.nan
    s = {
        "load": load, "hi": load * rng.uniform(0, 0.2, n),
        "sessions": np.where(load > 0, rng.integers(1, 3, n), 0).astype(float),
        "strength": (rng.random(n) < 0.25).astype(float),
        "exertion": np.where(rng.random(n) < 0.1, np.nan, rng.uniform(0.2, 0.9, n)),
        "success": np.full(n, np.nan),
        "recovery": np.where(rng.random(n) < 0.1, np.nan, rng.uniform(0, 1, n)),
    }
    for k in ["fatigue", "mood", "sleep_quality", "soreness", "stress"]:
        s[k] = np.where(rng.random(n) < 0.08, np.nan, rng.integers(1, 6, n).astype(float))
    s["readiness"] = np.where(rng.random(n) < 0.08, np.nan, rng.integers(1, 11, n).astype(float))
    s["sleep_duration"] = np.where(rng.random(n) < 0.08, np.nan, np.round(rng.normal(7.8, 0.8, n), 2))
    s["srpe"] = s["load"]
    return s


def main():
    models = {n: json.loads((ROOT / "ml/models" / f"{n}_model.json").read_text()) for n in ("injury", "readiness")}
    rng = np.random.default_rng(7)
    cases = []
    for _ in range(40):
        n = int(rng.integers(20, 90))
        s = series(rng, n)
        for t in sorted(set(rng.integers(0, n, 6).tolist() + [n - 1])):
            p = personal_norms(s, t)
            xi = np.array(injury_features_at(s, t, p), dtype=float)
            xr = np.array(readiness_features_at(s, t), dtype=float)
            mi = models["injury"]
            raw = float(predict_raw_py(mi["hgb"], xi[None])[0])
            mr = models["readiness"]
            reg = mr["reg"]
            reg_y = reg["intercept"] + float(np.dot(reg["w"], np.where(np.isnan(xr), reg["fill"], xr)))
            cases.append({
                "s": {k: [None if np.isnan(v) else float(v) for v in arr] for k, arr in s.items()}, "t": t,
                "xi": [None if np.isnan(v) else v for v in xi.tolist()], "xr": [None if np.isnan(v) else v for v in xr.tolist()],
                "raw": raw, "p": calibrate(mi["calibration"], raw),
                "csum": float(contributions_py(mi["hgb"], xi, len(INJURY_FEATURES)).sum()),
                "reg": reg_y,
                "plow": calibrate(mr["clf_calibration"], float(predict_raw_py(mr["clf"], xr[None])[0])),
            })
    js = r"""
const fs=require('fs'); global.window=global;
eval(fs.readFileSync(process.argv[2],'utf8')); eval(fs.readFileSync(process.argv[3],'utf8'));
const ML=window.ASPML, cases=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
const N=v=>v===null?NaN:v; let worst={xi:0,xr:0,raw:0,p:0,reg:0,plow:0,csum:0};
const d=(a,b)=>{a=N(a);b=N(b); if(isNaN(a)&&isNaN(b))return 0; if(isNaN(a)||isNaN(b))return Infinity; return Math.abs(a-b)};
for(const c of cases){const s={};for(const k in c.s)s[k]=c.s[k].map(N);
 const p=ML.personalNorms(s,c.t), xi=ML.injuryFeaturesAt(s,c.t,p), xr=ML.readinessFeaturesAt(s,c.t);
 xi.forEach((v,j)=>worst.xi=Math.max(worst.xi,d(v,c.xi[j]))); xr.forEach((v,j)=>worst.xr=Math.max(worst.xr,d(v,c.xr[j])));
 const pi=ML.predictInjury(xi), pr=ML.predictReadiness(xr);
 worst.raw=Math.max(worst.raw,d(pi.raw,c.raw)); worst.p=Math.max(worst.p,d(pi.daily,c.p));
 worst.csum=Math.max(worst.csum,d(pi.contrib.reduce((a,b)=>a+b,0),c.csum));
 worst.reg=Math.max(worst.reg,d(pr.raw,c.reg)); worst.plow=Math.max(worst.plow,d(pr.pLow,c.plow));}
console.log(JSON.stringify({cases:cases.length,worst}));
"""
    with tempfile.TemporaryDirectory() as td:
        (Path(td) / "cases.json").write_text(json.dumps(cases))
        (Path(td) / "run.js").write_text(js)
        out = subprocess.run(["node", str(Path(td) / "run.js"), str(ROOT / "models.js"), str(ROOT / "model.js"), str(Path(td) / "cases.json")],
                             capture_output=True, text=True, check=True).stdout
    res = json.loads(out)
    print(res)
    bad = {k: v for k, v in res["worst"].items() if not (v <= 1e-6)}
    if bad:
        raise SystemExit(f"РАСХОЖДЕНИЕ: {bad}")
    # тестовые векторы из обучения (sklearn _raw_predict)
    print("OK: признаки и прогнозы JS совпадают с Python")


if __name__ == "__main__":
    main()
