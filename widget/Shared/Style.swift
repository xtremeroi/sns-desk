import SwiftUI

// S&S dark-navy palette, matched to the Desk panel (renderer/popup.html).
enum SNS {
    static let green = Color(red: 0.204, green: 0.827, blue: 0.600)  // #34d399
    static let amber = Color(red: 0.984, green: 0.749, blue: 0.141)  // #fbbf24
    static let red   = Color(red: 0.973, green: 0.443, blue: 0.443)  // #f87171
    static let accent = Color(red: 0.376, green: 0.647, blue: 0.980) // #60a5fa
    static let dim   = Color(red: 0.604, green: 0.631, blue: 0.690)  // #9aa1b0
    static let text  = Color(red: 0.910, green: 0.918, blue: 0.941)  // #e8eaf0
    static let bgTop = Color(red: 0.039, green: 0.063, blue: 0.125)  // #0a1020
    static let bgBot = Color(red: 0.063, green: 0.102, blue: 0.180)  // #101a2e

    static let background = LinearGradient(
        colors: [bgTop, bgBot],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    static func statusColor(_ status: String) -> Color {
        switch status {
        case "in": return green
        case "break": return amber
        default: return dim
        }
    }
    static func statusLabel(_ status: String) -> String {
        switch status {
        case "in": return "Clocked in"
        case "break": return "On break"
        default: return "Clocked out"
        }
    }

    // Logo-stub tint: mirrors the menu-bar state light exactly (out = red),
    // which differs from statusColor (out = dim) used for the ticker/dot.
    static func markStub(_ status: String) -> Color {
        switch status {
        case "in": return green
        case "break": return amber
        default: return red
        }
    }
}

// Native-widget-style backing: a low-contrast vertical navy gradient (lighter at
// the top, deepening toward the bottom) with a faint domed highlight up top, the
// way macOS renders its stock Calendar/Stocks/Weather tiles.
struct SNSBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                stops: [
                    .init(color: Color(red: 0.098, green: 0.149, blue: 0.255), location: 0.0),
                    .init(color: Color(red: 0.055, green: 0.086, blue: 0.157), location: 0.5),
                    .init(color: Color(red: 0.031, green: 0.051, blue: 0.098), location: 1.0),
                ],
                startPoint: .top, endPoint: .bottom
            )
            RadialGradient(
                colors: [Color.white.opacity(0.07), Color.white.opacity(0.0)],
                center: .init(x: 0.5, y: -0.15), startRadius: 0, endRadius: 260
            )
        }
    }
}

// ms -> "3h 12m" / "47m"
func fmtDur(_ ms: Double) -> String {
    let m = Int((ms / 60_000).rounded())
    if m >= 60 { return "\(m / 60)h \(String(format: "%02d", m % 60))m" }
    return "\(m)m"
}

// ms -> "3:12:07"
func fmtHMS(_ ms: Double) -> String {
    let s = Int(ms / 1000)
    return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
}

// Deep link back into Desk (Desk registers the snsdesk:// scheme — see README).
let snsDeskURL = URL(string: "snsdesk://open")!

// The S&S ligature mark: three full WHITE bars (in every state) with the small
// stubs tinted to the current clock state — the same green/amber/red signal the
// menu-bar icon uses. Same geometry as the Desk header logo (90×89 grid).
struct SNSLogoMark: View {
    // Stub tint; defaults to violet for the host app / previews.
    var stub: Color = Color(red: 0.545, green: 0.361, blue: 0.965) // #8b5cf6
    private let bar = Color.white.opacity(0.9)
    // (x, y, w, h, isStub) in the 90×89 coordinate space.
    private let bars: [(CGFloat, CGFloat, CGFloat, CGFloat, Bool)] = [
        (0, 0, 90, 13, false),
        (0, 19, 22, 13, true),
        (34, 19, 22, 13, true),
        (0, 38, 90, 13, false),
        (34, 57, 22, 13, true),
        (68, 57, 22, 13, true),
        (0, 76, 90, 13, false),
    ]
    var body: some View {
        GeometryReader { geo in
            let sx = geo.size.width / 90
            let sy = geo.size.height / 89
            ForEach(0..<bars.count, id: \.self) { i in
                let b = bars[i]
                RoundedRectangle(cornerRadius: b.3 * sy / 2)
                    .fill(b.4 ? stub : bar)
                    .frame(width: b.2 * sx, height: b.3 * sy)
                    .position(x: (b.0 + b.2 / 2) * sx, y: (b.1 + b.3 / 2) * sy)
            }
        }
        .aspectRatio(90.0 / 89.0, contentMode: .fit)
    }
}

extension View {
    // S&S watermark, bottom-right (medium tiles). White bars stay white; the
    // stub color carries the clock state, mirroring the menu-bar icon.
    func brandmark(_ show: Bool, stub: Color) -> some View {
        overlay(alignment: .bottomTrailing) {
            if show {
                SNSLogoMark(stub: stub)
                    .frame(width: 14, height: 14)
            }
        }
    }
}
