// Состояние приложения: роль, приглашение спортсмена, история чек-инов, последние ночные показатели.
import Foundation
import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var role: AppRole? { didSet { UserDefaults.standard.set(role?.rawValue, forKey: "role") } }
    @Published var invite: Invite?
    @Published var history: [SentCheckIn] = []
    @Published var night: NightMetrics?
    /// Ссылка-ответ, пришедшая в приложение извне (share, URL-схема) — специалист примет её в кабинете.
    @Published var pendingReplyURL: String?
    @Published var toast: String?

    static let siteBase = URL(string: "https://sportmed-eight.vercel.app")!

    init() {
        role = AppRole(rawValue: UserDefaults.standard.string(forKey: "role") ?? "")
        invite = Store.shared.loadInvite()
        history = Store.shared.load("history.json", as: [SentCheckIn].self) ?? []
        night = Store.shared.load("night.json", as: NightMetrics.self)
    }

    // MARK: приглашение

    func setInvite(_ inv: Invite) {
        invite = inv
        Store.shared.saveInvite(inv)
        if role == nil { role = .athlete }
    }

    func forgetInvite() {
        invite = nil
        Store.shared.removeInvite()
    }

    // MARK: чек-ины

    func record(_ item: SentCheckIn) {
        history.insert(item, at: 0)
        history = Array(history.prefix(60))
        Store.shared.save(history, "history.json")
    }

    func update(night n: NightMetrics) {
        night = n
        Store.shared.save(n, "night.json")
    }

    // MARK: входящие ссылки

    /// Принимает URL любого вида: приглашение спортсмена (…/checkin#v1.…) или ответ для специалиста (…/app#ci=…).
    @discardableResult
    func handle(url: URL) -> Bool { handle(text: url.absoluteString) }

    @discardableResult
    func handle(text: String) -> Bool {
        if let inv = ASPCrypto.parseInvite(text), text.contains("checkin") || text.hasPrefix("v1.") || text.hasPrefix("#v1.") {
            setInvite(inv)
            role = .athlete
            toast = inv.name.isEmpty ? "Ссылка на чек-ин сохранена" : "Ссылка сохранена: \(inv.name)"
            return true
        }
        if !ASPCrypto.parseReplies(text).isEmpty {
            pendingReplyURL = text
            role = .specialist
            return true
        }
        return false
    }

    func showToast(_ s: String) {
        toast = s
        Task { try? await Task.sleep(for: .seconds(2.5)); if toast == s { toast = nil } }
    }
}
