"""Экспорт sklearn HistGradientBoosting в компактный JSON для инференса в браузере (model.js)."""
from __future__ import annotations

import numpy as np


def export_hgb(model) -> dict:
    trees = []
    lr = float(model.learning_rate)
    for it in model._predictors:
        for pred in it:  # для бинарной классификации и регрессии — по одному дереву на итерацию
            n = pred.nodes
            trees.append({
                "f": [int(x) if not leaf else -1 for x, leaf in zip(n["feature_idx"], n["is_leaf"])],
                # пороги без округления: значения признаков часто совпадают с порогом точно
                "t": [float(x) for x in n["num_threshold"]],
                "m": [int(x) for x in n["missing_go_to_left"]],
                "l": [int(x) for x in n["left"]],
                "r": [int(x) for x in n["right"]],
                # в sklearn листья уже умножены на learning_rate, а внутренние узлы — нет;
                # приводим внутренние узлы к тому же масштабу, чтобы вклад признаков (Saabas) суммировался корректно
                "v": [round(float(x) if leaf else float(x) * lr, 9) for x, leaf in zip(n["value"], n["is_leaf"])],
            })
    base = np.asarray(model._baseline_prediction).ravel()
    return {"base": round(float(base[0]), 7), "trees": trees}


def predict_raw_py(exported: dict, X: np.ndarray) -> np.ndarray:
    """Та же логика, что в model.js — для проверки соответствия экспорта."""
    out = np.full(X.shape[0], exported["base"], dtype=float)
    for tr in exported["trees"]:
        f, t, m, l, r, v = tr["f"], tr["t"], tr["m"], tr["l"], tr["r"], tr["v"]
        for i in range(X.shape[0]):
            k = 0
            while f[k] != -1:
                x = X[i, f[k]]
                if np.isnan(x):
                    k = l[k] if m[k] else r[k]
                else:
                    k = l[k] if x <= t[k] else r[k]
            out[i] += v[k]
    return out


def contributions_py(exported: dict, x: np.ndarray, n_features: int) -> np.ndarray:
    """Вклад признаков по пути в деревьях (Saabas): сумма изменений значения узла на каждом сплите."""
    c = np.zeros(n_features)
    for tr in exported["trees"]:
        f, t, m, l, r, v = tr["f"], tr["t"], tr["m"], tr["l"], tr["r"], tr["v"]
        k = 0
        while f[k] != -1:
            xv = x[f[k]]
            nk = (l[k] if m[k] else r[k]) if np.isnan(xv) else (l[k] if xv <= t[k] else r[k])
            c[f[k]] += v[nk] - v[k]
            k = nk
    return c


def isotonic_export(iso) -> dict:
    return {"x": [round(float(a), 6) for a in iso.X_thresholds_], "y": [round(float(b), 6) for b in iso.y_thresholds_]}
