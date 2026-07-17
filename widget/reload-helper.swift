// Tiny helper bundled at S&S Desk.app/Contents/MacOS/sns-widget-reload.
// Desk spawns it on every meaningful clock change to reload the widgets NOW,
// since an Electron app can't call WidgetCenter itself. Run from inside the
// app bundle, Bundle.main resolves to Desk, so this targets Desk's widgets.
import WidgetKit
import Foundation

if #available(macOS 11.0, *) {
    WidgetCenter.shared.reloadAllTimelines()
}
// Let the reload request dispatch to the widget daemon before we exit —
// exiting too fast can drop the XPC message on the floor.
Thread.sleep(forTimeInterval: 1.0)
