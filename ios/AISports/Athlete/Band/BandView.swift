import SwiftUI

struct BandView: View {
    @EnvironmentObject var band: BandManager
    @EnvironmentObject var state: AppState

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Card {
                        HStack(spacing: 14) {
                            ZStack {
                                Circle().fill(Theme.peach.opacity(0.25)).frame(width: 52, height: 52)
                                Image(systemName: band.isConnected ? "dot.radiowaves.left.and.right" : "applewatch.slash").font(.title2).foregroundStyle(Theme.accent)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(band.connectedName ?? "Браслет AI Sports").font(.headline)
                                Text(band.status).font(.subheadline).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if let b = band.battery { Label("\(b)%", systemImage: "battery.75percent").font(.caption).foregroundStyle(Theme.muted) }
                        }
                    }

                    if band.isConnected {
                        Card {
                            HStack {
                                Ring(value: band.heartRate.map { Double($0) / 200 }, label: "уд/мин", text: band.heartRate.map(String.init) ?? "—", color: Theme.red, size: 110)
                                Spacer()
                                Ring(value: band.rmssd.map { min(1, $0 / 120) }, label: "HRV, мс", text: band.rmssd.map { "\(Int($0.rounded()))" } ?? "—", color: Theme.mint, size: 110)
                                Spacer()
                                Ring(value: band.restingHR.map { 1 - ($0 - 35) / 70 }, label: "покой", text: band.restingHR.map { "\(Int($0.rounded()))" } ?? "—", color: Theme.flame, size: 110)
                            }
                            Text(band.rrCount < 30 ? "Собираем RR-интервалы для HRV: \(band.rrCount) из 30. Посидите спокойно минуту." : "HRV считается по RMSSD за последние \(band.rrCount) ударов. Пульс покоя — минимум поминутных средних.")
                                .font(.footnote).foregroundStyle(Theme.muted).padding(.top, 10)
                            HStack(spacing: 10) {
                                Button("Сохранить как «прошлую ночь»") { band.saveNight(); state.showToast("Показатели сохранены") }.buttonStyle(PrimaryButtonStyle())
                                Button("Отключить") { band.disconnect() }.buttonStyle(GhostButtonStyle()).frame(maxWidth: 130)
                            }.padding(.top, 10)
                        }
                    } else {
                        Card {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Подключение").font(.headline)
                                Text("Браслет должен быть заряжен и находиться рядом. Поиск идёт по стандартному профилю пульса; если устройство не видно — включите «Показывать все устройства».")
                                    .font(.subheadline).foregroundStyle(Theme.muted)
                                Toggle("Показывать все устройства", isOn: $band.showAll).tint(Theme.flame)
                                Button(band.scanning ? "Ищем…" : "Найти браслет") { band.scanning ? band.stopScan() : band.startScan() }
                                    .buttonStyle(PrimaryButtonStyle()).disabled(!band.bluetoothOn)
                            }
                        }
                        if !band.devices.isEmpty {
                            Card(padding: 8) {
                                VStack(spacing: 0) {
                                    ForEach(band.devices) { d in
                                        Button { band.connect(d) } label: {
                                            HStack {
                                                Image(systemName: d.standardHR ? "heart.circle.fill" : "circle.dotted").foregroundStyle(d.standardHR ? Theme.red : Theme.muted)
                                                VStack(alignment: .leading, spacing: 1) {
                                                    Text(d.name).font(.body.weight(.medium)).foregroundStyle(Theme.text)
                                                    Text(d.standardHR ? "профиль пульса · \(d.rssi) дБм" : "сигнал \(d.rssi) дБм").font(.caption).foregroundStyle(Theme.muted)
                                                }
                                                Spacer()
                                                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                                            }
                                            .padding(12)
                                        }
                                        .buttonStyle(.plain)
                                        if d.id != band.devices.last?.id { Divider() }
                                    }
                                }
                            }
                        }
                    }

                    Card {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Что измеряет браслет", systemImage: "waveform.path.ecg").font(.headline)
                            Text("Пульс и HRV — уже сейчас по Bluetooth. SpO₂, температура кожи и стадии сна появятся после подключения фирменного SDK производителя (V500 / E600).")
                                .font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationTitle("Браслет")
        }
    }
}
