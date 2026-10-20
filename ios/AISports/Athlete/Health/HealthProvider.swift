// Apple Health: ночные показатели с Apple Watch (HRV SDNN, пульс покоя, SpO₂, сон, температура запястья).
import Foundation
import HealthKit
import Combine

@MainActor
final class HealthProvider: ObservableObject {
    @Published var authorized = false
    let isAvailable = HKHealthStore.isHealthDataAvailable()
    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [
            HKQuantityType(.heartRateVariabilitySDNN), HKQuantityType(.restingHeartRate),
            HKQuantityType(.oxygenSaturation), HKCategoryType(.sleepAnalysis)
        ]
        if #available(iOS 16.0, *) { s.insert(HKQuantityType(.appleSleepingWristTemperature)) }
        return s
    }

    func requestAccess() async -> Bool {
        guard isAvailable else { return false }
        do { try await store.requestAuthorization(toShare: [], read: readTypes); authorized = true; return true } catch { return false }
    }

    /// Показатели за прошлую ночь (окно 20:00 вчера — 12:00 сегодня).
    func fetchLastNight() async -> NightMetrics? {
        if !authorized, !(await requestAccess()) { return nil }
        let cal = Calendar.current
        let now = Date()
        let startOfToday = cal.startOfDay(for: now)
        let from = cal.date(byAdding: .hour, value: -4, to: startOfToday)!     // 20:00 вчера
        let to = cal.date(byAdding: .hour, value: 12, to: startOfToday)!       // 12:00 сегодня
        let pred = HKQuery.predicateForSamples(withStart: from, end: min(to, now), options: .strictStartDate)

        async let sdnn = average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), pred)
        async let rhr = average(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), pred)
        async let spo2 = average(.oxygenSaturation, unit: .percent(), pred)
        async let sleep = sleepHours(pred)
        var temp: Double? = nil
        if #available(iOS 16.0, *) { temp = await average(.appleSleepingWristTemperature, unit: .degreeCelsius(), pred) }
        let (s, r, o, sl) = await (sdnn, rhr, spo2, sleep)
        let n = NightMetrics(date: now, restingHR: r, hrvRMSSD: nil, hrvSDNN: s, spo2: o.map { $0 * 100 }, sleepHours: sl, skinTemp: temp, source: "Apple Health")
        return n.isEmpty ? nil : n
    }

    private func average(_ id: HKQuantityTypeIdentifier, unit: HKUnit, _ pred: NSPredicate) async -> Double? {
        await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: HKQuantityType(id), quantitySamplePredicate: pred, options: .discreteAverage) { _, stats, _ in
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private func sleepHours(_ pred: NSPredicate) async -> Double? {
        await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: HKCategoryType(.sleepAnalysis), predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                let asleep = (samples as? [HKCategorySample] ?? []).filter { s in
                    HKCategoryValueSleepAnalysis.allAsleepValues.contains(HKCategoryValueSleepAnalysis(rawValue: s.value) ?? .inBed)
                }
                let total = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                cont.resume(returning: total > 0 ? total / 3600 : nil)
            }
            store.execute(q)
        }
    }
}
