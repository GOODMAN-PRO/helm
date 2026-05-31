import SwiftUI

struct LiveFeedView: View {
    @ObservedObject var state: HelmState

    var body: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {
                // CONVERSATIONS
                feedSectionHeader(title: "CONVERSATIONS", count: state.filteredMessages.count)
                channelFilterBar
                Divider().background(Color.borderColor).padding(.horizontal, 8)

                if state.filteredMessages.isEmpty {
                    emptyState(text: "no messages")
                } else {
                    ForEach(state.filteredMessages) { msg in
                        MessageRowView(message: msg)
                        Divider().background(Color.borderColor.opacity(0.5))
                            .padding(.horizontal, 8)
                    }
                }

                Spacer(minLength: 12)

                // EPISODES
                feedSectionHeader(title: "EPISODES", count: state.episodes.count)
                Divider().background(Color.borderColor).padding(.horizontal, 8)

                if state.episodes.isEmpty {
                    emptyState(text: "no episodes")
                } else {
                    ForEach(state.episodes) { ep in
                        EpisodeRowView(episode: ep)
                        Divider().background(Color.borderColor.opacity(0.5))
                            .padding(.horizontal, 8)
                    }
                }

                // Services quick-view
                Spacer(minLength: 12)
                feedSectionHeader(title: "SERVICES", count: nil)
                Divider().background(Color.borderColor).padding(.horizontal, 8)
                servicesQuickView

                Spacer(minLength: 16)
            }
        }
        .background(Color.bgMain)
    }

    // MARK: - Sub-views

    private func feedSectionHeader(title: String, count: Int?) -> some View {
        HStack {
            Text(title)
                .font(HelmFont.sectionHeader())
                .foregroundColor(.textSecondary)
                .tracking(1.2)
            if let n = count {
                Text("\(n)")
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .foregroundColor(.textSecondary)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color.borderColor)
                    .cornerRadius(3)
            }
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }

    private var channelFilterBar: some View {
        HStack(spacing: 6) {
            FilterChip(label: "all",      isActive: state.channelFilter == nil)   { state.channelFilter = nil }
            FilterChip(label: "discord",  isActive: state.channelFilter == "discord")  { state.channelFilter = "discord" }
            FilterChip(label: "imessage", isActive: state.channelFilter == "imessage") { state.channelFilter = "imessage" }
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 4)
    }

    private func emptyState(text: String) -> some View {
        Text(text)
            .font(HelmFont.dataValue())
            .foregroundColor(.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
    }

    private var servicesQuickView: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let services = state.apiState?.services {
                ForEach(services) { svc in
                    ServiceQuickRow(service: svc)
                    Divider().background(Color.borderColor.opacity(0.5)).padding(.horizontal, 8)
                }
            } else {
                emptyState(text: "fetching...")
            }
        }
    }
}

struct FilterChip: View {
    let label: String
    let isActive: Bool
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(isActive ? .white : .textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(isActive ? Color.accentActive.opacity(0.3) : (isHovered ? Color.hoverBg : Color.clear))
                .overlay(
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(isActive ? Color.accentActive.opacity(0.6) : Color.borderColor, lineWidth: 0.5)
                )
                .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

struct ServiceQuickRow: View {
    let service: ServiceInfo
    @State private var isHovered = false

    private var shortName: String {
        service.name.components(separatedBy: ".").last ?? service.name
    }

    var body: some View {
        HStack(spacing: 6) {
            StatusDotView(running: service.running, size: 6)
            Text(shortName)
                .font(HelmFont.dataValue())
                .foregroundColor(.textPrimary)
                .lineLimit(1)
            Spacer()
            Text(service.running ? "up" : "down")
                .font(HelmFont.timestamp())
                .foregroundColor(service.running ? .accentGreen : .accentError)
            if let pid = service.pid, pid != "-" {
                Text("pid \(pid)")
                    .font(HelmFont.timestamp())
                    .foregroundColor(.textSecondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(isHovered ? Color.hoverBg : Color.clear)
        .onHover { isHovered = $0 }
    }
}
