"""Модель риска травмы на следующий день.

Данные: Lövdal S., den Hartigh R., Azzopardi G. (2021) «Replication Data for: Injury Prediction In
Competitive Runners With Machine Learning», DataverseNL, doi:10.34894/UWU9PV, лицензия CC0 1.0.
74 бегуна высокого уровня, 2012–2019, дневной журнал тренировок и самочувствия.

Запуск: python ml/train_injury.py <путь к day_approach_maskedID_timeseries.csv> <папка вывода>
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent))
from export import contributions_py, export_hgb, predict_raw_py  # noqa: E402
from features import INJURY_FEATURES, injury_features_at, personal_norms  # noqa: E402

SEED = 42
BASE = ["nr. sessions", "total km", "km Z3-4", "km Z5-T1-T2", "km sprinting", "strength training",
        "hours alternative", "perceived exertion", "perceived trainingSuccess", "perceived recovery"]


def reconstruct(df: pd.DataFrame):
    """Каждая строка содержит 7 предыдущих дней (суффиксы '' .. '.6', '.6' = вчера). Собираем сплошной дневной ряд."""
    athletes = {}
    for aid, g in df.groupby("Athlete ID"):
        d0, d1 = int(g["Date"].min()) - 7, int(g["Date"].max())
        n = d1 - d0 + 1
        raw = {c: np.full(n, np.nan) for c in BASE}
        for _, row in g.iterrows():
            for k in range(7):
                suf = "" if k == 0 else f".{k}"
                day = int(row["Date"]) - 7 + k - d0
                for c in BASE:
                    raw[c][day] = row[c + suf]
        for c in ["perceived exertion", "perceived trainingSuccess", "perceived recovery"]:
            raw[c][raw[c] < 0] = np.nan  # -0.01 в исходных данных = пропуск
        series = {
            "load": raw["total km"] + 8.0 * raw["hours alternative"],
            "hi": raw["km Z5-T1-T2"] + raw["km sprinting"],
            "sessions": raw["nr. sessions"],
            "strength": raw["strength training"],
            "exertion": raw["perceived exertion"],
            "success": raw["perceived trainingSuccess"],
            "recovery": raw["perceived recovery"],
        }
        athletes[int(aid)] = (d0, series, g[["Date", "injury"]].to_numpy())
    return athletes


def build_matrix(athletes):
    X, y, groups = [], [], []
    for aid, (d0, series, rows) in athletes.items():
        for date, inj in rows:
            t = int(date) - d0
            p = personal_norms(series, t)
            X.append(injury_features_at(series, t, p))
            y.append(int(inj))
            groups.append(aid)
    return np.array(X, dtype=float), np.array(y), np.array(groups)


def boot_ci(y, p, groups, fn, n=300, rng=None):
    rng = rng or np.random.default_rng(SEED)
    ug = np.unique(groups)
    idx = {g: np.where(groups == g)[0] for g in ug}
    vals = []
    for _ in range(n):
        s = np.concatenate([idx[g] for g in rng.choice(ug, size=len(ug), replace=True)])
        if y[s].sum() == 0 or y[s].sum() == len(s):
            continue
        vals.append(fn(y[s], p[s]))
    return [round(float(np.percentile(vals, 2.5)), 3), round(float(np.percentile(vals, 97.5)), 3)]


def main(src: str, out: str):
    t0 = time.time()
    df = pd.read_csv(src)
    athletes = reconstruct(df)
    X, y, g = build_matrix(athletes)
    print(f"matrix {X.shape}, events {y.sum()}, athletes {len(np.unique(g))}, {time.time()-t0:.0f}s")

    try:
        cv = GroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    except TypeError:
        cv = GroupKFold(n_splits=5)
    folds = list(cv.split(X, y, g))
    base_rate = y.mean()

    def oof(make):
        p = np.zeros(len(y))
        for tr, te in folds:
            m = make()
            m.fit(X[tr], y[tr])
            p[te] = m.predict_proba(X[te])[:, 1]
        return p

    acwr_idx = INJURY_FEATURES.index("load7_rel")

    class ACWROnly:
        def __init__(self):
            self.m = make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(max_iter=1000))

        def fit(self, X_, y_):
            self.m.fit(X_[:, [acwr_idx]], y_)
            return self

        def predict_proba(self, X_):
            return self.m.predict_proba(X_[:, [acwr_idx]])

    candidates = {
        "logreg_load_ratio": lambda: ACWROnly(),
        "logreg_all": lambda: make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(max_iter=2000, C=0.3)),
    }
    grid = [
        dict(max_depth=2, learning_rate=0.05, max_iter=250, min_samples_leaf=150, l2_regularization=1.0),
        dict(max_depth=3, learning_rate=0.04, max_iter=300, min_samples_leaf=200, l2_regularization=2.0),
        dict(max_depth=3, learning_rate=0.03, max_iter=500, min_samples_leaf=300, l2_regularization=5.0),
        dict(max_depth=4, learning_rate=0.03, max_iter=300, min_samples_leaf=300, l2_regularization=5.0),
    ]
    for i, prm in enumerate(grid):
        candidates[f"hgb_{i}"] = (lambda prm=prm: HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **prm))

    results, oofs = {}, {}
    for name, make in candidates.items():
        p = oof(make)
        oofs[name] = p
        results[name] = {
            "roc_auc": round(roc_auc_score(y, p), 4),
            "pr_auc": round(average_precision_score(y, p), 4),
            "brier": round(brier_score_loss(y, p), 5),
        }
        print(name, results[name], f"{time.time()-t0:.0f}s")

    best = max([k for k in results if k.startswith("hgb_")], key=lambda k: results[k]["roc_auc"])
    prm = grid[int(best.split("_")[1])]
    p_best = oofs[best]
    print("best", best, prm)

    # калибровка Платта на OOF-прогнозах: монотонная и гладкая, сохраняет ранжирование
    # (изотоническая регрессия на редких событиях даёт широкие «ступени» с одинаковым риском у разных людей)
    logit_oof = np.log(p_best / (1 - p_best)).reshape(-1, 1)
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(logit_oof, y)
    cal = {"type": "platt", "a": float(platt.coef_[0, 0]), "b": float(platt.intercept_[0])}
    p_cal = platt.predict_proba(logit_oof)[:, 1]
    # бутстрэп-интервалы по спортсменам
    ci = {
        "roc_auc": boot_ci(y, p_best, g, roc_auc_score),
        "pr_auc": boot_ci(y, p_best, g, average_precision_score),
    }
    ci_base = {"roc_auc": boot_ci(y, oofs["logreg_load_ratio"], g, roc_auc_score)}
    # кривая надёжности (после калибровки), 10 квантильных корзин
    order = np.argsort(p_cal)
    bins = np.array_split(order, 10)
    reliability = [{"pred": round(float(p_cal[b].mean()), 4), "obs": round(float(y[b].mean()), 4), "n": int(len(b))} for b in bins]
    # прирост риска в верхнем дециле
    top = order[-len(order) // 10:]
    lift_top10 = float(y[top].mean() / base_rate)

    # пермутационная важность внутри фолдов (падение ROC-AUC)
    rng = np.random.default_rng(SEED)
    imp = np.zeros(len(INJURY_FEATURES))
    for tr, te in folds:
        m = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **prm).fit(X[tr], y[tr])
        base_auc = roc_auc_score(y[te], m.predict_proba(X[te])[:, 1])
        for j in range(len(INJURY_FEATURES)):
            Xp = X[te].copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            imp[j] += (base_auc - roc_auc_score(y[te], m.predict_proba(Xp)[:, 1])) / len(folds)

    final = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **prm).fit(X, y)
    exp = export_hgb(final)
    # проверка экспорта
    sample = np.random.default_rng(1).choice(len(X), 400, replace=False)
    raw_sk = final._raw_predict(X[sample]).ravel()
    raw_js = predict_raw_py(exp, X[sample])
    assert np.allclose(raw_sk, raw_js, atol=1e-4), np.abs(raw_sk - raw_js).max()
    c = contributions_py(exp, X[sample[0]], len(INJURY_FEATURES))
    # сумма вкладов + значения корней + базовая линия = сырой прогноз
    assert abs(exp["base"] + sum(tr["v"][0] for tr in exp["trees"]) + c.sum() - raw_js[0]) < 1e-3

    fmed = np.nanmedian(X, axis=0)
    q = {k: [round(float(np.nanpercentile(X[:, i], a)), 4) for a in (10, 50, 90)] for i, k in enumerate(INJURY_FEATURES)}

    model = {
        "name": "injury_risk",
        "version": "1.0.0",
        "trained_at": time.strftime("%Y-%m-%d"),
        "task": "Вероятность травмы на следующий день по нагрузке и самочувствию за предыдущие 7 дней относительно личной нормы",
        "features": INJURY_FEATURES,
        "base_rate_daily": round(float(base_rate), 5),
        "hgb": exp,
        "calibration": cal,
        "feature_quantiles": q,
        "params": prm,
    }
    card = {
        "name": "injury_risk",
        "version": "1.0.0",
        "dataset": {
            "title": "Injury Prediction in Competitive Runners (Lövdal, den Hartigh, Azzopardi, 2021)",
            "doi": "10.34894/UWU9PV", "url": "https://doi.org/10.34894/UWU9PV", "license": "CC0 1.0",
            "athletes": int(len(np.unique(g))), "days": int(len(y)), "events": int(y.sum()),
        },
        "validation": "5-fold GroupKFold по спортсменам (модель проверяется на людях, которых не видела при обучении)",
        "metrics_oof": results,
        "chosen": best,
        "ci95_bootstrap_athletes": ci,
        "ci95_baseline_acwr": ci_base,
        "brier_constant": round(float(brier_score_loss(y, np.full(len(y), base_rate))), 5),
        "brier_calibrated": round(float(brier_score_loss(y, p_cal)), 5),
        "lift_top_decile": round(lift_top10, 2),
        "reliability": reliability,
        "permutation_importance_auc": {k: round(float(v), 4) for k, v in sorted(zip(INJURY_FEATURES, imp), key=lambda z: -z[1])},
        "feature_medians": {k: (None if np.isnan(v) else round(float(v), 4)) for k, v in zip(INJURY_FEATURES, fmed)},
        "missing_share": {k: round(float(np.isnan(X[:, i]).mean()), 3) for i, k in enumerate(INJURY_FEATURES)},
    }
    outp = Path(out)
    outp.mkdir(parents=True, exist_ok=True)
    (outp / "injury_model.json").write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
    (outp / "injury_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=1))
    # тестовые векторы для проверки JS
    tv = [{"x": [None if np.isnan(v) else float(v) for v in X[i]], "raw": float(r), "p_cal": float(1 / (1 + np.exp(-(cal["a"] * r + cal["b"]))))} for i, r in zip(sample[:60], raw_sk[:60])]
    (outp / "injury_testvectors.json").write_text(json.dumps(tv))
    print(json.dumps(card, ensure_ascii=False, indent=1)[:3000])
    print(f"done in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
