// Модели данных приложения. Формат ответа чек-ина совпадает с веб-версией (checkin.js):
// { v:1, t:teamId, a:athleteId, d:"YYYY-MM-DD", ts:<мс>, r:{ readiness, fatigue?, soreness?, sleepq?, stress?, mood?, sleeph?, rpe?, dur?, note? } }
import Foundation

struct CheckInAnswers: Codable, Equatable {
    var readiness: Int
    var fatigue: Int?
    var soreness: Int?
    var sleepq: Int?
    var stress: Int?
    var mood: Int?
    var sleeph: Double?
    var rpe: Double?
    var dur: Double?
    var note: String?
}

struct CheckInPayload: Codable, Equatable {
    var v: Int = 1
    var t: String
    var a: String
    var d: String
    var ts: Int64
    var r: CheckInAnswers

    static func isoDay(offset: Int, now: Date = Date(), calendar: Calendar = .current) -> String {
        let day = calendar.date(byAdding: .day, value: -offset, to: now) ?? now
        let c = calendar.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    func encoded() throws -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.withoutEscapingSlashes]
        return try enc.encode(self)
    }
}

/// Отправленный чек-ин — хранится на телефоне спортсмена для истории.
struct SentCheckIn: Codable, Identifiable, Equatable {
    var id: String
    var day: String
    var sentAt: Date
    var answers: CheckInAnswers
    var replyURL: String
}

/// Ночные показатели — с браслета (BLE) или из Apple Health.
struct NightMetrics: Codable, Equatable {
    var date: Date
    var restingHR: Double?
    var hrvRMSSD: Double?
    var hrvSDNN: Double?
    var spo2: Double?
    var sleepHours: Double?
    var skinTemp: Double?
    var source: String

    var isEmpty: Bool { restingHR == nil && hrvRMSSD == nil && hrvSDNN == nil && spo2 == nil && sleepHours == nil && skinTemp == nil }
}

enum AppRole: String, Codable, CaseIterable, Identifiable {
    case athlete, specialist
    var id: String { rawValue }
    var title: String { self == .athlete ? "Спортсмен" : "Специалист" }
    var subtitle: String { self == .athlete ? "Утренний чек-ин и браслет" : "Кабинет врача, тренера, психолога" }
}
