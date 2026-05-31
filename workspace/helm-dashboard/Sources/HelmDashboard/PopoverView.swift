import SwiftUI

struct PopoverView: View {
    @StateObject var state = HelmState()
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            // Main two-column body
            HStack(spacing: 0) {
                // Left: Status rail (200px fixed)
                StatusRailView(state: state)
                    .frame(width: 200)

                // Vertical divider
                Rectangle()
                    .fill(Color.borderColor)
                    .frame(width: 1)

                // Right: Live feed
                LiveFeedView(state: state)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Footer
            footerBar
        }
        .frame(width: 720, height: 520)
        .background(Color.bgMain)
        .sheet(isPresented: $showSettings) {
            SettingsView(state: state)
        }
        // Keyboard shortcuts handled via NSEvent monitor in AppDelegate;
        // onKeyPress with modifier combos needs macOS 14+, so we handle
        // Cmd+R / Cmd+, via the NSMenus wired in AppDelegate instead.
    }

    // MARK: - Footer

    private var footerBar: some View {
        HStack(spacing: 0) {
            // Settings gear
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(.textSecondary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .help("Settings (⌘,)")

            // Refresh indicator
            HStack(spacing: 4) {
                if state.isRefreshing {
                    ProgressView()
                        .scaleEffect(0.5)
                        .frame(width: 12, height: 12)
                }
                if let lr = state.lastRefresh {
                    Text(lr.relativeString())
                        .font(HelmFont.timestamp())
                        .foregroundColor(.textSecondary)
                }
            }

            Spacer()

            // Status summary
            HStack(spacing: 4) {
                StatusDotView(serviceStatus: state.overallStatus, size: 6)
                if let services = state.apiState?.services {
                    let running = services.filter { $0.running }.count
                    Text("\(running)/\(services.count) services")
                        .font(HelmFont.timestamp())
                        .foregroundColor(.textSecondary)
                }
            }

            Spacer()

            // Cmd+R hint
            Text("⌘R refresh")
                .font(HelmFont.timestamp())
                .foregroundColor(.textSecondary.opacity(0.5))
                .padding(.trailing, 8)

            // Open full window button
            Button {
                openFullWindow()
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 10, weight: .regular))
                    Text("Full window")
                        .font(.system(size: 10, weight: .regular))
                }
                .foregroundColor(.textSecondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.bgSecondary)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(Color.borderColor, lineWidth: 0.5)
                )
                .cornerRadius(4)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 8)
        }
        .frame(height: 28)
        .background(Color.bgSecondary)
        .overlay(
            Rectangle()
                .fill(Color.borderColor)
                .frame(height: 1),
            alignment: .top
        )
    }

    private func openFullWindow() {
        // Post a notification that AppDelegate picks up to open a dedicated window
        NotificationCenter.default.post(name: .openFullWindow, object: nil)
    }
}

extension Notification.Name {
    static let openFullWindow = Notification.Name("HelmOpenFullWindow")
}
