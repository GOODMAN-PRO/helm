import SwiftUI

struct SettingsView: View {
    @ObservedObject var state: HelmState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundColor(.textPrimary)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)

            Divider().background(Color.borderColor)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SettingsSection(title: "REFRESH") {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Interval")
                                    .font(HelmFont.dataLabel())
                                    .foregroundColor(.textSecondary)
                                Spacer()
                                Text("\(state.refreshInterval)s")
                                    .font(HelmFont.dataValue())
                                    .foregroundColor(.textPrimary)
                            }
                            Slider(value: Binding(
                                get: { Double(state.refreshInterval) },
                                set: {
                                    state.refreshInterval = Int($0)
                                    state.startTimer()
                                }
                            ), in: 1...10, step: 1)
                            .tint(.accentActive)
                        }
                    }

                    SettingsSection(title: "FEED") {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Max messages")
                                    .font(HelmFont.dataLabel())
                                    .foregroundColor(.textSecondary)
                                Spacer()
                                Text("\(state.maxMessages)")
                                    .font(HelmFont.dataValue())
                                    .foregroundColor(.textPrimary)
                            }
                            Slider(value: Binding(
                                get: { Double(state.maxMessages) },
                                set: { state.maxMessages = Int($0) }
                            ), in: 5...50, step: 5)
                            .tint(.accentActive)
                        }
                    }

                    SettingsSection(title: "WINDOW") {
                        VStack(alignment: .leading, spacing: 10) {
                            SettingsToggle(label: "Keep popover on top", isOn: $state.keepOnTop)
                            SettingsToggle(label: "Show tray icon",       isOn: $state.showTrayIcon)
                        }
                    }

                    SettingsSection(title: "INFO") {
                        VStack(alignment: .leading, spacing: 4) {
                            DataRow(label: "API endpoint", value: "localhost:7777")
                            DataRow(label: "DB path",      value: "workspace/memory/memory.db")
                            DataRow(label: "Version",      value: "1.0.0")
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }

            Divider().background(Color.borderColor)

            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(HelmButtonStyle())
                    .keyboardShortcut(.return, modifiers: [])
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .frame(width: 360, height: 420)
        .background(Color.bgSecondary)
    }
}

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(HelmFont.sectionHeader())
                .foregroundColor(.textSecondary)
                .tracking(1.2)
            content
        }
    }
}

struct SettingsToggle: View {
    let label: String
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            Text(label)
                .font(HelmFont.dataLabel())
                .foregroundColor(.textSecondary)
            Spacer()
            Toggle("", isOn: $isOn)
                .toggleStyle(.switch)
                .tint(.accentActive)
                .labelsHidden()
        }
    }
}

struct HelmButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 5)
            .background(Color.accentActive.opacity(configuration.isPressed ? 0.7 : 1))
            .cornerRadius(5)
    }
}
