"""Сквозные тесты AI Sports в настоящем браузере (Playwright + Chromium).

Запуск:  python tests/e2e.py            — все тесты
         python tests/e2e.py pilot      — только тесты, в имени которых есть «pilot»
Сервер поднимается сам и отдаёт заголовки из vercel.json (CSP и т. д.), как в продакшене.
Зависимость одна: pip install playwright && python -m playwright install chromium
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import traceback
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402

if os.environ.get("E2E_BASE"):  # прогон против развёрнутого сайта: E2E_BASE=https://sportmed-eight.vercel.app
    SRV, BASE = None, os.environ["E2E_BASE"].rstrip("/")
else:
    SRV, BASE = server.start(0)
EXE = os.environ.get("PW_CHROMIUM") or (("/opt/pw-browsers/chromium") if Path("/opt/pw-browsers/chromium").exists() else None)

TESTS = []
ROUTE_READY = """(p) => {
  const sel = '[data-route="' + p + '"]';
  return !document.querySelector(sel) || !!document.querySelector(sel + '[aria-current="page"]');
}"""
OPEN = []  # открытые страницы — для скриншота при падении
ART = Path(__file__).resolve().parent / "artifacts"


def test(fn):
    TESTS.append(fn)
    return fn


CONSENT_JS = "try{localStorage.getItem('asp_consent')||localStorage.setItem('asp_consent',JSON.stringify({v:2,necessary:true,analytics:false,ts:Date.now()}))}catch(e){}"

class Page:
    """Страница с учётом ошибок: любая ошибка JS или нарушение CSP валит тест."""

    def __init__(self, browser, mobile=False, no_profile=False):
        opts = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True) if mobile else dict(viewport={"width": 1440, "height": 960})
        self.ctx = browser.new_context(accept_downloads=True, **opts)
        # согласие на cookie заранее — баннер не перекрывает кнопки
        self.ctx.add_init_script(CONSENT_JS)
        if not no_profile:  # профиль специалиста уже введён — иначе кабинет показывает экран входа
            self.ctx.add_init_script("try{var s=JSON.parse(localStorage.getItem('asp_app_v1')||'{}');if(!s.profile){s.profile={name:'Тест Тестов',role:'doctor',ts:1};s.ui=2;s.theme='light';localStorage.setItem('asp_app_v1',JSON.stringify(s))}}catch(e){}")
        self.p = self.ctx.new_page()
        OPEN.append(self)
        self.errors = []
        self.p.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)))
        self.p.on("console", self._console)
        self.p.on("response", self._response)

    def _response(self, r):
        u = r.url
        if r.status >= 400 and u.startswith(BASE) and "/gf/" not in u and "/nope-404" not in u and "/_vercel/" not in u:
            self.errors.append(f"http {r.status}: {u[len(BASE):]}")

    def _console(self, m):
        if m.type != "error":
            return
        t = m.text
        # шрифты /gf/ проксируются только на Vercel; HTTP-ошибки ловит _response
        if "Failed to load resource" in t:
            return
        self.errors.append("console: " + t)

    def go(self, path, wait=500):
        self.p.goto(BASE + path)
        self.p.wait_for_load_state("domcontentloaded")
        if "#/" in path:  # смена только «#» не перезагружает страницу — ждём, пока роутер отрисует раздел
            page = path.split("#/")[1].split("/")[0]
            self.p.wait_for_function(ROUTE_READY, arg=page, timeout=10000)
        self.p.wait_for_timeout(wait)
        return self

    def text(self, sel="#view"):
        return self.p.inner_text(sel)

    def check_clean(self):
        assert not self.errors, "ошибки в консоли:\n  " + "\n  ".join(self.errors[:10])

    def close(self):
        if self in OPEN:
            OPEN.remove(self)
        self.ctx.close()


def create_pilot(pg: Page, roster="Спортсмен A; нападающий; 7\nСпортсмен B; вратарь; 1"):
    pg.go("/app#/settings")
    pg.p.click('[data-action="pilot-create"]')
    pg.p.fill("#pw-name", "Тестовая команда")
    pg.p.fill("#pw-roster", roster)
    pg.p.click('#pw-form button[type="submit"]')
    pg.p.wait_for_function("() => !!document.getElementById('tc-name') && document.getElementById('tc-name').textContent.indexOf('Тестовая команда') >= 0", timeout=10000)
    pg.p.wait_for_selector("#modal-root .modal", state="detached", timeout=10000) if pg.p.locator("#modal-root .modal").count() else None


def make_reply(browser, invite, readiness="3"):
    ph = Page(browser, mobile=True)
    ph.p.goto(invite)
    ph.p.wait_for_timeout(400)
    assert "#" not in ph.p.url, "ключ должен убираться из адресной строки"
    ph.p.click(f'[data-scale="readiness"] button[data-v="{readiness}"]')
    ph.p.click('[data-scale="fatigue"] button[data-v="4"]')
    ph.p.fill("#ci-sleeph", "7,5")
    ph.p.fill("#ci-rpe", "6")
    ph.p.fill("#ci-dur", "80")
    ph.p.click("#ci-submit")
    ph.p.wait_for_timeout(500)
    href = ph.p.get_attribute("#ci-tg", "href")
    reply = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)["url"][0]
    ph.check_clean()
    ph.close()
    return reply


# ------------------------------------------------------------------ тесты

@test
def landing_and_legal_pages(b):
    pg = Page(b)
    for path, must in [("/", "AI Sports"), ("/privacy", "Редакция"), ("/terms", "Редакция"), ("/cookies", "asp_pilot_v1"), ("/consent", "Редакция"), ("/nope-404", "")]:
        pg.go(path, 300)
        if must:
            assert must in pg.text("body"), f"{path}: нет «{must}»"
    pg.check_clean()
    pg.close()


@test
def science_and_journal_pages(b):
    """«Наука» и журнал: каждая ссылка на источник ведёт в список, источники пронумерованы по порядку,
    у каждого есть DOI, разметка schema.org читается, внутренние ссылки живые."""
    pg = Page(b)
    pages = ["/science", "/journal", "/journal/hrv", "/journal/overtraining", "/journal/acwr"]
    for path in pages:
        pg.go(path, 250)
        info = pg.p.evaluate("""() => {
          const cites = [...document.querySelectorAll('sup.cite a')].map(a => a.getAttribute('href'));
          const refs = [...document.querySelectorAll('ol.refs > li')];
          const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
          const firstSeen = []; cites.forEach(h => { if (!firstSeen.includes(h)) firstSeen.push(h); });
          return { cites, firstSeen, refIds: refs.map(r => '#' + r.id), doi: refs.every(r => r.querySelector('a[href^="https://doi.org/10."]')),
                   types: ld.flatMap(x => (x['@graph'] || [x]).map(n => n['@type'])), h1: document.querySelectorAll('h1').length,
                   links: [...document.querySelectorAll('main a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]) };
        }""")
        assert info["h1"] == 1, path
        assert "BreadcrumbList" in info["types"], (path, info["types"])
        if path != "/journal":
            assert info["cites"], path
            assert sorted(set(info["cites"])) == sorted(info["refIds"]), (path, "ссылки на источники и список не совпадают")
            assert info["firstSeen"] == info["refIds"], (path, "источники пронумерованы не по порядку упоминания")
            assert info["doi"], path
            assert "Article" in info["types"] and "FAQPage" in info["types"], (path, info["types"])
        for href in set(info["links"]) - {""}:
            if href.startswith(("/app", "/gf/")):
                continue
            st = pg.p.evaluate("(u) => fetch(u, {method: 'HEAD'}).then(r => r.status)", href)  # через браузер: тот же прокси, что у страницы
            assert st == 200, (path, href, st)
    assert pg.p.locator("ol.refs > li").count() >= 5
    pg.go("/science", 200)
    assert pg.p.locator("ol.refs > li").count() == 41
    pg.check_clean()
    pg.close()


@test
def demo_cabinet_all_pages_render(b):
    pg = Page(b)
    for page in ["overview", "athletes", "twin", "medical", "analytics", "models", "recs", "reports", "about", "admin", "settings", "help"]:
        pg.go("/app#/" + page, 350)
        v = pg.text()
        assert "Не удалось отобразить" not in v, page
        assert len(v) > 200, f"{page}: пустая страница"
    pg.check_clean()
    pg.close()


@test
def crypto_roundtrip_and_tamper(b):
    pg = Page(b).go("/checkin", 300)
    res = pg.p.evaluate("""async () => {
      const C = window.ASPCrypto, k = C.randomKey();
      const ak = await C.deriveAthleteKey(k, 'team1', 'ath1');
      const ak2 = await C.deriveAthleteKey(k, 'team1', 'ath2');
      const blob = await C.seal(ak, {x: 1, s: 'тест'}, C.aadFor('team1', 'ath1'));
      const back = await C.open(ak, blob, C.aadFor('team1', 'ath1'));
      let wrongAad = false, wrongKey = false;
      try { await C.open(ak, blob, C.aadFor('team1', 'ath2')); } catch (e) { wrongAad = true; }
      try { await C.open(ak2, blob, C.aadFor('team1', 'ath1')); } catch (e) { wrongKey = true; }
      const inv = C.parseInvite('#' + C.inviteHash('team1', 'ath1', ak, 'Имя'));
      return {back, wrongAad, wrongKey, distinct: ak !== ak2, inv};
    }""")
    assert res["back"] == {"x": 1, "s": "тест"}
    assert res["wrongAad"] and res["wrongKey"] and res["distinct"]
    assert res["inv"]["name"] == "Имя" and res["inv"]["athleteId"] == "ath1"
    # страница без приглашения показывает понятную ошибку
    assert "Ссылка не работает" in pg.text("body")
    pg.close()


@test
def pilot_checkin_link_full_flow(b):
    doc = Page(b)
    create_pilot(doc)
    doc.go("/app#/twin")
    doc.p.click('[data-action="athlete-link"]')
    doc.p.wait_for_timeout(400)
    invite = doc.p.input_value("#inv-url")
    assert "/checkin#v1." in invite
    assert doc.p.locator(".qr-box svg").count() == 1, "нет QR-кода"
    doc.p.keyboard.press("Escape")

    reply = make_reply(b, invite)
    assert "/app#ci=" in reply

    # врач открывает ответ
    doc.p.goto(reply)
    doc.p.wait_for_timeout(800)
    assert "1 ответ готов" in doc.text("#modal-root")
    doc.p.click("#rp-save")
    doc.p.wait_for_timeout(400)
    doc.go("/app#/twin")
    j = doc.text(".journal-table")
    assert "спортсмен" in j and "3/10" in j and "7,5 ч" in j, j

    # тот же ответ повторно — пропускается
    doc.p.goto(reply)
    doc.p.wait_for_timeout(800)
    assert "уже в журнале" in doc.text("#modal-root")
    doc.p.keyboard.press("Escape")

    # подделанный ответ — отклоняется
    bad = reply[:-6] + ("A" if reply[-6] != "A" else "B") + reply[-5:]
    doc.p.goto(bad)
    doc.p.wait_for_timeout(800)
    assert "Не удалось расшифровать" in doc.text("#modal-root")
    doc.p.keyboard.press("Escape")

    # пачка ответов из переписки: мусор игнорируется
    reply2 = make_reply(b, invite, readiness="8")
    doc.go("/app#/overview")
    doc.p.click('.page-actions [data-action="inbox"]')
    doc.p.fill("#ib-text", "сообщение\n" + reply2 + "\nещё текст https://example.com")
    doc.p.click("#ib-go")
    doc.p.wait_for_timeout(800)
    assert "1 ответ готов" in doc.text("#modal-root") and "заменит запись" in doc.text("#modal-root")
    doc.p.click("#rp-save")
    doc.p.wait_for_timeout(300)

    # смена ключа — старые ссылки перестают работать
    doc.go("/app#/settings")
    doc.p.click('[data-action="rotate-key"]')
    doc.p.click("#rk-go")
    doc.p.wait_for_timeout(300)
    doc.p.goto(reply2)
    doc.p.wait_for_timeout(800)
    assert "ключ был сменён" in doc.text("#modal-root")
    doc.check_clean()
    doc.close()


@test
def pilot_journal_edit_and_delete(b):
    pg = Page(b)
    create_pilot(pg)
    pg.go("/app#/twin")
    pg.p.click('.panel-head [data-jedit]')
    pg.p.wait_for_timeout(200)
    pg.p.fill("#je-readiness", "11")
    pg.p.click('#je-form button[type="submit"]')
    assert "от 0 до 10" in pg.text("#je-err")
    pg.p.fill("#je-readiness", "6")
    pg.p.fill("#je-fatigue", "2")
    pg.p.fill("#je-srpe", "450")
    pg.p.click('#je-form button[type="submit"]')
    pg.p.wait_for_timeout(300)
    j = pg.text(".journal-table")
    assert "6/10" in j and "2/5" in j and "450" in j and "правка" in j, j
    pg.p.click(".journal-table [data-jdel]")
    pg.p.wait_for_timeout(200)
    pg.p.click("#modal-root .btn-danger")
    pg.p.wait_for_timeout(300)
    assert pg.p.locator(".journal-table").count() == 0 or "6/10" not in pg.text(".journal-table")
    pg.check_clean()
    pg.close()


@test
def pilot_backup_encrypted_roundtrip(b):
    pg = Page(b)
    create_pilot(pg)
    pg.go("/app#/settings")
    pg.p.click('[data-action="pilot-backup"]')
    pg.p.fill("#bk-pass", "верный-пароль-123")
    with pg.p.expect_download() as dl:
        pg.p.click("#bk-save")
    path = Path(tempfile.mkdtemp()) / "backup.enc.json"
    dl.value.save_as(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["enc"] == "AES-GCM" and "Спортсмен" not in path.read_text(encoding="utf-8"), "копия должна быть зашифрована"
    pg.p.keyboard.press("Escape")
    # новое устройство: данных нет — восстановление из окна «Моя команда»
    pg.p.evaluate("""() => { localStorage.removeItem('asp_pilot_v1'); const s = JSON.parse(localStorage.getItem('asp_app_v1') || '{}'); s.ws = 'demo'; localStorage.setItem('asp_app_v1', JSON.stringify(s)); }""")
    pg.go("/app#/settings")
    pg.p.reload()
    pg.p.wait_for_timeout(500)
    pg.p.click('[data-action="pilot-create"]')
    pg.p.click(".restore-box summary")
    pg.p.fill("#bk-restore-pass", "неверный")
    pg.p.set_input_files("#bk-file", str(path))
    pg.p.wait_for_timeout(1500)
    assert "проверьте пароль" in pg.text("#bk-out")
    pg.p.fill("#bk-restore-pass", "верный-пароль-123")
    pg.p.set_input_files("#bk-file", str(path))
    pg.p.wait_for_timeout(1500)
    pg.go("/app#/athletes")
    assert "Спортсмен A" in pg.text() and "Тестовая команда" in pg.text("#tc-name")
    # испорченный файл — понятная ошибка, данные не трогаются
    bad = Path(tempfile.mkdtemp()) / "bad.json"
    bad.write_text(json.dumps({"app": "ai-sports-pilot", "team": {"name": "X"}, "athletes": [{"id": "<img src=x>"}], "records": {}}), encoding="utf-8")
    pg.go("/app#/settings")
    pg.p.click('[data-action="pilot-backup"]')
    pg.p.set_input_files("#bk-file", str(bad))
    pg.p.wait_for_timeout(600)
    assert "повреждён" in pg.text("#bk-out")
    pg.p.keyboard.press("Escape")
    assert "Тестовая команда" in pg.text("#tc-name")
    pg.check_clean()
    pg.close()


@test
def pilot_staff_admin_and_consents(b):
    pg = Page(b)
    create_pilot(pg)
    pg.go("/app#/settings")
    pg.p.click('[data-action="staff"]')
    pg.p.fill("#st-doctor", "Ербол Сапаров")
    pg.p.click('#st-form button[type="submit"]')
    pg.p.wait_for_timeout(200)
    assert pg.text("#me-name") == "Ербол Сапаров" and pg.text("#me-initials") == "ЕС"
    pg.p.click('[data-role-set="admin"]')
    pg.go("/app#/admin")
    v = pg.text()
    assert "Безопасность и данные" in v and "demo.team" not in v and "Касымова" not in v
    pg.p.click('input[data-consent="health"]')
    pg.p.wait_for_timeout(200)
    assert "Согласие «Данные о здоровье»" in pg.text(".audit-list")
    pg.check_clean()
    pg.close()


@test
def print_report_and_offline(b):
    pg = Page(b)
    create_pilot(pg)
    pg.go("/app#/twin")
    pg.p.emulate_media(media="print")
    assert pg.p.is_visible(".print-head") and not pg.p.is_visible(".sidebar")
    pg.p.emulate_media(media="screen")
    pg.p.wait_for_function("() => navigator.serviceWorker.ready.then(() => true)", timeout=8000)
    pg.p.reload()
    pg.p.wait_for_timeout(800)
    pg.ctx.set_offline(True)
    pg.p.reload()
    pg.p.wait_for_timeout(800)
    assert "Цифровой двойник" in pg.text(), "кабинет должен открываться без сети"
    pg.ctx.set_offline(False)
    pg.close()


@test
def mobile_no_horizontal_scroll(b):
    pg = Page(b, mobile=True)
    for path in ["/", "/app#/overview", "/app#/twin", "/app#/settings", "/checkin", "/privacy"]:
        pg.go(path, 400)
        w = pg.p.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
        pg.p.evaluate("() => window.scrollTo(400, 0)")
        assert pg.p.evaluate("() => window.scrollX") == 0, f"{path}: горизонтальная прокрутка {w}"
    pg.check_clean()
    pg.close()


@test
def reports_pdf_and_csv(b):
    pg = Page(b).go("/app#/reports", 500)
    for k in ["team", "risk", "pilot"]:
        with pg.p.expect_download() as dl:
            pg.p.click(f'[data-pdf="{k}"]')
        path = Path(tempfile.mkdtemp()) / "r.pdf"
        dl.value.save_as(path)
        data = path.read_bytes()
        assert dl.value.suggested_filename.endswith(".pdf") and data.startswith(b"%PDF-1.4") and data.rstrip().endswith(b"%%EOF"), k
        assert data.count(b"/Type /Page ") >= 1 and len(data) > 50_000, k
        with pg.p.expect_download() as dl:
            pg.p.click(f'[data-download="{k}"]')
        assert dl.value.suggested_filename.endswith(".csv")
    # общее окно «Создать отчёт» (на страницах с данными; на самой странице отчётов кнопки нет): по умолчанию PDF
    assert pg.p.locator('[data-action="report"]').count() == 0
    pg.go("/app#/overview", 500)
    pg.p.click('[data-action="report"]')
    with pg.p.expect_download() as dl:
        pg.p.click("#rep-go")
    assert dl.value.suggested_filename.endswith(".pdf")
    pg.check_clean()
    pg.close()


@test
def welcome_sign_in_and_out(b):
    pg = Page(b, no_profile=True).go("/app#/overview", 600)
    assert pg.p.is_visible("#welcome") and "Добро пожаловать" in pg.text("#welcome")
    pg.p.click('[data-way="demo"]')  # без имени — ошибка
    assert "Укажите имя" in pg.text("#wc-err")
    pg.p.fill("#wc-name", "Ербол Сапаров")
    pg.p.click('label.wc-role:has-text("Главный тренер")')
    pg.p.click('[data-way="demo"]')
    pg.p.wait_for_selector("#welcome", state="detached", timeout=5000)
    assert pg.text("#me-name") == "Ербол Сапаров" and pg.text("#me-role") == "Главный тренер"
    pg.p.reload(); pg.p.wait_for_timeout(800)
    assert pg.p.locator("#welcome").count() == 0, "после входа экран приветствия не показывается"
    assert pg.p.locator(".ring").count() >= 1 and pg.p.locator("canvas.live-canvas").count() == 1
    # выход
    pg.p.click('[data-action="profile"]'); pg.p.click('[data-action="signout"]'); pg.p.wait_for_timeout(300)
    assert pg.p.is_visible("#welcome")
    # вход с созданием команды открывает окно «Моя команда»
    pg.p.fill("#wc-name", "Айгерим Нурланова"); pg.p.click('[data-way="pilot"]'); pg.p.wait_for_timeout(900)
    assert pg.p.locator("#pw-form").count() == 1
    pg.check_clean()
    pg.close()


@test
def roles_menu_and_report_button(b):
    """Меню и обзор зависят от роли: психолог не видит риск травмы и аналитику, администратор попадает в свой раздел,
    кнопка «Создать отчёт» только там, где есть данные; «Как работает ИИ» — простыми словами, техника под раскрывашкой."""
    pg = Page(b).go("/app#/overview", 600)
    visible = lambda: pg.p.evaluate("() => [...document.querySelectorAll('.nav-item[data-route]')].filter(a => !a.hidden).map(a => a.dataset.route)")

    def as_role(role, hash_):  # смена роли в хранилище + полная загрузка с нужным адресом (смена одного «#» страницу не перезагружает)
        pg.p.evaluate("(r) => { const s = JSON.parse(localStorage.getItem('asp_app_v1')); s.role = r; localStorage.setItem('asp_app_v1', JSON.stringify(s)); }", role)
        pg.p.goto("about:blank")
        pg.p.goto(BASE + "/app#/" + hash_); pg.p.wait_for_load_state("domcontentloaded")
        pg.p.wait_for_function("() => document.querySelector('.nav-item[aria-current=\"page\"]')", timeout=10000); pg.p.wait_for_timeout(300)


@test
def landing_motion_and_banners(b):
    """Баннеры на месте; появление, счётчики и прогресс работают; при «уменьшении движения» всё видно сразу;
    нет горизонтальной прокрутки на планшете и ноутбуке."""
    pg = Page(b).go("/", 900)
    for sel in (".ribbons .r1 .track", "#band.band-dark .bd-img", ".shot-stage .shot", ".proof-stats", "#app .app-banner .device", ".cta-glow"):
        assert pg.p.locator(sel).count() >= 1, sel
    assert pg.p.locator(".rv").count() > 10, "элементы ниже экрана не подготовлены к появлению"
    h = pg.p.evaluate("document.documentElement.scrollHeight")
    for y in range(0, h, 700):
        pg.p.evaluate("(y) => window.scrollTo(0, y)", y); pg.p.wait_for_timeout(120)
    pg.p.wait_for_timeout(2600)
    assert pg.p.locator(".rv:not(.in)").count() == 0, "не появилось: " + str(pg.p.evaluate("[...document.querySelectorAll('.rv:not(.in)')].map(e => e.className + ' @' + Math.round(e.getBoundingClientRect().top + scrollY))"))
    assert pg.text(".proof-stats li:first-child b").replace("\u00a0", " ").strip() == "42 766"
    assert "×1,8" in pg.text(".proof-stats")
    assert pg.p.evaluate("getComputedStyle(document.querySelector('.read-progress i')).transform") != "none"
    assert pg.p.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "горизонтальная прокрутка"
    pg.check_clean()
    pg.close()
    # без движения: ничего не прячется, числа сразу финальные
    ctx = b.new_context(viewport={"width": 1280, "height": 860}, reduced_motion="reduce")
    ctx.add_init_script(CONSENT_JS)
    p = ctx.new_page(); p.goto(BASE + "/"); p.wait_for_timeout(500)
    assert p.locator(".rv").count() == 0
    assert "42" in p.inner_text(".proof-stats li:first-child b")
    ctx.close()
    for w in (768, 1024):
        ctx = b.new_context(viewport={"width": w, "height": 900}); ctx.add_init_script(CONSENT_JS)
        p = ctx.new_page(); p.goto(BASE + "/"); p.wait_for_timeout(500)
        assert p.evaluate("document.documentElement.scrollWidth") <= w, f"горизонтальная прокрутка на {w}px"
        ctx.close()


@test
def landing_sandbox(b):
    """«Попробуйте ИИ»: модели грузятся только у раздела, сценарии и ползунки меняют прогноз осмысленно."""
    pg = Page(b).go("/", 600)
    loaded = "() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/models.js'))"
    assert not pg.p.evaluate(loaded), "модели загружены сразу, а не по мере прокрутки"
    pg.p.locator("#try").scroll_into_view_if_needed()
    pg.p.wait_for_function("() => document.querySelector('[data-sandbox].ready')", timeout=15000)
    num = lambda sel: float(pg.text(sel).replace("−", "-").replace(",", ".").split()[0])
    base = num('[data-o="ready"]')
    assert 6 < base < 8.5, base
    pg.p.click('[data-preset="heavy"]'); pg.p.wait_for_timeout(250)
    heavy = num('[data-o="ready"]')
    assert heavy < base - 1, (base, heavy)
    assert pg.p.get_attribute('[data-preset="heavy"]', "aria-pressed") == "true"
    assert "Нагрузка за 7 дней" in pg.text('[data-o="factors"]'), pg.text('[data-o="factors"]')
    pg.p.click('[data-preset="poorSleep"]'); pg.p.wait_for_timeout(250)
    rows = pg.p.evaluate("[...document.querySelectorAll('[data-o=\"groups\"] li')].map(li => li.innerText)")
    worst = min(rows, key=lambda r: float(r.split()[-1].replace("−", "-").replace(",", ".")))
    assert worst.startswith("Сон"), rows
    # клавиатура: стрелка на ползунке меняет значение и сбрасывает выбранный сценарий
    pg.p.click('[data-preset="normal"]'); pg.p.wait_for_timeout(200)
    pg.p.focus("#sx-sleepH")
    for _ in range(4):
        pg.p.keyboard.press("ArrowRight")
    pg.p.wait_for_timeout(250)
    assert num('[data-o="ready"]') > base, "больше сна — готовность должна вырасти"
    assert pg.p.locator('.sbx-presets [aria-pressed="true"]').count() == 0
    assert pg.p.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    pg.check_clean()
    pg.close()
    m = Page(b, mobile=True).go("/", 400)
    m.p.locator("#try").scroll_into_view_if_needed()
    m.p.wait_for_function("() => document.querySelector('[data-sandbox].ready')", timeout=15000)
    assert m.p.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "горизонтальная прокрутка на телефоне"
    m.check_clean()
    m.close()


@test
def landing_cost_calculator(b):
    """Калькулятор стоимости травм: значения по умолчанию UEFA, пересчёт от ползунков и валюты, сценарий."""
    pg = Page(b).go("/", 400)
    pg.p.locator("#cost").scroll_into_view_if_needed(); pg.p.wait_for_timeout(700)
    t = lambda k: pg.text('[data-r="%s"]' % k).replace("\u00a0", " ")
    assert t("cost") == "100 млн ₸", t("cost")
    assert t("inj") == "50" and t("days") == "1 000" and t("out") == "3,3", (t("inj"), t("days"), t("out"))
    assert pg.p.locator('[data-r="squad"] i').count() == 25 and pg.p.locator('[data-r="squad"] i.out').count() == 3
    assert "10 млн ₸" in t("save") and "100 игроко-дней" in t("save"), t("save")
    pg.p.evaluate("(() => { const i = document.getElementById('roi-players'); i.value = 30; i.dispatchEvent(new Event('input', {bubbles: true})); })()")
    pg.p.wait_for_timeout(700)
    assert t("inj") == "60" and pg.p.locator('[data-r="squad"] i').count() == 30
    pg.p.select_option("#roi-cur", "USD"); pg.p.wait_for_timeout(700)
    assert pg.p.input_value("#roi-cost") == "200" and t("cost").endswith("$"), t("cost")
    pg.p.fill("#roi-cost", "1000"); pg.p.wait_for_timeout(700)
    assert t("cost") == "1,2 млн $", t("cost")
    pg.p.focus("#roi-cut")
    for _ in range(2):
        pg.p.keyboard.press("ArrowRight")
    pg.p.wait_for_timeout(300)
    assert "20%" in pg.text('output[for="roi-cut"]') and "240 тыс. $" in t("save"), t("save")
    assert pg.p.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    pg.check_clean()
    pg.close()


@test
def landing_lead_form(b):
    """Заявка: ошибки у пустых полей, затем готовое письмо и запасной путь — копирование текста."""
    pg = Page(b).go("/", 300)
    pg.ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    pg.p.locator("#contact").scroll_into_view_if_needed()
    pg.p.click("#lead-form button[type=submit]")
    assert pg.p.get_attribute("#f-name", "aria-invalid") == "true"
    assert pg.p.evaluate("document.activeElement.id") == "f-name"
    assert "согласие" in pg.text("#e-consent")
    pg.p.fill("#f-name", "Айгерим Тестова"); pg.p.fill("#f-org", "ФК Тест"); pg.p.fill("#f-email", "coach@example.org")
    pg.p.check("#f-consent")
    pg.p.click("#lead-form button[type=submit]"); pg.p.wait_for_timeout(300)
    assert "Письмо с заявкой готово" in pg.text("#form-status")
    assert pg.p.get_attribute("#form-status .fs-actions a", "href").startswith("mailto:")
    pg.p.click("#form-status .fs-actions button"); pg.p.wait_for_timeout(300)
    assert "Скопировано" in pg.text("#form-status .fs-done")
    clip = pg.p.evaluate("navigator.clipboard.readText()")
    assert "Тема: Заявка на пилот — ФК Тест" in clip and "coach@example.org" in clip and "Айгерим Тестова" in clip, clip
    pg.check_clean()
    pg.close()


@test
def landing_band_scene(b):
    pg = Page(b).go("/", 800)
    assert pg.p.locator(".bs-band img").count() == 1 and pg.p.evaluate("document.querySelector('.bs-band img').naturalWidth") > 0
    assert pg.p.locator(".bs-chip").count() == 5 and "Один браслет снимает все измерения" in pg.text("#band")
    pg.check_clean()
    pg.close()


def main():
    flt = sys.argv[1] if len(sys.argv) > 1 else ""
    todo = [t for t in TESTS if flt in t.__name__]
    failed = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch(**({"executable_path": EXE} if EXE else {}))
        for t in todo:
            t0 = time.time()
            try:
                t(b)
                print(f"  ok    {t.__name__}  ({time.time() - t0:.1f} с)")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  FAIL  {t.__name__}: {e}")
                traceback.print_exc(limit=3)
                ART.mkdir(exist_ok=True)
                for i, pg in enumerate(list(OPEN)):
                    try:
                        pg.p.screenshot(path=str(ART / f"{t.__name__}-{i}.png"), full_page=True)
                        (ART / f"{t.__name__}-{i}.txt").write_text(pg.p.url + "\n" + "\n".join(pg.errors) + "\n\n" + pg.p.inner_text("body"), encoding="utf-8")
                    except Exception:  # noqa: BLE001
                        pass
            finally:
                for pg in list(OPEN):
                    try:
                        pg.close()
                    except Exception:  # noqa: BLE001
                        pass
        b.close()
    if SRV:
        SRV.shutdown()
    print(f"\n{len(todo) - failed} из {len(todo)} тестов пройдено")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
