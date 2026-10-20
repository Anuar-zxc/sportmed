// AI Sports — шифрование ссылок чек-ина. Байт в байт совместимо с asp-crypto.js на сайте:
// ключ спортсмена = HKDF-SHA256(ключ команды, salt "asp-team:<teamId>", info "asp-checkin-v1:<athleteId>"),
// ответ = AES-256-GCM(iv 12 байт ‖ шифротекст ‖ тег) с AAD "asp-checkin-v1|<teamId>|<athleteId>", base64url без «=».
import Foundation
import CryptoKit

enum ASPCryptoError: Error, LocalizedError {
    case badEncoding, tooShort, badInvite, badReply, sealFailed, openFailed

    var errorDescription: String? {
        switch self {
        case .badEncoding: return "Повреждённая кодировка ссылки"
        case .tooShort: return "Ссылка-ответ слишком короткая"
        case .badInvite: return "Это не ссылка на чек-ин AI Sports"
        case .badReply: return "Это не ссылка-ответ AI Sports"
        case .sealFailed: return "Не удалось зашифровать ответ"
        case .openFailed: return "Не удалось расшифровать ответ: ключ не подходит или ссылка изменена"
        }
    }
}

struct Invite: Equatable, Codable {
    let teamId: String
    let athleteId: String
    let key: String      // base64url, 32 байта
    let name: String

    var hash: String { ASPCrypto.inviteHash(teamId: teamId, athleteId: athleteId, key: key, name: name) }
}

struct ReplyRef: Equatable {
    let teamId: String
    let athleteId: String
    let blob: String
}

enum ASPCrypto {
    // MARK: base64url

    static func b64u(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func unb64u(_ s: String) throws -> Data {
        guard s.range(of: "^[A-Za-z0-9_-]*$", options: .regularExpression) != nil else { throw ASPCryptoError.badEncoding }
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        guard let d = Data(base64Encoded: t) else { throw ASPCryptoError.badEncoding }
        return d
    }

    static func randomKey() -> String { b64u(Data(SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) })) }

    // MARK: ключи

    static func deriveAthleteKey(teamKey: String, teamId: String, athleteId: String) throws -> String {
        let ikm = SymmetricKey(data: try unb64u(teamKey))
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: ikm,
            salt: Data("asp-team:\(teamId)".utf8),
            info: Data("asp-checkin-v1:\(athleteId)".utf8),
            outputByteCount: 32)
        return b64u(derived.withUnsafeBytes { Data($0) })
    }

    static func aad(teamId: String, athleteId: String) -> String { "asp-checkin-v1|\(teamId)|\(athleteId)" }

    // MARK: AES-GCM

    static func seal(rawKey: String, plaintext: Data, aad: String) throws -> String {
        let key = SymmetricKey(data: try unb64u(rawKey))
        guard let box = try? AES.GCM.seal(plaintext, using: key, authenticating: Data(aad.utf8)) else { throw ASPCryptoError.sealFailed }
        var out = Data()
        out.append(contentsOf: box.nonce)     // 12 байт
        out.append(box.ciphertext)
        out.append(box.tag)                   // 16 байт
        return b64u(out)
    }

    static func open(rawKey: String, blob: String, aad: String) throws -> Data {
        let all = try unb64u(blob)
        guard all.count >= 29 else { throw ASPCryptoError.tooShort }
        let key = SymmetricKey(data: try unb64u(rawKey))
        let nonce = try AES.GCM.Nonce(data: all.prefix(12))
        let body = all.dropFirst(12)
        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: body.dropLast(16), tag: body.suffix(16))
        guard let pt = try? AES.GCM.open(box, using: key, authenticating: Data(aad.utf8)) else { throw ASPCryptoError.openFailed }
        return pt
    }

    // MARK: ссылки

    /// Приглашение: `checkin#v1.<teamId>.<athleteId>.<athleteKey>.<имя base64url>`. Принимает полный URL, хэш или голую строку.
    static func parseInvite(_ text: String) -> Invite? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let r = s.range(of: "#") { s = String(s[r.upperBound...]) }
        let p = s.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard p.count >= 4, p[0] == "v1" else { return nil }
        guard p[1].range(of: "^[A-Za-z0-9_-]{4,40}$", options: .regularExpression) != nil,
              p[2].range(of: "^[A-Za-z0-9_-]{2,40}$", options: .regularExpression) != nil,
              p[3].range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { return nil }
        var name = ""
        if p.count > 4, let d = try? unb64u(p[4]), let n = String(data: d, encoding: .utf8) { name = String(n.prefix(60)) }
        return Invite(teamId: p[1], athleteId: p[2], key: p[3], name: name)
    }

    static func inviteHash(teamId: String, athleteId: String, key: String, name: String) -> String {
        "v1.\(teamId).\(athleteId).\(key).\(b64u(Data(String(name.prefix(60)).utf8)))"
    }

    /// Ответы: `app#ci=<teamId>.<athleteId>.<blob>` — любое количество в произвольном тексте.
    static func parseReplies(_ text: String) -> [ReplyRef] {
        let pattern = "ci=([A-Za-z0-9_-]{4,40})\\.([A-Za-z0-9_-]{2,40})\\.([A-Za-z0-9_-]{40,4000})"
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).prefix(500).map { m in
            ReplyRef(teamId: ns.substring(with: m.range(at: 1)), athleteId: ns.substring(with: m.range(at: 2)), blob: ns.substring(with: m.range(at: 3)))
        }
    }

    static func parseReply(_ text: String) -> ReplyRef? { parseReplies(text).first }
}
