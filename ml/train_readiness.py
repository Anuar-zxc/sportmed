"""Модель готовности на завтра по ежедневному чек-ину и нагрузке.

Данные: SoccerMon — Midoglu C. et al. (2024) «A large-scale multivariate soccer athlete health,
performance, and position monitoring dataset», Scientific Data 11, 553, doi:10.1038/s41597-024-03386-x,
лицензия CC BY 4.0. Использована обработанная выгрузка команды B (22 игрока, 2020–2021) из
открытого репозитория github.com/zacfrappier/SoccerMon-Injury-Prediction (data/modeling/paper_inspired).

Две задачи на одном наборе признаков:
  1) регрессия: самооценка готовности завтра (0..10);
  2) классификация: «день низкой готовности» завтра — готовность ≤ личная норма − 1 СКО
     (норма и СКО считаются только по прошлым дням).

Запуск: python ml/train_readiness.py <папка paper_inspired> <папка вывода>
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import HuberRegressor, LogisticRegression, Ridge
from sklearn.metrics import (average_precision_score, brier_score_loss, mean_absolute_error,
                             mean_squared_error, r2_score, roc_auc_score)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent))
from export import export_hgb, predict_raw_py  # noqa: E402
from features import READINESS_FEATURES, WELLNESS, readiness_features_at  # noqa: E402

SEED = 42


def load(src: Path):
    s = pd.read_csv(src / "subjective/subjective_daily_unimputed.csv", parse_dates=["date"])
    t = pd.read_csv(src / "training_load/training_load_daily.csv", parse_dates=["date"])
    s = s[s["within_subjective_active_period"].astype(bool)]
    players = {}
    for pid, g in s.groupby("player_name"):
        d0, d1 = g["date"].min(), g["date"].max()
        idx = pd.date_range(d0, d1, freq="D")
        g = g.set_index("date").reindex(idx)
        tl = t[t["player_name"] == pid].set_index("date")["srpe_total"].reindex(idx)
        reported = g["readiness"].notna().to_numpy()
        srpe = tl.to_numpy(dtype=float)
        # нет записи о тренировке в день, когда игрок заполнил чек-ин, = день без нагрузки
        srpe = np.where(np.isnan(srpe) & reported, 0.0, srpe)
        ser = {k: g[k].to_numpy(dtype=float) for k in WELLNESS}
        ser["srpe"] = srpe
        players[pid] = ser
    return players


def build(players):
    X, y, ylow, groups = [], [], [], []
    for pid, ser in players.items():
        r = ser["readiness"]
        n = len(r)
        for t in range(n - 1):
            if np.isnan(r[t]) or np.isnan(r[t + 1]):
                continue
            past = r[:t + 1]
            past = past[~np.isnan(past)]
            if len(past) < 8:  # нужна личная норма
                continue
            X.append(readiness_features_at(ser, t))
            y.append(r[t + 1])
            mu, sd = past.mean(), past.std()
            ylow.append(int(r[t + 1] <= mu - max(sd, 0.5)))
            groups.append(pid)
    return np.array(X, dtype=float), np.array(y), np.array(ylow), np.array(groups)


def boot(groups, fn, n=300):
    rng = np.random.default_rng(SEED)
    ug = np.unique(groups)
    idx = {g: np.where(groups == g)[0] for g in ug}
    vals = []
    for _ in range(n):
        s = np.concatenate([idx[g] for g in rng.choice(ug, size=len(ug), replace=True)])
        v = fn(s)
        if v == v:
            vals.append(v)
    return [round(float(np.percentile(vals, 2.5)), 3), round(float(np.percentile(vals, 97.5)), 3)]


def main(src: str, out: str):
    t0 = time.time()
    players = load(Path(src))
    X, y, yl, g = build(players)
    print(f"matrix {X.shape}, players {len(np.unique(g))}, low-days {yl.mean():.3f}")
    folds = list(GroupKFold(n_splits=5).split(X, y, g))
    fi = {k: i for i, k in enumerate(READINESS_FEATURES)}

    # ---------------- регрессия ----------------
    def oof_reg(make):
        p = np.zeros(len(y))
        for tr, te in folds:
            p[te] = make().fit(X[tr], y[tr]).predict(X[te])
        return p

    def reg_metrics(p):
        return {"mae": round(mean_absolute_error(y, p), 4), "rmse": round(float(np.sqrt(mean_squared_error(y, p))), 4), "r2": round(r2_score(y, p), 4)}

    persistence = X[:, fi["readiness"]]
    personal = X[:, fi["readiness_base"]]
    reg = {"baseline_persistence": reg_metrics(persistence), "baseline_personal_mean": reg_metrics(personal)}

    def linear(kind):
        est = Ridge(alpha=3.0) if kind == "ridge" else HuberRegressor(max_iter=2000, alpha=1e-3, epsilon=1.35)
        return lambda: make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), est)

    makers = {"ridge": linear("ridge"), "huber": linear("huber")}
    grid = [
        dict(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=60, l2_regularization=1.0),
        dict(max_depth=2, learning_rate=0.05, max_iter=400, min_samples_leaf=80, l2_regularization=2.0),
    ]
    for i, prm in enumerate(grid):
        makers[f"hgb_{i}"] = (lambda prm=prm: HistGradientBoostingRegressor(random_state=SEED, early_stopping=False, **prm))
    oofr = {}
    for name, mk in makers.items():
        oofr[name] = oof_reg(mk)
        reg[name] = reg_metrics(oofr[name])
        print("reg", name, reg[name])
    print("baselines", reg["baseline_persistence"], reg["baseline_personal_mean"])
    best_r = min(oofr, key=lambda k: reg[k]["mae"])
    pr = oofr[best_r]
    mae_ci = boot(g, lambda s: mean_absolute_error(y[s], pr[s]))
    mae_ci_pers = boot(g, lambda s: mean_absolute_error(y[s], persistence[s]))
    # интервал прогноза: эмпирические квантили остатков OOF
    res = y - pr
    pi80 = [round(float(np.percentile(res, 10)), 3), round(float(np.percentile(res, 90)), 3)]

    # ---------------- классификация ----------------
    def oof_clf(make):
        p = np.zeros(len(yl))
        for tr, te in folds:
            p[te] = make().fit(X[tr], yl[tr]).predict_proba(X[te])[:, 1]
        return p

    def clf_metrics(p):
        return {"roc_auc": round(roc_auc_score(yl, p), 4), "pr_auc": round(average_precision_score(yl, p), 4)}

    clf = {"baseline_today_deviation": clf_metrics(-np.nan_to_num(X[:, fi["readiness"]] - X[:, fi["readiness_base"]]))}
    clf["logreg"] = clf_metrics(oof_clf(lambda: make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(max_iter=2000, C=0.3))))
    gridc = [
        dict(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=60, l2_regularization=1.0),
        dict(max_depth=2, learning_rate=0.05, max_iter=300, min_samples_leaf=80, l2_regularization=2.0),
    ]
    oofc = {}
    for i, prm in enumerate(gridc):
        oofc[i] = oof_clf(lambda prm=prm: HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **prm))
        clf[f"hgb_{i}"] = clf_metrics(oofc[i])
        print("clf", i, clf[f"hgb_{i}"])
    print("clf baselines", clf["baseline_today_deviation"], clf["logreg"])
    ci_ = max(oofc, key=lambda i: clf[f"hgb_{i}"]["roc_auc"])
    prm_c = gridc[ci_]
    pc = oofc[ci_]
    lo = np.log(pc / (1 - pc)).reshape(-1, 1)
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(lo, yl)
    cal = {"type": "platt", "a": float(platt.coef_[0, 0]), "b": float(platt.intercept_[0])}
    pcal = platt.predict_proba(lo)[:, 1]
    auc_ci = boot(g, lambda s: roc_auc_score(yl[s], pc[s]) if 0 < yl[s].sum() < len(s) else np.nan)
    order = np.argsort(pcal)
    reliability = [{"pred": round(float(pcal[b].mean()), 4), "obs": round(float(yl[b].mean()), 4), "n": int(len(b))} for b in np.array_split(order, 10)]

    # пермутационная важность (регрессия, рост MAE)
    rng = np.random.default_rng(SEED)
    imp = np.zeros(len(READINESS_FEATURES))
    for tr, te in folds:
        m = makers[best_r]().fit(X[tr], y[tr])
        b = mean_absolute_error(y[te], m.predict(X[te]))
        for j in range(len(READINESS_FEATURES)):
            Xp = X[te].copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            imp[j] += (mean_absolute_error(y[te], m.predict(Xp)) - b) / len(folds)

    fr = makers[best_r]().fit(X, y)
    if best_r.startswith("hgb"):
        er = {"type": "hgb", **export_hgb(fr)}
        ref = fr.predict(X)
    else:
        imp_, sc, est = fr.steps[0][1], fr.steps[1][1], fr.steps[2][1]
        # всё сводим к одной линейной формуле: y = b + Σ w_j · x_j, пропуск → медиана обучения
        w = est.coef_ / sc.scale_
        er = {"type": "linear", "intercept": float(est.intercept_ - (est.coef_ * sc.mean_ / sc.scale_).sum()),
              "w": [float(v) for v in w], "fill": [float(v) for v in imp_.statistics_], "mean": [float(v) for v in sc.mean_]}
        Xf = np.where(np.isnan(X), np.array(er["fill"]), X)
        ref = er["intercept"] + Xf @ w
        assert np.allclose(ref, fr.predict(X), atol=1e-6)
    fc = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **prm_c).fit(X, yl)
    ec = export_hgb(fc)
    smp = np.random.default_rng(1).choice(len(X), 300, replace=False)
    if er["type"] == "hgb":
        assert np.allclose(fr._raw_predict(X[smp]).ravel(), predict_raw_py(er, X[smp]), atol=1e-4)
    assert np.allclose(fc._raw_predict(X[smp]).ravel(), predict_raw_py(ec, X[smp]), atol=1e-4)

    q = {k: [None if np.isnan(v) else round(float(v), 4) for v in np.nanpercentile(X[:, i], [10, 50, 90])] for i, k in enumerate(READINESS_FEATURES)}
    model = {
        "name": "readiness_next_day", "version": "1.0.0", "trained_at": time.strftime("%Y-%m-%d"),
        "task": "Самооценка готовности завтра (0–10) и вероятность дня низкой готовности",
        "features": READINESS_FEATURES,
        "reg": er, "clf": ec, "clf_calibration": cal,
        "pi80_residual": pi80, "low_rate": round(float(yl.mean()), 4), "feature_quantiles": q,
    }
    card = {
        "name": "readiness_next_day", "version": "1.0.0",
        "dataset": {
            "title": "SoccerMon (Midoglu et al., 2024, Scientific Data)", "doi": "10.1038/s41597-024-03386-x",
            "url": "https://doi.org/10.1038/s41597-024-03386-x", "license": "CC BY 4.0",
            "processed_by": "github.com/zacfrappier/SoccerMon-Injury-Prediction",
            "players": int(len(np.unique(g))), "pairs": int(len(y)), "team": "B (Toppserien, 2020–2021)",
        },
        "validation": "5-fold GroupKFold по игрокам",
        "regression": reg, "regression_chosen": best_r, "mae_ci95": mae_ci, "mae_ci95_persistence": mae_ci_pers,
        "pi80_residual": pi80,
        "classification": clf, "classification_chosen": f"hgb_{ci_}", "auc_ci95": auc_ci,
        "brier_constant": round(float(brier_score_loss(yl, np.full(len(yl), yl.mean()))), 5),
        "brier_calibrated": round(float(brier_score_loss(yl, pcal)), 5),
        "low_rate": round(float(yl.mean()), 4), "reliability": reliability,
        "permutation_importance_mae": {k: round(float(v), 4) for k, v in sorted(zip(READINESS_FEATURES, imp), key=lambda z: -z[1])},
        "missing_share": {k: round(float(np.isnan(X[:, i]).mean()), 3) for i, k in enumerate(READINESS_FEATURES)},
    }
    o = Path(out)
    o.mkdir(parents=True, exist_ok=True)
    (o / "readiness_model.json").write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
    (o / "readiness_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=1))
    tv = [{"x": [None if np.isnan(v) else float(v) for v in X[i]], "reg": float(ref[i]), "clf_raw": float(b)}
          for i, b in zip(smp[:60], fc._raw_predict(X[smp[:60]]).ravel())]
    (o / "readiness_testvectors.json").write_text(json.dumps(tv))
    print(json.dumps({k: card[k] for k in ["regression", "mae_ci95", "mae_ci95_persistence", "classification", "auc_ci95", "brier_constant", "brier_calibrated", "permutation_importance_mae"]}, ensure_ascii=False, indent=1))
    print(f"done in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
