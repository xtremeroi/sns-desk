import WidgetKit
import SwiftUI

// A small status pill: colored dot + "Clocked in / On break / Clocked out".
private struct StatusPill: View {
    let state: WidgetState
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(SNS.statusColor(state.status)).frame(width: 7, height: 7)
            Text(SNS.statusLabel(state.status))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SNS.dim)
            if state.isStale {
                Text("· not synced")
                    .font(.system(size: 10)).foregroundStyle(SNS.amber)
            }
        }
    }
}

// Big monospaced time. Ticks live via .timer when clocked in; otherwise static.
private struct BigTime: View {
    let liveStart: Date?
    let staticMs: Double
    var size: CGFloat = 34
    var color: Color = SNS.text
    var body: some View {
        Group {
            if let start = liveStart {
                Text(start, style: .timer)
            } else {
                Text(fmtHMS(staticMs))
            }
        }
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .foregroundStyle(color)
        .minimumScaleFactor(0.5)
        .lineLimit(1)
    }
}

// MARK: - Today

struct TodayView: View {
    @Environment(\.widgetFamily) private var family
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 8 : 6) {
            StatusPill(state: state)
            Spacer(minLength: 0)
            Text("Worked today")
                .font(.system(size: 11)).foregroundStyle(SNS.dim)
            BigTime(liveStart: state.isLive ? state.todayStart : nil,
                    staticMs: state.workedMsToday,
                    size: family == .systemMedium ? 40 : 30,
                    color: SNS.statusColor(state.status))
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Text(state.client)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SNS.text).lineLimit(1)
                if family == .systemMedium, let p = state.project {
                    Text("/ \(p)").font(.system(size: 12)).foregroundStyle(SNS.dim).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .brandmark(family == .systemMedium, stub: SNS.markStub(state.status))
    }
}

// MARK: - Session

struct SessionView: View {
    @Environment(\.widgetFamily) private var family
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 8 : 6) {
            HStack {
                Text("Current session")
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(SNS.dim)
                Spacer()
                Circle().fill(SNS.statusColor(state.status)).frame(width: 7, height: 7)
            }
            Spacer(minLength: 0)
            if state.status == "out" {
                Text("Clocked out")
                    .font(.system(size: 20, weight: .medium, design: .monospaced))
                    .foregroundStyle(SNS.dim)
            } else {
                BigTime(liveStart: state.isLive ? state.sessionStart : nil,
                        staticMs: state.sessionMs,
                        size: family == .systemMedium ? 38 : 30,
                        color: SNS.statusColor(state.status))
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(state.client)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SNS.text).lineLimit(1)
                    if let p = state.project {
                        Text("/ \(p)").font(.system(size: 12)).foregroundStyle(SNS.dim).lineLimit(1)
                    }
                }
                if family == .systemMedium, let note = state.note, !note.isEmpty {
                    Text(note).font(.system(size: 11)).foregroundStyle(SNS.dim).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .brandmark(family == .systemMedium, stub: SNS.markStub(state.status))
    }
}

// MARK: - Clients

struct ClientsView: View {
    let state: WidgetState

    private var total: Double { state.clients.reduce(0) { $0 + $1.ms } }
    private var maxMs: Double { max(state.clients.map(\.ms).max() ?? 1, 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Today by client")
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(SNS.dim)
                Spacer()
                Text(fmtDur(total))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(SNS.text)
            }
            if state.clients.isEmpty {
                Spacer()
                Text("No time logged yet today")
                    .font(.system(size: 12)).foregroundStyle(SNS.dim)
                Spacer()
            } else {
                VStack(spacing: 4) {
                    ForEach(state.clients.prefix(4), id: \.self) { c in
                        ClientRow(slice: c, maxMs: maxMs)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .brandmark(true, stub: SNS.markStub(state.status))
    }
}

private struct ClientRow: View {
    let slice: ClientSlice
    let maxMs: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(slice.live ? SNS.green.opacity(0.16) : SNS.accent.opacity(0.10))
                    .frame(width: max(10, geo.size.width * CGFloat(slice.ms / maxMs)))
                HStack(spacing: 6) {
                    Text(slice.n)
                        .font(.system(size: 12)).foregroundStyle(SNS.text).lineLimit(1)
                    if slice.live {
                        Circle().fill(SNS.green).frame(width: 5, height: 5)
                    }
                    Spacer()
                    Text(fmtDur(slice.ms))
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(SNS.dim)
                }
                .padding(.horizontal, 8)
            }
        }
        .frame(height: 22)
    }
}

// MARK: - Previews

#Preview("Today", as: .systemSmall) { TodayWidget() } timeline: {
    SNSEntry(date: .now, state: .sample)
    SNSEntry(date: .now, state: .placeholder)
}
#Preview("Session", as: .systemMedium) { SessionWidget() } timeline: {
    SNSEntry(date: .now, state: .sample)
}
#Preview("Clients", as: .systemMedium) { ClientsWidget() } timeline: {
    SNSEntry(date: .now, state: .sample)
}
