// Локальное хранилище: ничего не уходит на сервер. Ключ приглашения — в Keychain, остальное — JSON в Application Support.
import Foundation
import Security

final class Store {
    static let shared = Store()

    private let dir: URL
    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        dir = base.appendingPathComponent("AISports", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: JSON-файлы

    private func url(_ name: String) -> URL { dir.appendingPathComponent(name) }

    func load<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(type, from: data)
    }

    func save<T: Encodable>(_ value: T, _ name: String) {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601; enc.outputFormatting = .prettyPrinted
        guard let data = try? enc.encode(value) else { return }
        try? data.write(to: url(name), options: [.atomic, .completeFileProtection])
    }

    func remove(_ name: String) { try? FileManager.default.removeItem(at: url(name)) }

    // MARK: Keychain — ключ персональной ссылки

    private let service = "kz.aisports.app.invite"

    func saveInvite(_ inv: Invite) {
        guard let data = try? JSONEncoder().encode(inv) else { return }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "invite"]
        SecItemDelete(q as CFDictionary)
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    func loadInvite() -> Invite? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "invite",
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(Invite.self, from: data)
    }

    func removeInvite() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "invite"]
        SecItemDelete(q as CFDictionary)
    }
}
