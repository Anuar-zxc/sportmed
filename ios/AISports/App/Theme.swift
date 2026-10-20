// Палитра и типографика — те же токены, что на сайте: молочно-белый фон, персиково-жёлтый акцент, системный SF Pro.
import SwiftUI

enum Theme {
    static let bg = Color(light: 0xFBF8F3, dark: 0x12100D)
    static let panel = Color(light: 0xFFFFFF, dark: 0x1B1814)
    static let panel2 = Color(light: 0xF8F4ED, dark: 0x24201B)
    static let text = Color(light: 0x1D1B17, dark: 0xF6F1E9)
    static let text2 = Color(light: 0x45403A, dark: 0xD9D1C4)
    static let muted = Color(light: 0x675C50, dark: 0xA89E8F)
    static let line = Color(light: 0xE9E1D4, dark: 0x332D26)
    static let accent = Color(light: 0xA84C15, dark: 0xFFB27A)      // текст и иконки
    static let peach = Color(hex: 0xFFB36E)
    static let sun = Color(hex: 0xFFD56E)
    static let flame = Color(hex: 0xFF9867)
    static let mint = Color(light: 0x1B7A58, dark: 0x5ED3A8)
    static let red = Color(light: 0xC0392B, dark: 0xFF7B6B)
    static let amber = Color(light: 0x9A5D07, dark: 0xF5C451)
    static let espresso = Color(hex: 0x24170D)

    static let gradient = LinearGradient(colors: [sun, flame], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let radius: CGFloat = 18
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
    /// Цвет, зависящий от темы системы.
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { tc in
            let h = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255, blue: CGFloat(h & 0xFF) / 255, alpha: 1)
        })
    }
}

// MARK: - Общие компоненты

struct Card<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var dark = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(dark ? Color.white : Theme.espresso)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background {
                if dark { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.espresso) }
                else { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.gradient) }
            }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Кольцо показателя (270°), как в кабинете.
struct Ring: View {
    var value: Double?          // 0…1
    var label: String
    var text: String
    var color: Color = Theme.flame
    var size: CGFloat = 120

    var body: some View {
        ZStack {
            Circle().trim(from: 0, to: 0.75).stroke(Theme.line, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round)).rotationEffect(.degrees(135))
            Circle().trim(from: 0, to: 0.75 * min(1, max(0, value ?? 0)))
                .stroke(AngularGradient(colors: [Theme.sun, color], center: .center, startAngle: .degrees(135), endAngle: .degrees(405)), style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
                .rotationEffect(.degrees(135))
                .animation(.spring(duration: 0.9), value: value)
            VStack(spacing: 2) {
                Text(text).font(.system(size: size * 0.26, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(Theme.text)
                Text(label).font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(text)")
    }
}

/// Шкала 1–5 / 0–10 кнопками, как в веб-чек-ине.
struct ScalePicker: View {
    let title: String
    let range: ClosedRange<Int>
    let low: String
    let high: String
    @Binding var value: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline).foregroundStyle(Theme.text)
            HStack(spacing: 6) {
                ForEach(Array(range), id: \.self) { v in
                    Button { value = v } label: {
                        Text("\(v)")
                            .font(.body.weight(.semibold)).monospacedDigit()
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(value == v ? AnyShapeStyle(Theme.gradient) : AnyShapeStyle(Theme.panel), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(value == v ? Color.clear : Theme.line, lineWidth: 1))
                            .foregroundStyle(value == v ? Theme.espresso : Theme.text)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title): \(v)")
                    .accessibilityAddTraits(value == v ? .isSelected : [])
                }
            }
            HStack { Text(low); Spacer(); Text(high) }.font(.caption).foregroundStyle(Theme.muted)
        }
    }
}
