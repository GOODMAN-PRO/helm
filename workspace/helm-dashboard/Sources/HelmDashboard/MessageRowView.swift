import SwiftUI

struct MessageRowView: View {
    let message: ConversationMessage
    @State private var isExpanded = false
    @State private var isHovered  = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 6) {
                Text(Date(timeIntervalSince1970: TimeInterval(message.ts))
                    .formatted(.dateTime.month(.twoDigits).day(.twoDigits)
                                         .hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)))
                    .font(HelmFont.timestamp())
                    .foregroundColor(.textSecondary)
                    .frame(width: 70, alignment: .leading)

                ChannelTagView(channel: message.channel)

                Spacer()
            }

            Text(message.text)
                .font(HelmFont.messagePreview())
                .foregroundColor(.textPrimary)
                .lineLimit(isExpanded ? nil : 2)
                .animation(.easeInOut(duration: 0.15), value: isExpanded)

            if !isExpanded && message.text.count > 120 {
                Text("expand")
                    .font(HelmFont.timestamp())
                    .foregroundColor(.accentActive.opacity(0.7))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(isHovered ? Color.hoverBg : Color.clear)
        .cornerRadius(4)
        .onTapGesture { withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() } }
        .onHover { isHovered = $0 }
    }
}

struct ChannelTagView: View {
    let channel: String

    private var displayName: String { channel.lowercased() }

    private var tagColor: Color {
        switch displayName {
        case "discord":  return Color(hex: "#5865f2")
        case "imessage": return Color(hex: "#27c93f")
        default:         return Color.textSecondary
        }
    }

    var body: some View {
        Text(displayName)
            .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(tagColor.opacity(0.25))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(tagColor.opacity(0.5), lineWidth: 0.5)
            )
            .cornerRadius(3)
    }
}

struct EpisodeRowView: View {
    let episode: EpisodeRow
    @State private var isExpanded = false
    @State private var isHovered  = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(Date(timeIntervalSince1970: TimeInterval(episode.ts))
                    .formatted(.dateTime.month(.twoDigits).day(.twoDigits)
                                         .hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)))
                    .font(HelmFont.timestamp())
                    .foregroundColor(.textSecondary)
                    .frame(width: 70, alignment: .leading)

                if let ch = episode.channel {
                    ChannelTagView(channel: ch)
                } else {
                    Text("sys")
                        .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                        .foregroundColor(.textSecondary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.borderColor)
                        .cornerRadius(3)
                }
                Spacer()
            }
            Text(episode.summary)
                .font(HelmFont.messagePreview())
                .foregroundColor(.textSecondary)
                .lineLimit(isExpanded ? nil : 2)
                .animation(.easeInOut(duration: 0.15), value: isExpanded)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(isHovered ? Color.hoverBg : Color.clear)
        .cornerRadius(4)
        .onTapGesture { withAnimation { isExpanded.toggle() } }
        .onHover { isHovered = $0 }
    }
}
