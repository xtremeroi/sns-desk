import SwiftUI

// Minimal host. A WidgetKit extension has to ship inside a real app, and macOS
// only surfaces the widgets after that app has been launched at least once.
// This window just tells the user how to add them; all data flows from S&S Desk.
@main
struct SNSDeskWidgetsApp: App {
    var body: some Scene {
        WindowGroup {
            HostView()
        }
        .windowResizability(.contentSize)
    }
}

struct HostView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "square.grid.2x2.fill")
                .font(.system(size: 34)).foregroundStyle(SNS.accent)
            Text("S&S Desk Widgets").font(.title2.bold())
            Text("Widgets are installed. Right-click your desktop, choose **Edit Widgets**, and add **S&S Desk**.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 320)
            Text("Live data comes from S&S Desk while it's running.")
                .font(.caption).foregroundStyle(.tertiary)
        }
        .padding(30)
        .frame(width: 380)
    }
}
