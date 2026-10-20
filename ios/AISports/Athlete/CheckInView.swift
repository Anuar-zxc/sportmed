// Утренний чек-ин — те же вопросы и правила, что в веб-версии (checkin.html / checkin.js).
import SwiftUI

struct CheckInView: View {
    @EnvironmentObject var state: AppState
    @State private var dayOffset = 0
    @State private var readiness: Int?
    @State private var fatigue: Int?
    @State private var soreness: Int?
    @State private var sleepq: Int?
    @State private var stress: Int?
    @State private var mood: Int?
    @State private var sleepText = ""
    @State private var rest = false
    @State private var rpeText = ""
    @State private var durText = ""
    @State private var note = ""
    @State private var error: String?
    @State private var sent: SentCheckIn?
    @State private var showInvite = false
    @FocusState private var focus: Field?
    enum Field { case sleep, rpe, dur, note }

    var body: some View {
        NavigationStack {
            Group {
                if state.invite == nil {
                    ContentUnavailableView {
                        Label("Нужна персональная ссылка", systemImage: "link")
                    } description: {
                        Text("Чек-ин шифруется ключом из ссылки, которую выдаёт специалист.")
                    } actions: {
                        Button("Добавить ссылку") { showInvite = true }.buttonStyle(PrimaryButtonStyle()).frame(maxWidth: 260)
                    }
                } else if let s = sent {
                    CheckInDoneView(item: s, name: state.invite?.name ?? "") { sent = nil; reset() }
                } else {
                    form
                }
            }
            .background(Theme.bg)
            .navigationTitle("Чек-ин")
            .sheet(isPresented: $showInvite) { InviteView(onDone: {}) }
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Picker("За какой день", selection: $dayOffset) { Text("Сегодня").tag(0); Text("Вчера").tag(1) }
                    .pickerStyle(.segmented)

                Card {
                    ScalePicker(title: "Насколько вы готовы к тренировке?", range: 0...10, low: "Совсем не готов", high: "Полностью готов", value: $readiness)
                }
                Card {
                    VStack(spacing: 20) {
                        ScalePicker(title: "Усталость", range: 1...5, low: "Нет", high: "Сильная", value: $fatigue)
                        ScalePicker(title: "Мышечная боль", range: 1...5, low: "Нет", high: "Сильная", value: $soreness)
                        ScalePicker(title: "Качество сна", range: 1...5, low: "Плохое", high: "Отличное", value: $sleepq)
                        ScalePicker(title: "Стресс", range: 1...5, low: "Низкий", high: "Высокий", value: $stress)
                        ScalePicker(title: "Настроение", range: 1...5, low: "Плохое", high: "Отличное", value: $mood)
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Сколько часов вы спали?").font(.headline)
                        TextField("например, 7,5", text: $sleepText).keyboardType(.decimalPad).focused($focus, equals: .sleep).textFieldStyle(.roundedBorder)
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Вчерашняя тренировка").font(.headline)
                        Toggle("Был день отдыха", isOn: $rest).tint(Theme.flame)
                        if !rest {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Тяжесть, 0–10").font(.subheadline).foregroundStyle(Theme.muted)
                                    TextField("0–10", text: $rpeText).keyboardType(.decimalPad).focused($focus, equals: .rpe).textFieldStyle(.roundedBorder)
                                }
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Минут").font(.subheadline).foregroundStyle(Theme.muted)
                                    TextField("например, 90", text: $durText).keyboardType(.numberPad).focused($focus, equals: .dur).textFieldStyle(.roundedBorder)
                                }
                            }
                        }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Что важно знать специалисту?").font(.headline)
                        TextField("Например: тянет заднюю поверхность бедра", text: $note, axis: .vertical).lineLimit(2...5).focused($focus, equals: .note).textFieldStyle(.roundedBorder)
                            .onChange(of: note) { _, v in if v.count > 300 { note = String(v.prefix(300)) } }
                    }
                }
                if let e = error {
                    Label(e, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Theme.red)
                }
                Button("Отправить специалисту") { submit() }.buttonStyle(PrimaryButtonStyle())
                Text("Ответ шифруется на телефоне и уходит специалисту ссылкой через мессенджер. Прочитать его можно только ключом вашей команды.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Готово") { focus = nil } } }
    }

    private func number(_ text: String, _ lo: Double, _ hi: Double, _ label: String) throws -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if t.isEmpty { return nil }
        guard let x = Double(t), x >= lo, x <= hi else { throw ValidationError(label: label, lo: lo, hi: hi) }
        return x
    }
    private struct ValidationError: Error { let label: String; let lo: Double; let hi: Double }

    private func submit() {
        error = nil
        guard let inv = state.invite else { return }
        guard let r0 = readiness else { error = "Отметьте готовность к тренировке — это главный вопрос."; return }
        var answers = CheckInAnswers(readiness: r0, fatigue: fatigue, soreness: soreness, sleepq: sleepq, stress: stress, mood: mood)
        do {
            answers.sleeph = try number(sleepText, 0, 16, "Сон")
            if rest {
                answers.rpe = 0; answers.dur = 0
            } else {
                let rpe = try number(rpeText, 0, 10, "Тяжесть"), dur = try number(durText, 0, 600, "Минуты")
                if (rpe == nil) != (dur == nil) { error = "Для вчерашней тренировки укажите и тяжесть, и минуты — или отметьте «Был день отдыха»."; return }
                if let dur { answers.rpe = rpe; answers.dur = dur }
            }
        } catch let v as ValidationError {
            error = "Проверьте поле «\(v.label)»: от \(Int(v.lo)) до \(Int(v.hi))."; return
        } catch { self.error = "Проверьте введённые значения."; return }
        let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { answers.note = String(n.prefix(300)) }

        let day = CheckInPayload.isoDay(offset: dayOffset)
        let payload = CheckInPayload(t: inv.teamId, a: inv.athleteId, d: day, ts: Int64(Date().timeIntervalSince1970 * 1000), r: answers)
        do {
            let blob = try ASPCrypto.seal(rawKey: inv.key, plaintext: try payload.encoded(), aad: ASPCrypto.aad(teamId: inv.teamId, athleteId: inv.athleteId))
            let url = AppState.siteBase.absoluteString + "/app#ci=\(inv.teamId).\(inv.athleteId).\(blob)"
            let item = SentCheckIn(id: UUID().uuidString, day: day, sentAt: Date(), answers: answers, replyURL: url)
            state.record(item)
            sent = item
        } catch {
            self.error = "Не удалось зашифровать ответ. Попробуйте ещё раз."
        }
    }

    private func reset() {
        dayOffset = 0; readiness = nil; fatigue = nil; soreness = nil; sleepq = nil; stress = nil; mood = nil
        sleepText = ""; rest = false; rpeText = ""; durText = ""; note = ""; error = nil
    }
}

