import Foundation

// Mirror of the JSON that S&S Desk writes into the App Group container
// (see lib/widget-bridge.js). Decoding is tolerant: a missing/garbage file
// yields nil and the widget falls back to `.placeholder`.
struct ClientSlice: Codable, Hashable {
    let n: String
    let ms: Double
    let live: Bool
}

// Week-to-date worked vs management-allocated hours, per client (or client·project).
struct BudgetItem: Codable, Hashable {
    let n: String       // client (or "client · project") name
    let alloc: Double   // hours allocated by management
    let worked: Double  // hours worked, week-to-date
    let status: String  // "over" | "at" | "behind" | "ok"

    var ratio: Double { alloc > 0 ? worked / alloc : (worked > 0 ? 1 : 0) }
    var pct: Int { Int((ratio * 100).rounded()) }
}

struct WidgetState: Codable {
    let status: String            // "out" | "in" | "break"
    let workedMsToday: Double
    let sessionMs: Double
    let sessionRefMs: Double?     // epoch ms anchor for a live session .timer
    let todayRefMs: Double?       // epoch ms anchor for a live day-total .timer
    let client: String
    let project: String?
    let note: String?
    let clients: [ClientSlice]
    let actor: String?
    let pending: Int
    let needsLogin: Bool
    let updatedMs: Double
    let weekStart: String?        // week the budget is measured over (YYYY-MM-DD)
    let budget: [BudgetItem]?     // weekly worked-vs-allocated, per client

    static let appGroup = "29528WCWRA.com.xtremeroi.snsdesk"

    /// Read the snapshot from the shared App Group container.
    static func load() -> WidgetState? {
        guard let dir = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let url = dir.appendingPathComponent("widget-state.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetState.self, from: data)
    }

    var isLive: Bool { status == "in" }
    var isStale: Bool { pending > 0 || needsLogin }

    /// Anchor dates for the live count-up displays (nil unless clocked in).
    var sessionStart: Date? { sessionRefMs.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var todayStart: Date? { todayRefMs.map { Date(timeIntervalSince1970: $0 / 1000) } }

    static let placeholder = WidgetState(
        status: "out", workedMsToday: 0, sessionMs: 0,
        sessionRefMs: nil, todayRefMs: nil,
        client: "General", project: nil, note: nil,
        clients: [], actor: nil, pending: 0, needsLogin: false, updatedMs: 0,
        weekStart: nil, budget: nil
    )

    // A representative filled state for Xcode's widget gallery preview.
    static let sample = WidgetState(
        status: "in", workedMsToday: 3 * 3600_000 + 12 * 60_000, sessionMs: 47 * 60_000,
        sessionRefMs: nil, todayRefMs: nil,
        client: "Cangshan Cutlery", project: "PDP Optimization", note: "A+ content pass",
        clients: [
            ClientSlice(n: "Cangshan Cutlery", ms: 96 * 60_000, live: true),
            ClientSlice(n: "Simpletics", ms: 62 * 60_000, live: false),
            ClientSlice(n: "TNGstore", ms: 34 * 60_000, live: false),
        ],
        actor: "You", pending: 0, needsLogin: false, updatedMs: 0,
        weekStart: "2026-07-12",
        budget: [
            BudgetItem(n: "Cangshan Cutlery", alloc: 10, worked: 6.2, status: "behind"),
            BudgetItem(n: "Simpletics", alloc: 8, worked: 8.1, status: "over"),
            BudgetItem(n: "Destination Decal", alloc: 6, worked: 3.0, status: "behind"),
            BudgetItem(n: "TNGstore", alloc: 4, worked: 4.0, status: "at"),
        ]
    )
}
