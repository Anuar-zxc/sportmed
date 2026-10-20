import SwiftUI

@main
struct AISportsApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .tint(Theme.accent)
                .onOpenURL { url in
                    // aisports://… и https://sportmed-eight.vercel.app/checkin#v1… или /app#ci=…
                    _ = state.handle(url: url)
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                switch state.role {
                case .athlete: AthleteTabs()
                case .specialist: SpecialistView()
                case nil: WelcomeView()
                }
            }
            if let t = state.toast {
                Text(t)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { state.toast = nil }
            }
        }
        .animation(.easeOut(duration: 0.25), value: state.toast)
    }
}

/// Первый экран: кто вы — спортсмен или специалист.
struct WelcomeView: View {
    @EnvironmentObject var state: AppState
    @State private var showInvite = false

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 20)
                HStack(spacing: 12) {
                    BrandMark(size: 44)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("AI Sports").font(.title3.weight(.bold))
                        Text("Precision Medicine").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Text("Цифровой двойник каждого спортсмена.")
                    .font(.system(size: 34, weight: .semibold)).tracking(-0.5)
                    .foregroundStyle(Theme.text)
                Text("Браслет измеряет ночью. Утром решение принимаете вы.")
                    .font(.body).foregroundStyle(Theme.muted)

                VStack(spacing: 12) {
                    ForEach(AppRole.allCases) { role in
                        Button {
                            if role == .athlete && state.invite == nil { showInvite = true } else { state.role = role }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: role == .athlete ? "figure.run" : "stethoscope")
                                    .font(.title2).frame(width: 44, height: 44)
                                    .background(Theme.peach.opacity(0.25), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    .foregroundStyle(Theme.accent)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(role.title).font(.headline).foregroundStyle(Theme.text)
                                    Text(role.subtitle).font(.subheadline).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                            }
                            .padding(16)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                Spacer()
                Text("Данные остаются на этом устройстве и у вашей команды. Платформа не ставит диагнозы — решение принимает специалист.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .padding(24)
        }
        .sheet(isPresented: $showInvite) { InviteView(onDone: { state.role = .athlete }) }
    }
}

struct BrandMark: View {
    var size: CGFloat = 34
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous).fill(Theme.gradient)
            Path { p in
                let s = size / 34
                p.move(to: CGPoint(x: 6 * s, y: 18 * s)); p.addLine(to: CGPoint(x: 11 * s, y: 18 * s)); p.addLine(to: CGPoint(x: 13.5 * s, y: 12 * s))
                p.addLine(to: CGPoint(x: 17.5 * s, y: 23 * s)); p.addLine(to: CGPoint(x: 20.5 * s, y: 15 * s)); p.addLine(to: CGPoint(x: 22 * s, y: 18 * s)); p.addLine(to: CGPoint(x: 28 * s, y: 18 * s))
            }
            .stroke(Theme.espresso, style: StrokeStyle(lineWidth: size * 0.07, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