struct CheckInDoneView: View {
    let item: SentCheckIn
    let name: String
    let again: () -> Void
    @State private var copied = false

    private var text: String { "Чек-ин" + (name.isEmpty ? "" : " · \(name)") + " · \(item.day)" }
    private var url: URL { URL(string: item.replyURL)! }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "checkmark.seal.fill").font(.system(size: 52)).foregroundStyle(Theme.mint)
                Text("Ответ готов и зашифрован").font(.title2.weight(.semibold)).foregroundStyle(Theme.text)
                Text("Отправьте ссылку специалисту лично — в Telegram, WhatsApp или любым удобным способом. Прочитать её сможет только ваша команда.")
                    .foregroundStyle(Theme.muted)

                ShareLink(item: url, subject: Text(text), message: Text(text)) {
                    Label("Отправить", systemImage: "square.and.arrow.up")
                }.buttonStyle(PrimaryButtonStyle())

                HStack(spacing: 10) {
                    Link(destination: URL(string: "https://t.me/share/url?url=\(url.absoluteString.urlQueryEncoded)&text=\(text.urlQueryEncoded)")!) { Text("Telegram") }.buttonStyle(GhostButtonStyle())
                    Link(destination: URL(string: "https://wa.me/?text=\((text + "\n" + url.absoluteString).urlQueryEncoded)")!) { Text("WhatsApp") }.buttonStyle(GhostButtonStyle())
                }
                Button(copied ? "Скопировано" : "Скопировать ссылку") {
                    UIPasteboard.general.string = url.absoluteString; copied = true
                }.buttonStyle(GhostButtonStyle())

                Button("Заполнить ещё раз") { again() }.font(.subheadline).foregroundStyle(Theme.accent).padding(.top, 6)
            }
            .padding(20)
        }
    }
}

extension String {
    var urlQueryEncoded: String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}
