"""Признаки для моделей AI Sports.

Одинаковая логика реализована в браузере (model.js) — любые изменения нужно вносить в оба места
и заново запускать проверку соответствия (verify_js.py).

Все признаки считаются ТОЛЬКО по прошлым дням (без утечки будущего) и относительно личной нормы
спортсмена, поэтому они переносимы между видами спорта лучше, чем абсолютные километры или минуты.
"""
from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# Модель риска травмы. Вход — дневной ряд спортсмена:
#   load      — объём нагрузки за день (у бегунов: км + 8 × часы альтернативной тренировки;
#               в продукте: sRPE, у.е.). Масштаб не важен — признаки относительные.
#   hi        — часть нагрузки высокой интенсивности (бегуны: км Z5/T1/T2 + спринт)
#   sessions  — число тренировок за день
#   strength  — число силовых тренировок
#   exertion  — субъективная тяжесть 0..1 (RPE / 10)
#   success   — субъективный успех тренировки 0..1 (может отсутствовать)
#   recovery  — субъективная ПОТРЕБНОСТЬ в восстановлении 0..1 (выше = хуже восстановлен)
# NaN = нет данных за день.
# ---------------------------------------------------------------------------
INJURY_FEATURES = [
    "load7_rel",       # средняя дневная нагрузка за 7 дней / личная средняя дневная нагрузка
    "monotony7",       # монотонность (Foster): среднее / СКО за 7 дней
    "rest7",           # дней без нагрузки за 7 дней
    "hi7_rel",         # интенсивная нагрузка за 7 дней / личная норма интенсивной нагрузки
    "hi_share7_rel",   # доля интенсивной нагрузки за 7 дней / личная доля
    "spike7",          # максимальный день за 7 / личный средний тренировочный день
    "trend3",          # средняя нагрузка 3 последних дней / 4 предыдущих
    "sessions7_rel",   # тренировок за 7 дней / личная норма
    "strength7_rel",   # силовых за 7 дней / личная норма
    "days_since_rest", # дней подряд с тренировками до прогноза (0..7, 7 = без отдыха всю неделю)
    "exert_z",         # субъективная тяжесть за 7 дней относительно личной нормы (z)
    "recov_z",         # потребность в восстановлении за 3 дня относительно личной нормы (z)
]
# Все признаки относительные (к личной норме) или безразмерные: модель обучена на бегунах, а применяется
# к другим видам спорта, поэтому абсолютные километры, число тренировок и шкалы опросников не используются.
# Признаки — только окно последних 7 дней и личные нормы по дням ДО этого окна. В открытом датасете бегунов
# перед травмами нет истории длиннее 7 дней (особенность выгрузки), поэтому признаки с окном 14–28 дней
# «узнают» травму по пропуску данных — это утечка, их не используем.


def _nanmean(a):
    a = np.asarray(a, dtype=float)
    m = ~np.isnan(a)
    return float(a[m].mean()) if m.any() else np.nan


def _nanstd(a):
    a = np.asarray(a, dtype=float)
    m = ~np.isnan(a)
    return float(a[m].std()) if m.sum() > 1 else np.nan


def _days_since_rest(l7) -> float:
    """Сколько дней подряд до прогноза были тренировки (0 = вчера был отдых, 7 = без отдыха всю неделю)."""
    for k in range(1, 8):
        v = l7[-k]
        if np.isnan(v):
            return np.nan
        if v == 0:
            return float(k - 1)
    return 7.0


def _ratio(a, b):
    return a / b if (a == a and b is not None and b == b and b > 0) else np.nan


def injury_features_at(series: dict, t: int, personal: dict) -> list:
    """Признаки для прогноза на день t по окну дней t-7..t-1 и личным нормам (дни < t-7)."""
    if t < 7:
        return [np.nan] * len(INJURY_FEATURES)
    w7 = slice(t - 7, t)
    l7 = series["load"][w7]
    n7 = int((~np.isnan(l7)).sum())
    f = {}
    ok = n7 >= 5
    m7 = _nanmean(l7) if ok else np.nan
    f["load7_rel"] = _ratio(m7, personal.get("day_load"))
    s7 = _nanstd(l7) if ok else np.nan
    f["monotony7"] = min(m7 / s7, 10.0) if (s7 == s7 and s7 > 0) else (10.0 if (m7 == m7 and m7 > 0) else np.nan)
    f["rest7"] = float((l7 == 0).sum()) if ok else np.nan
    h7 = series["hi"][w7]
    hs, ls = float(np.nansum(h7)), float(np.nansum(l7))
    f["hi7_rel"] = _ratio(hs / n7, personal.get("day_hi")) if ok else np.nan
    share = (hs / ls if ls > 0 else 0.0) if ok else np.nan
    f["hi_share7_rel"] = _ratio(share, personal.get("hi_share"))
    f["spike7"] = _ratio(float(np.nanmax(l7)), personal.get("train_day_load")) if ok else np.nan
    ma, mb = _nanmean(l7[4:]), _nanmean(l7[:4])
    f["trend3"] = min(ma / mb, 10.0) if (mb == mb and mb > 0 and ma == ma) else (10.0 if (ma == ma and ma > 0 and mb == 0) else np.nan)
    f["sessions7_rel"] = _ratio(float(np.nansum(series["sessions"][w7])) / n7, personal.get("day_sessions")) if ok else np.nan
    f["strength7_rel"] = _ratio(float(np.nansum(series["strength"][w7])) / n7, personal.get("day_strength")) if ok else np.nan
    f["days_since_rest"] = _days_since_rest(l7)
    e7 = _nanmean(series["exertion"][w7])
    em, es = personal.get("exert_mean"), personal.get("exert_std")
    f["exert_z"] = (e7 - em) / es if (e7 == e7 and em is not None and es and es > 0) else np.nan
    r3 = _nanmean(series["recovery"][t - 3:t])
    rm, rs = personal.get("recov_mean"), personal.get("recov_std")
    f["recov_z"] = (r3 - rm) / rs if (r3 == r3 and rm is not None and rs and rs > 0) else np.nan
    return [f[k] for k in INJURY_FEATURES]


