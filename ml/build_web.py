"""Собирает обученные модели и карточки моделей в models.js для сайта (инференс в браузере, без сервера).

Запуск: python ml/build_web.py <папка с *_model.json и *_card.json> <корень сайта>
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


def main(src: str, site: str):
    s, root = Path(src), Path(site)
    out = {}
    for name in ("injury", "readiness"):
        out[name] = json.loads((s / f"{name}_model.json").read_text())
        out[name + "_card"] = json.loads((s / f"{name}_card.json").read_text())
        for suffix in ("model", "card", "testvectors"):
            shutil.copy(s / f"{name}_{suffix}.json", root / "ml" / "models" / f"{name}_{suffix}.json")
    js = ("/* Сгенерировано ml/build_web.py — не редактировать вручную.\n"
          "   Обученные модели AI Sports (деревья решений и линейная модель) и их карточки с метриками. */\n"
          "window.ASPModels = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (root / "models.js").write_text(js, encoding="utf-8")
    print("models.js", round(len(js.encode()) / 1024), "KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
