import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private var fullWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        debugLog("[AppDelegate] applicationDidFinishLaunching called")

        // Create a hidden window — some macOS versions require an app window for NSStatusBar to work
        let hiddenWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1, height: 1), styleMask: [], backing: .buffered, defer: false)
        hiddenWindow.isHidden = true
        hiddenWindow.makeKeyAndOrderFront(nil)
        debugLog("[AppDelegate] hidden window created")

        setupMenubar()
        debugLog("[AppDelegate] setupMenubar complete")
        setupNotifications()
        debugLog("[AppDelegate] setupNotifications complete")
    }

    // MARK: - Menubar

    private func setupMenubar() {
        debugLog("[setupMenubar] Starting")
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        debugLog("[setupMenubar] statusItem created")

        guard let statusItem = statusItem else {
            debugLog("[setupMenubar] FATAL: statusItem is nil")
            return
        }

        debugLog("[setupMenubar] statusItem = \(statusItem), button = \(statusItem.button ?? NSButton())")

        guard let button = statusItem.button else {
            debugLog("[setupMenubar] FATAL: button not available")
            return
        }

        button.action = #selector(togglePopover(_:))
        button.target = self

        debugLog("[setupMenubar] button configured")
        updateMenubarIcon(status: .unknown)
        debugLog("[setupMenubar] icon set")

        // Poll to keep dot colour in sync
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.refreshMenubarStatus() }
        }
        debugLog("[setupMenubar] timer scheduled, setup complete")
    }

    private func updateMenubarIcon(status: ServiceStatus) {
        guard let button = statusItem?.button else {
            debugLog("[updateMenubarIcon] button unavailable")
            return
        }
        debugLog("[updateMenubarIcon] drawing icon for status \(status)")
        let image = drawMenubarIcon(status: status)
        image.isTemplate = false
        button.image = image
        debugLog("[updateMenubarIcon] image set, size = \(image.size)")
    }

    private func drawMenubarIcon(status: ServiceStatus) -> NSImage {
        let size = NSSize(width: 22, height: 18)
        let image = NSImage(size: size)
        image.lockFocus()
        defer { image.unlockFocus() }

        // Fill entire image with white background
        NSColor.white.setFill()
        NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

        // Draw colored circle in center (test that SOMETHING visible shows)
        let dotColor: NSColor
        switch status {
        case .ok:      dotColor = NSColor(red: 0.24, green: 0.80, blue: 0.43, alpha: 1)
        case .warning: dotColor = NSColor(red: 1.00, green: 0.72, blue: 0.30, alpha: 1)
        case .error:   dotColor = NSColor(red: 1.00, green: 0.42, blue: 0.42, alpha: 1)
        case .unknown: dotColor = NSColor.blue
        }
        dotColor.setFill()
        let circle = NSBezierPath(ovalIn: NSRect(x: 3, y: 3, width: 16, height: 12))
        circle.fill()

        debugLog("[drawMenubarIcon] drew \(status) circle")
        return image
    }

    @objc private func togglePopover(_ sender: Any?) {
        if let popover = popover, popover.isShown {
            popover.performClose(sender)
            return
        }
        showPopover()
    }

    private func showPopover() {
        guard let button = statusItem?.button else { return }

        let pop = NSPopover()
        pop.contentSize = NSSize(width: 720, height: 548)
        pop.behavior = .transient
        pop.animates = true
        pop.contentViewController = NSHostingController(rootView: PopoverView())
        self.popover = pop

        pop.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    }

    private func refreshMenubarStatus() {
        Task {
            guard let url = URL(string: "http://localhost:7777/api/state") else { return }
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let s = try JSONDecoder().decode(HelmAPIState.self, from: data)
                let running = s.services.filter { $0.running }.count
                let total   = s.services.count
                let status: ServiceStatus = running == total ? .ok : (running == 0 ? .error : .warning)
                updateMenubarIcon(status: status)
            } catch {
                updateMenubarIcon(status: .unknown)
            }
        }
    }

    // MARK: - Full window

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(openFullWindow),
            name: .openFullWindow,
            object: nil
        )
    }

    @objc private func openFullWindow() {
        if let w = fullWindow, w.isVisible {
            w.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let vc = NSHostingController(rootView: PopoverView())
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Helm Dashboard"
        window.contentViewController = vc
        window.minSize = NSSize(width: 600, height: 400)
        window.backgroundColor = NSColor(Color.bgMain)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        fullWindow = window
    }
}
