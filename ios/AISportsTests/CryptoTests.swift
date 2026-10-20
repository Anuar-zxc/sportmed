// Совместимость с веб-кабинетом: векторы сгенерированы asp-crypto.js (Node 20, WebCrypto) — см. README.
import XCTest
@testable import AISports

final class CryptoTests: XCTestCase {
    let teamKey = "AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tk"
    let teamId = "team_demo01"
    let athleteId = "ath_07"
    let athleteKey = "6aF1xAHL9rWUBm-wu1JjnLvwgsuVJi34otw7-lqI5AU"
    let blobFromWeb = "LxWqXjItZdbqTftdIK-DEIOHlRi6-jzhlZZKxAwj2yg6oC_vaiVmhUXW6lguNYPDowLcokLpSrflREDmWxzXXif7XDqRcJsMPbO9ckAD6xNSo1E1Zi89Xqy3BMSvCa87B0N_fehaTbuPBR5gyTVehLyEBRyBNcq52oLzKhzMTULtXXTJDlT-mOmoKEPFuTnh1ZPdqsf1f-2LebV9FzhW1xs8lP0Ssr2aXD9z6wCXjy2VB9uvIhu0gur-UUDc0mXTEdVx"
    let inviteFromWeb = "v1.team_demo01.ath_07.6aF1xAHL9rWUBm-wu1JjnLvwgsuVJi34otw7-lqI5AU.0J3Rg9GA0LbQsNC9"

    func testDeriveAthleteKeyMatchesWeb() throws {
        XCTAssertEqual(try ASPCrypto.deriveAthleteKey(teamKey: teamKey, teamId: teamId, athleteId: athleteId), athleteKey)
    }

    func testOpenBlobSealedByWeb() throws {
        let data = try ASPCrypto.open(rawKey: athleteKey, blob: blobFromWeb, aad: ASPCrypto.aad(teamId: teamId, athleteId: athleteId))
        let p = try JSONDecoder().decode(CheckInPayload.self, from: data)
        XCTAssertEqual(p.v, 1); XCTAssertEqual(p.t, teamId); XCTAssertEqual(p.a, athleteId); XCTAssertEqual(p.d, "2026-10-20"); XCTAssertEqual(p.ts, 1760947200000)
        XCTAssertEqual(p.r.readiness, 7); XCTAssertEqual(p.r.fatigue, 2); XCTAssertEqual(p.r.sleeph, 7.5); XCTAssertEqual(p.r.rpe, 6); XCTAssertEqual(p.r.dur, 90); XCTAssertEqual(p.r.note, "тянет бедро")
    }

    func testWrongAadOrKeyFails() {
        XCTAssertThrowsError(try ASPCrypto.open(rawKey: athleteKey, blob: blobFromWeb, aad: ASPCrypto.aad(teamId: teamId, athleteId: "other")))
        XCTAssertThrowsError(try ASPCrypto.open(rawKey: ASPCrypto.randomKey(), blob: blobFromWeb, aad: ASPCrypto.aad(teamId: teamId, athleteId: athleteId)))
        var tampered = Array(blobFromWeb); tampered[20] = tampered[20] == "A" ? "B" : "A"
        let tamperedBlob = String(tampered)
        XCTAssertThrowsError(try ASPCrypto.open(rawKey: athleteKey, blob: tamperedBlob, aad: ASPCrypto.aad(teamId: teamId, athleteId: athleteId)))
    }

    func testSealRoundTripAndFormat() throws {
        let payload = CheckInPayload(t: teamId, a: athleteId, d: "2026-10-21", ts: 1, r: CheckInAnswers(readiness: 9, sleeph: 8))
        let blob = try ASPCrypto.seal(rawKey: athleteKey, plaintext: try payload.encoded(), aad: ASPCrypto.aad(teamId: teamId, athleteId: athleteId))
        XCTAssertNil(blob.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
        let raw = try ASPCrypto.unb64u(blob)
        XCTAssertEqual(raw.count, 12 + (try payload.encoded()).count + 16)
        let back = try JSONDecoder().decode(CheckInPayload.self, from: try ASPCrypto.open(rawKey: athleteKey, blob: blob, aad: ASPCrypto.aad(teamId: teamId, athleteId: athleteId)))
        XCTAssertEqual(back, payload)
        // веб-кабинет находит ответ в тексте тем же регулярным выражением
        let url = "https://sportmed-eight.vercel.app/app#ci=\(teamId).\(athleteId).\(blob)"
        let ref = try XCTUnwrap(ASPCrypto.parseReply("Чек-ин · 2026-10-21\n" + url))
        XCTAssertEqual(ref.blob, blob)
    }

    func testInviteParseAndBuild() throws {
        let inv = try XCTUnwrap(ASPCrypto.parseInvite("https://sportmed-eight.vercel.app/checkin#" + inviteFromWeb))
        XCTAssertEqual(inv.teamId, teamId); XCTAssertEqual(inv.athleteId, athleteId); XCTAssertEqual(inv.key, athleteKey); XCTAssertEqual(inv.name, "Нуржан")
        XCTAssertEqual(inv.hash, inviteFromWeb)
        XCTAssertNil(ASPCrypto.parseInvite("https://example.com/#v2.a.b.c"))
        XCTAssertNil(ASPCrypto.parseInvite("v1.t.a.shortkey"))
    }

    func testParseRepliesInConversation() {
        let text = "первый app#ci=\(teamId).\(athleteId).\(blobFromWeb) и второй https://x/app#ci=team_demo01.ath_08.\(blobFromWeb)"
        let r = ASPCrypto.parseReplies(text)
        XCTAssertEqual(r.count, 2); XCTAssertEqual(r[1].athleteId, "ath_08")
    }

    func testHeartRateParsing() {
        // флаги: 16-битный пульс + RR; HR = 62; RR = 1024 (1000 мс), 992 (968,75 мс)
        let d = Data([0x11, 62, 0, 0x00, 0x04, 0xE0, 0x03])
        let m = BandManager.parseHeartRate(d)
        XCTAssertEqual(m?.hr, 62)
        XCTAssertEqual(m?.rr.count, 2)
        XCTAssertEqual(m?.rr[0] ?? 0, 1000, accuracy: 0.01)
        XCTAssertEqual(m?.rr[1] ?? 0, 968.75, accuracy: 0.01)
        XCTAssertEqual(BandManager.parseHeartRate(Data([0x00, 71]))?.hr, 71)
    }

    func testIsoDay() {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "Asia/Almaty")!
        let now = cal.date(from: DateComponents(year: 2026, month: 3, day: 1, hour: 7))!
        XCTAssertEqual(CheckInPayload.isoDay(offset: 0, now: now, calendar: cal), "2026-03-01")
        XCTAssertEqual(CheckInPayload.isoDay(offset: 1, now: now, calendar: cal), "2026-02-28")
    }
}
