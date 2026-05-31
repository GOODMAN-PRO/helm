import AppKit

debugLog("[MAIN] Starting Helm Dashboard")

@MainActor
enum HelmAppHolder {
    static let delegate = AppDelegate()
}

let app = NSApplication.shared
debugLog("[MAIN] NSApp acquired")

MainActor.assumeIsolated {
    debugLog("[MAIN] In MainActor block")
    // Must be set BEFORE app.run() for a menubar-only SwiftPM binary
    // (no Info.plist / LSUIElement). Setting it from
    // applicationDidFinishLaunching is too late — the process has already
    // registered as .regular and the status item silently fails to attach.
    app.setActivationPolicy(.accessory)
    debugLog("[MAIN] setActivationPolicy called")
    app.delegate = HelmAppHolder.delegate
    debugLog("[MAIN] delegate set")
    app.activate(ignoringOtherApps: true)
    debugLog("[MAIN] app activated")
}

debugLog("[MAIN] About to call app.run()")
app.run()
debugLog("[MAIN] app.run() returned")
