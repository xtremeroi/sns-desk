import WidgetKit
import SwiftUI

// MARK: - Timeline

struct SNSEntry: TimelineEntry {
    let date: Date
    let state: WidgetState
}

struct SNSProvider: TimelineProvider {
    func placeholder(in context: Context) -> SNSEntry {
        SNSEntry(date: Date(), state: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (SNSEntry) -> Void) {
        let state = context.isPreview ? .sample : (WidgetState.load() ?? .placeholder)
        completion(SNSEntry(date: Date(), state: state))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SNSEntry>) -> Void) {
        let state = WidgetState.load() ?? .placeholder
        let entry = SNSEntry(date: Date(), state: state)
        // The live session/day counters tick on-screen via .timer with no wake.
        // We still re-read the snapshot every few minutes so client names,
        // per-client totals, and clock state stay fresh.
        let next = Date().addingTimeInterval(5 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Bundle

@main
struct SNSDeskWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        SessionWidget()
        ClientsWidget()
        WeeklyProgressWidget()
    }
}

// MARK: - Widgets

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SNSTodayWidget", provider: SNSProvider()) { entry in
            TodayView(state: entry.state)
                .widgetURL(snsDeskURL)
                .containerBackground(for: .widget) { SNSBackground() }
        }
        .configurationDisplayName("Today")
        .description("Time worked today and your clock status.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SessionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SNSSessionWidget", provider: SNSProvider()) { entry in
            SessionView(state: entry.state)
                .widgetURL(snsDeskURL)
                .containerBackground(for: .widget) { SNSBackground() }
        }
        .configurationDisplayName("Current Session")
        .description("What you're working on right now, counting up live.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct ClientsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SNSClientsWidget", provider: SNSProvider()) { entry in
            ClientsView(state: entry.state)
                .widgetURL(snsDeskURL)
                .containerBackground(for: .widget) { SNSBackground() }
        }
        .configurationDisplayName("Today by Client")
        .description("Today's time split across clients — the billing view.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct WeeklyProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SNSWeeklyProgressWidget", provider: SNSProvider()) { entry in
            WeeklyProgressView(state: entry.state)
                .widgetURL(snsDeskURL)
                .containerBackground(for: .widget) { SNSBackground() }
        }
        .configurationDisplayName("Weekly Progress")
        .description("Hours worked vs. what management allocated, this week per client.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
