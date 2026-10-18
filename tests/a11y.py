"""Проверка доступности (WCAG 2.1 AA) движком axe-core на всех страницах сайта и кабинета.

Запуск: python tests/a11y.py            — локальный сервер с заголовками как на Vercel
        E2E_BASE=https://… python tests/a11y.py — против продакшена

axe-core (MPL-2.0, Deque) скачивается один раз в кэш ~/.cache/axe-core; если сети нет и кэша нет —
проверка пропускается с сообщением, а не падает (сами сценарии покрывает e2e.py).
Падает при любом нарушении уровня serious/critical, moderate выводится предупреждением.
"""
import os, sys, json, time, urllib.request, pathlib

sys.path.insert(0, os.path.dirname(__file__))
from playwright.sync_api import sync_playwright

AXE_VERSION = "4.10.2"
AXE_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/%s/axe.min.js" % AXE_VERSION
CACHE = pathlib.Path(os.environ.get("AXE_CACHE", pathlib.Path.home() / ".cache" / "axe-core")) / ("axe-%s.min.js" % AXE_VERSION)

PROFILE = ("try{localStorage.setItem('asp_consent_v1',JSON.stringify({necessary:true,analytics:false,ts:1}));"
           "var s=JSON.parse(localStorage.getItem('asp_app_v1')||'{}');if(!s.profile){s.profile={name:'Тест Тестов',role:'doctor',ts:1};s.ui=2}"
           "s.theme='%s';localStorage.setItem('asp_app_v1',JSON.stringify(s))}catch(e){}")

PAGES = ["/", "/privacy", "/terms", "/cookies", "/consent", "/checkin",
         "/app#/overview", "/app#/athletes", "/app#/twin", "/app#/medical", "/app#/analytics", "/app#/models",
         "/app#/recs", "/app#/reports", "/app#/team", "/app#/admin", "/app#/settings"]
TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]


def axe_source():
    if CACHE.exists():
        return CACHE.read_text(encoding="utf-8")
    try:
        data = urllib.request.urlopen(AXE_URL, timeout=30).read().decode("utf-8")
    except Exception as e:  # noqa: BLE001
        print("axe-core недоступен (%s) — проверка доступности пропущена" % e)
        return None
    if not data.startswith("/*! axe v" + AXE_VERSION):
        print("axe-core: неожиданное содержимое, проверка пропущена")
        return None
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(data, encoding="utf-8")
    return data


def main():
    axe = axe_source()
    if axe is None:
        return 0
    base = os.environ.get("E2E_BASE")
    srv = None
    if not base:
        import server
        srv, base = server.start(0)
    failures, warnings = [], []
    t0 = time.time()
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for theme in ("light", "dark"):
            for path in PAGES:
                for mobile in (False, True):
                    if mobile and not path.startswith("/app"):
                        continue
                    ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900}, bypass_csp=True)
                    ctx.add_init_script(PROFILE % theme)
                    pg = ctx.new_page()
                    pg.goto(base + path)
                    pg.wait_for_timeout(700)
                    pg.add_script_tag(content=axe)
                    res = pg.evaluate("(tags) => axe.run(document, {runOnly: {type: 'tag', values: tags}})", TAGS)
                    for v in res["violations"]:
                        where = "%s [%s%s]" % (path, theme, ", mobile" if mobile else "")
                        for n in v["nodes"][:3]:
                            line = "%s  %s (%s): %s — %s" % (where, v["id"], v["impact"], n["html"][:110], n.get("failureSummary", "").replace("\n", " ")[:160])
                            (failures if v["impact"] in ("serious", "critical") else warnings).append(line)
                    ctx.close()
        b.close()
    if srv:
        srv.shutdown()
    for w in warnings:
        print("  warn  " + w)
    for f in failures:
        print("  FAIL  " + f)
    print("\naxe-core %s: %d страниц × 2 темы, %d нарушений serious/critical, %d предупреждений (%.0f с)" % (AXE_VERSION, len(PAGES), len(failures), len(warnings), time.time() - t0))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
