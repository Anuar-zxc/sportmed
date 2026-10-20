import SwiftUI

struct AthleteTabs: View {
    @EnvironmentObject var state: AppState
    @StateObject private var band = BandManager()
    @StateObject private var health = HealthProvider()

    var body: some View {
        TabView {
            TodayView().tabItem { Label("Сегодня", systemImage: "sun.max") }
            CheckInView().tabItem { Label("Чек-ин", systemImage: "checklist") }
            BandView().tabItem { Label("Браслет", systemImage: "applewatch.radiowaves.left.and.right") }
            HistoryView().tabItem { Label("История", systemImage: "clock.arrow.circlepath") }
        }
        .environmentObject(band)
        .environmentObject(health)
        .onAppear { band.onNight = { [weak state] n in state?.update(night: n) } }
    }
}

// MARK: - Сегодня

struct TodayView: View {
    @EnvironmentObject var state: AppState
    @EnvironmentObject var band: BandManager
    @EnvironmentObject var health: HealthProvider
    @State private var showInvite = false
    @State private var goCheckIn = false

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let g = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер"
        if let n = state.invite?.name, !n.isEmpty { return "\(g), \(n)" }
        return g
    }
    private var todaySent: Bool { state.history.first?.day == CheckInPayload.isoDay(offset: 0) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(greeting).font(.system(size: 30, weight: .semibold)).tracking(-0.4).foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if state.invite == nil {
                        Card {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Нет ссылки от специалиста", systemImage: "link.badge.plus").font(.headline)
                                Text("Попросите врача или тренера прислать персональную ссылку на чек-ин, либо отсканируйте QR-код из кабинета.")
                                    .font(.subheadline).foregroundStyle(Theme.muted)
                                Button("Добавить ссылку") { showInvite = true }.buttonStyle(PrimaryButtonStyle())
                            }
                        }
                    } else {
                        Card {
                            HStack(spacing: 14) {
                                Image(systemName: todaySent ? "checkmark.circle.fill" : "sun.horizon.fill")
                                    .font(.title).foregroundStyle(todaySent ? Theme.mint : Theme.flame)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(todaySent ? "Чек-ин за сегодня отправлен" : "Утренний чек-ин").font(.headline)
                                    Text(todaySent ? "Специалист увидит ответ, когда откроет ссылку." : "Минута — и штаб знает, как вы себя чувствуете.")
                                        .font(.subheadline).foregroundStyle(Theme.muted)
                                }
                            }
                            if !todaySent {
                                NavigationLink { CheckInView() } label: { Text("Заполнить чек-ин") }.buttonStyle(PrimaryButtonStyle()).padding(.top, 12)
                            }
                        }
                    }

                    NightCard(night: state.night, bandConnected: band.isConnected)

                    if health.isAvailable {
                        Card {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Apple Health", systemImage: "heart.text.square").font(.headline)
                                Text(health.authorized ? "Ночные показатели с Apple Watch подтягиваются автоматически." : "Если вы носите Apple Watch, разрешите чтение HRV, пульса, сна и SpO₂.")
                                    .font(.subheadline).foregroundStyle(Theme.muted)
                                Button(health.authorized ? "Обновить" : "Разрешить доступ") {
                                    Task { if let n = await health.fetchLastNight() { state.update(night: n); state.showToast("Данные Apple Health обновлены") } }
                                }.buttonStyle(GhostButtonStyle())
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationTitle("Сегодня")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Сменить ссылку") { showInvite = true }
                        Button("Сменить роль") { state.role = nil }
                        if state.invite != nil { Button("Забыть ссылку на этом телефоне", role: .destructive) { state.forgetInvite() } }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .sheet(isPresented: $showInvite) { InviteView(onDone: {}) }
        }
    }
}

struct NightCard: View {
    var night: NightMetrics?
    var bandConnected: Bool

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("Прошлая ночь", systemImage: "moon.zzz").font(.headline)
                    Spacer()
                    HStack(spacing: 6) {
                        Circle().fill(bandConnected ? Theme.mint : Theme.muted.opacity(0.5)).frame(width: 8, height: 8)
                        Text(bandConnected ? "браслет на связи" : "браслет не подключён").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                if let n = night, !n.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        Metric(title: "Пульс покоя", value: n.restingHR.map { "\(Int($0.rounded()))" }, unit: "уд/мин")
                        Metric(title: "HRV", value: (n.hrvRMSSD ?? n.hrvSDNN).map { "\(Int($0.rounded()))" }, unit: n.hrvRMSSD != nil ? "мс · RMSSD" : "мс · SDNN")
                        Metric(title: "SpO₂", value: n.spo2.map { "\(Int($0.rounded()))" }, unit: "%")
                        Metric(title: "Сон", value: n.sleepHours.map { String(format: "%.1f", $0).replacingOccurrences(of: ".", with: ",") }, unit: "ч")
                        Metric(title: "Температура", value: n.skinTemp.map { String(format: "%.1f", $0).replacingOccurrences(of: ".", with: ",") }, unit: "°C")
                        Metric(title: "Источник", value: n.source, unit: n.date.formatted(date: .numeric, time: .omitted))
                    }
                } else {
                    Text("Пока нет данных. Подключите браслет во вкладке «Браслет» или разрешите Apple Health — показатели появятся здесь.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    struct Metric: View {
        let title: String; let value: String?; let unit: String
        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(Theme.muted)
                Text(value ?? "—").font(.title3.weight(.semibold)).monospacedDigit().foregroundStyle(Theme.text)
                Text(unit).font(.caption2).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - История

struct HistoryView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        NavigationStack {
            Group {
                if state.history.isEmpty {
                    ContentUnavailableView("Пока нет чек-инов", systemImage: "clock.arrow.circlepath", description: Text("Отправленные чек-ины появятся здесь — с возможностью переслать ссылку ещё раз."))
                } else {
                    List {
                        ForEach(state.history) { h in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(h.day).font(.headline).monospacedDigit()
                                    Spacer()
                                    Text(h.sentAt.formatted(date: .omitted, time: .shortened)).font(.caption).foregroundStyle(Theme.muted)
                                }
                                HStack(spacing: 10) {
                                    Tag("Готовность \(h.answers.readiness)/10")
                                    if let f = h.answers.fatigue { Tag("Усталость \(f)") }
                                    if let s = h.answers.sleeph { Tag("Сон \(String(format: "%.1f", s).replacingOccurrences(of: ".", with: ",")) ч") }
                                }
                                if let u = URL(string: h.replyURL) {
                                    ShareLink(item: u, subject: Text("Чек-ин · \(h.day)")) { Label("Переслать ссылку-ответ", systemImage: "square.and.arrow.up").font(.subheadline) }
                                        .padding(.top, 2)
                                }
                            }
                            .padding(.vertical, 4)
                            .listRowBackground(Theme.panel)
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Theme.bg)
            .navigationTitle("История")
        }
    }

    struct Tag: View {
        let t: String
        init(_ t: String) { self.t = t }
        var body: some View {
            Text(t).font(.caption).padding(.horizontal, 8).padding(.vertical, 4)
                .background(Theme.panel2, in: Capsule()).foregroundStyle(Theme.text2)
        }
    }
}
