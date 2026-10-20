// Связь с браслетом по Bluetooth LE. Работает со стандартными профилями Heart Rate (0x180D) и Battery (0x180F):
// пульс, RR-интервалы → HRV (RMSSD), заряд. Фирменный SDK производителя (Goodwaytechs V500/E600 — SpO₂, температура, сон)
// подключается через тот же протокол BandProvider, когда будет получен.
import Foundation
import CoreBluetooth
import Combine

protocol BandProvider: AnyObject {
    var isConnected: Bool { get }
    func startScan()
    func stopScan()
    func disconnect()
}

struct BandDevice: Identifiable, Equatable {
    let id: UUID
    let name: String
    let rssi: Int
    let standardHR: Bool
}

@MainActor
final class BandManager: NSObject, ObservableObject, BandProvider {
    @Published var bluetoothOn = false
    @Published var scanning = false
    @Published var devices: [BandDevice] = []
    @Published var connectedName: String?
    @Published var heartRate: Int?
    @Published var battery: Int?
    @Published var rmssd: Double?
    @Published var restingHR: Double?
    @Published var rrCount = 0
    @Published var status = "Bluetooth выключен"
    @Published var showAll = false

    var isConnected: Bool { connectedName != nil }
    var onNight: ((NightMetrics) -> Void)?

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var current: CBPeripheral?
    private var rr: [Double] = []              // мс, последние 10 минут
    private var minuteHR: [Double] = []        // средний пульс по минутам
    private var hrWindow: [Int] = []
    private var lastMinute = Date()

    private static let hrService = CBUUID(string: "180D"), hrMeasure = CBUUID(string: "2A37")
    private static let battService = CBUUID(string: "180F"), battLevel = CBUUID(string: "2A19")
    private static let lastDeviceKey = "band.lastDevice"

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: true])
    }

    // MARK: управление

    func startScan() {
        guard bluetoothOn else { return }
        devices = []
        scanning = true
        status = "Ищем браслет…"
        central.scanForPeripherals(withServices: showAll ? nil : [Self.hrService], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        Task { try? await Task.sleep(for: .seconds(20)); if scanning { stopScan() } }
    }

    func stopScan() {
        central.stopScan()
        scanning = false
        if !isConnected { status = devices.isEmpty ? "Браслет не найден. Убедитесь, что он заряжен и рядом." : "Выберите устройство" }
    }

    func connect(_ d: BandDevice) {
        guard let p = peripherals[d.id] else { return }
        stopScan()
        status = "Подключаемся к \(d.name)…"
        current = p
        p.delegate = self
        central.connect(p, options: nil)
    }

    func disconnect() {
        if let p = current { central.cancelPeripheralConnection(p) }
        current = nil
        connectedName = nil
        heartRate = nil
        status = "Отключено"
    }

    /// Снимок за сессию — становится «прошлой ночью» на экране «Сегодня».
    func saveNight() {
        let n = NightMetrics(date: Date(), restingHR: restingHR, hrvRMSSD: rmssd, hrvSDNN: nil, spo2: nil, sleepHours: nil, skinTemp: nil, source: connectedName ?? "Браслет")
        onNight?(n)
    }

    // MARK: расчёты

    private func ingest(hr: Int, rrs: [Double]) {
        heartRate = hr
        hrWindow.append(hr)
        if Date().timeIntervalSince(lastMinute) >= 60, !hrWindow.isEmpty {
            minuteHR.append(Double(hrWindow.reduce(0, +)) / Double(hrWindow.count))
            minuteHR = Array(minuteHR.suffix(480))
            hrWindow = []
            lastMinute = Date()
            restingHR = minuteHR.min()
        }
        // артефакты: RR вне 300–2000 мс и скачки > 20% к соседнему отбрасываем
        for v in rrs where v >= 300 && v <= 2000 {
            if let last = rr.last, abs(v - last) / last > 0.2 { continue }
            rr.append(v)
        }
        rr = Array(rr.suffix(600))
        rrCount = rr.count
        if rr.count >= 30 {
            var sum = 0.0
            for i in 1..<rr.count { let d = rr[i] - rr[i - 1]; sum += d * d }
            rmssd = (sum / Double(rr.count - 1)).squareRoot()
        }
    }

    /// Разбор характеристики Heart Rate Measurement (Bluetooth SIG): флаги, пульс 8/16 бит, RR-интервалы по 1/1024 с.
    nonisolated static func parseHeartRate(_ data: Data) -> (hr: Int, rr: [Double])? {
        let b = [UInt8](data)
        guard b.count >= 2 else { return nil }
        let flags = b[0]
        var i = 1
        var hr = 0
        if flags & 0x01 != 0 { guard b.count >= 3 else { return nil }; hr = Int(b[1]) | Int(b[2]) << 8; i = 3 } else { hr = Int(b[1]); i = 2 }
        if flags & 0x08 != 0 { i += 2 }                       // energy expended
        var rr: [Double] = []
        if flags & 0x10 != 0 {
            while i + 1 < b.count { rr.append(Double(Int(b[i]) | Int(b[i + 1]) << 8) * 1000 / 1024); i += 2 }
        }
        return (hr, rr)
    }
}

extension BandManager: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ c: CBCentralManager) {
        Task { @MainActor in
            bluetoothOn = c.state == .poweredOn
            status = bluetoothOn ? "Готово к поиску" : c.state == .unauthorized ? "Разрешите Bluetooth в Настройках" : "Bluetooth выключен"
        }
    }

    nonisolated func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        let name = p.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        let rssi = RSSI.intValue
        Task { @MainActor in
            guard !name.isEmpty || services.contains(Self.hrService) else { return }
            peripherals[p.identifier] = p
            let d = BandDevice(id: p.identifier, name: name.isEmpty ? "Устройство" : name, rssi: rssi, standardHR: services.contains(Self.hrService))
            if let i = devices.firstIndex(where: { $0.id == d.id }) { devices[i] = d } else { devices.append(d) }
            devices.sort { $0.rssi > $1.rssi }
        }
    }

    nonisolated func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        Task { @MainActor in
            connectedName = p.name ?? "Браслет"
            status = "На связи"
            rr = []; minuteHR = []; hrWindow = []; lastMinute = Date(); rmssd = nil; restingHR = nil; rrCount = 0
            UserDefaults.standard.set(p.identifier.uuidString, forKey: Self.lastDeviceKey)
            p.discoverServices([Self.hrService, Self.battService])
        }
    }

    nonisolated func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        Task { @MainActor in status = "Не удалось подключиться"; current = nil }
    }

    nonisolated func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        Task { @MainActor in
            if rr.count >= 30 || restingHR != nil { saveNight() }
            connectedName = nil; heartRate = nil
            status = error == nil ? "Отключено" : "Связь прервана — браслет далеко или разряжен"
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        for s in p.services ?? [] {
            if s.uuid == Self.hrService { p.discoverCharacteristics([Self.hrMeasure], for: s) }
            if s.uuid == Self.battService { p.discoverCharacteristics([Self.battLevel], for: s) }
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] {
            if ch.uuid == Self.hrMeasure { p.setNotifyValue(true, for: ch) }
            if ch.uuid == Self.battLevel { p.readValue(for: ch); if ch.properties.contains(.notify) { p.setNotifyValue(true, for: ch) } }
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard let data = ch.value else { return }
        if ch.uuid == Self.hrMeasure, let m = Self.parseHeartRate(data) {
            Task { @MainActor in ingest(hr: m.hr, rrs: m.rr) }
        } else if ch.uuid == Self.battLevel, let b = data.first {
            Task { @MainActor in battery = Int(b) }
        }
    }
}