def personal_norms(series: dict, t: int) -> dict:
    """Личные нормы по дням до окна прогноза (< t-7): нагрузка — от 28 дней наблюдений, опросы — от 14."""
    end = max(0, t - 7)
    load = series["load"][:end]
    m = ~np.isnan(load)
    p = {}
    if int(m.sum()) >= 28:
        known = load[m]
        p["day_load"] = float(known.mean())
        tr = known[known > 0]
        if len(tr):
            p["train_day_load"] = float(tr.mean())
        hi = series["hi"][:end][m]
        p["day_hi"] = _nanmean(hi)
        tot = float(known.sum())
        p["hi_share"] = float(np.nansum(hi)) / tot if tot > 0 else np.nan
        p["day_sessions"] = _nanmean(series["sessions"][:end][m])
        p["day_strength"] = _nanmean(series["strength"][:end][m])
    ex = series["exertion"][:end]
    if int((~np.isnan(ex)).sum()) >= 14:
        p["exert_mean"], p["exert_std"] = _nanmean(ex), _nanstd(ex)
    rc = series["recovery"][:end]
    if int((~np.isnan(rc)).sum()) >= 14:
        p["recov_mean"], p["recov_std"] = _nanmean(rc), _nanstd(rc)
    return p


# ---------------------------------------------------------------------------
# Модель готовности на завтра. Шкалы как в SoccerMon/PMSys: 1..5, ВЫШЕ = ЛУЧШЕ
# (fatigue 5 = свеж, soreness 5 = нет болезненности, stress 5 = спокоен), readiness 0..10,
# sleep_duration — часы, srpe — нагрузка дня (у.е.).
# ---------------------------------------------------------------------------
READINESS_FEATURES = [
    "readiness", "fatigue", "mood", "sleep_duration", "sleep_quality", "soreness", "stress",
    "readiness3", "fatigue3", "soreness3",
    "readiness_base",
    "srpe_today", "srpe7_rel", "acwr_srpe", "monotony7_srpe",
]
WELLNESS = ["fatigue", "mood", "readiness", "sleep_duration", "sleep_quality", "soreness", "stress"]


def readiness_features_at(series: dict, t: int) -> list:
    """Признаки по дню t (включительно) для прогноза готовности на день t+1."""
    f = {}
    for k in WELLNESS:
        f[k] = float(series[k][t])
    w3 = slice(max(0, t - 2), t + 1)
    f["readiness3"] = _nanmean(series["readiness"][w3])
    f["fatigue3"] = _nanmean(series["fatigue"][w3])
    f["soreness3"] = _nanmean(series["soreness"][w3])
    past = series["readiness"][:t]
    base = _nanmean(past) if int((~np.isnan(past)).sum()) >= 7 else np.nan
    f["readiness_base"] = base
    s = series["srpe"]
    f["srpe_today"] = float(s[t]) if not np.isnan(s[t]) else np.nan
    s7 = s[max(0, t - 6):t + 1]
    s28 = s[max(0, t - 27):t + 1]
    n7, n28 = int((~np.isnan(s7)).sum()), int((~np.isnan(s28)).sum())
    m7 = _nanmean(s7) if n7 >= 4 else np.nan
    m28 = _nanmean(s28) if n28 >= 14 else np.nan
    allp = s[:t + 1]
    pm = _nanmean(allp) if int((~np.isnan(allp)).sum()) >= 14 else np.nan
    f["srpe7_rel"] = m7 / pm if (pm == pm and pm > 0 and m7 == m7) else np.nan
    f["acwr_srpe"] = m7 / m28 if (m28 == m28 and m28 > 0 and m7 == m7) else np.nan
    sd7 = _nanstd(s7) if n7 >= 4 else np.nan
    f["monotony7_srpe"] = min(m7 / sd7, 10.0) if (sd7 == sd7 and sd7 > 0) else (10.0 if (m7 == m7 and m7 > 0) else np.nan)
    return [f[k] for k in READINESS_FEATURES]
