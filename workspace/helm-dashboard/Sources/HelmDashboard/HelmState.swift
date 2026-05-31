import Foundation
import SQLite3

// MARK: - API response models

struct ServiceInfo: Codable, Identifiable {
    var id: String { name }
    let name: String
    let running: Bool
    let pid: String?
    let exitStatus: String?
}

struct MemoryStats: Codable {
    let total: Int
    let byKind: [String: Int]
    let recent: [FactRow]?
    let error: String?

    struct FactRow: Codable {
        let id: Int?
        let kind: String
        let key: String
        let value: String
        let confidence: Double
        let updated: Int?
    }
}

struct SchedulerJob: Codable, Identifiable {
    var id: Int
    let name: String
    let cron: String?
    let enabled: Int
    let last_run: Int?
    let next_run: Int?
    let payload: String?
}

struct JournalEntry: Codable, Identifiable {
    var id: String { file }
    let file: String
    let excerpt: String
}

struct HelmAPIState: Codable {
    let ts: String
    let services: [ServiceInfo]
    let memory: MemoryStats
    let jobs: [SchedulerJob]
    let journal: [JournalEntry]
    let upgradeHistory: [String]?
    let fleetTarget: String?
    let gitLog: [String]?
    let recentRuns: [RecentRun]?

    struct RecentRun: Codable {
        let name: String
        let result: String?
    }
}

// MARK: - Sessions / message model (read from SQLite)

struct ConversationMessage: Identifiable {
    let id: Int
    let ts: Int
    let channel: String
    let text: String
}

struct EpisodeRow: Identifiable {
    let id: Int
    let ts: Int
    let channel: String?
    let summary: String
}

// MARK: - Observable state

@MainActor
final class HelmState: ObservableObject {
    // Live data
    @Published var apiState: HelmAPIState?
    @Published var messages: [ConversationMessage] = []
    @Published var episodes: [EpisodeRow] = []
    @Published var lastError: String?
    @Published var lastRefresh: Date?
    @Published var isRefreshing = false

    // Settings
    @Published var refreshInterval: Int = 5
    @Published var maxMessages: Int = 20
    @Published var keepOnTop: Bool = false
    @Published var showTrayIcon: Bool = true

    // Channel filter
    @Published var channelFilter: String? = nil

    private var timer: Timer?
    private let dbPath: String

    // Computed uptime — approximate, derived from first known service or boot
    var uptimeString: String {
        guard let state = apiState else { return "—" }
        if let discordSvc = state.services.first(where: { $0.name.contains("discord") }), discordSvc.running {
            return "running"
        }
        let running = state.services.filter { $0.running }.count
        return "\(running)/\(state.services.count) up"
    }

    var overallStatus: ServiceStatus {
        guard let state = apiState else { return .unknown }
        let running = state.services.filter { $0.running }.count
        let total   = state.services.count
        if running == total { return .ok }
        if running == 0     { return .error }
        return .warning
    }

    var filteredMessages: [ConversationMessage] {
        guard let f = channelFilter else { return messages }
        return messages.filter { $0.channel.lowercased() == f.lowercased() }
    }

    init() {
        let workspace = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // HelmDashboard
            .deletingLastPathComponent()   // Sources
            .deletingLastPathComponent()   // helm-dashboard
            .deletingLastPathComponent()   // workspace
        dbPath = workspace.appendingPathComponent("workspace/sessions.db").path

        // Also look relative to the real install location
        // Use absolute path known from project
        startTimer()
        Task { await refresh() }
    }

    func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: TimeInterval(refreshInterval), repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in await self.refresh() }
        }
    }

    func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() async {
        isRefreshing = true
        defer { isRefreshing = false }

        await fetchAPIState()
        loadMessagesFromDB()
        loadEpisodesFromDB()
        lastRefresh = Date()
    }

    // MARK: - API fetch

    private func fetchAPIState() async {
        guard let url = URL(string: "http://localhost:7777/api/state") else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode(HelmAPIState.self, from: data)
            apiState = decoded
            lastError = nil
        } catch {
            // Try port 3000 fallback
            if let url2 = URL(string: "http://localhost:3000/api/state") {
                do {
                    let (data2, _) = try await URLSession.shared.data(from: url2)
                    let decoded2 = try JSONDecoder().decode(HelmAPIState.self, from: data2)
                    apiState = decoded2
                    lastError = nil
                    return
                } catch {}
            }
            lastError = error.localizedDescription
        }
    }

    // MARK: - SQLite reads

    private func resolvedDBPath() -> String {
        // Try the absolute known path first
        let knownPath = "/Users/owner/secondme/workspace/sessions.db"
        if FileManager.default.fileExists(atPath: knownPath) { return knownPath }
        return dbPath
    }

    private func resolvedMemoryDBPath() -> String {
        let knownPath = "/Users/owner/secondme/workspace/memory/memory.db"
        if FileManager.default.fileExists(atPath: knownPath) { return knownPath }
        return "/tmp/memory.db"
    }

    private func loadMessagesFromDB() {
        // sessions.db only has session keys, not message history.
        // Real messages live in workspace/conversations/ as .md files.
        // We read those instead.
        let convDir = "/Users/owner/secondme/workspace/conversations"
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: convDir) else { return }
        let mdFiles = files.filter { $0.hasSuffix(".md") }.sorted().reversed().prefix(3)

        var result: [ConversationMessage] = []
        var msgId = 0
        for file in mdFiles {
            let path = convDir + "/" + file
            guard let content = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            // Parse markdown lines that look like messages
            // Format: lines with timestamp patterns or just paragraph text
            let lines = content.components(separatedBy: "\n")
            // Detect channel from filename: discord-... or imessage-...
            let channel: String
            if file.lowercased().contains("discord") { channel = "discord" }
            else if file.lowercased().contains("imessage") { channel = "imessage" }
            else { channel = "chat" }

            // Group non-empty lines as messages, take last 10
            let messageLines = lines.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty
                                           && !$0.hasPrefix("#") }
                .suffix(10)

            for line in messageLines {
                msgId += 1
                // Try to parse a unix timestamp from start of line
                let parts = line.components(separatedBy: " ")
                var ts = Int(Date().timeIntervalSince1970)
                var text = line
                if let first = parts.first, let parsed = Int(first) {
                    ts = parsed
                    text = parts.dropFirst().joined(separator: " ")
                }
                result.append(ConversationMessage(id: msgId, ts: ts, channel: channel, text: text))
            }
        }

        // Sort newest first, cap at maxMessages
        messages = Array(result.sorted { $0.ts > $1.ts }.prefix(maxMessages))
    }

    private func loadEpisodesFromDB() {
        let path = resolvedMemoryDBPath()
        guard FileManager.default.fileExists(atPath: path) else { return }

        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return }
        defer { sqlite3_close(db) }

        let sql = "SELECT id, ts, channel, summary FROM episodes ORDER BY ts DESC LIMIT 8"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(stmt) }

        var rows: [EpisodeRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id      = Int(sqlite3_column_int64(stmt, 0))
            let ts      = Int(sqlite3_column_int64(stmt, 1))
            let channel = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
            let summary = sqlite3_column_text(stmt, 3).map { String(cString: $0) } ?? ""
            rows.append(EpisodeRow(id: id, ts: ts, channel: channel, summary: summary))
        }
        episodes = rows
    }
}

// MARK: - Helpers

enum ServiceStatus { case ok, warning, error, unknown }

extension Date {
    func relativeString() -> String {
        let diff = Int(Date().timeIntervalSince(self))
        if diff < 60   { return "\(diff)s ago" }
        if diff < 3600 { return "\(diff / 60)m ago" }
        let h = diff / 3600; let m = (diff % 3600) / 60
        return "\(h)h \(m)m ago"
    }
}

extension Int {
    func asDateString() -> String {
        let d = Date(timeIntervalSince1970: TimeInterval(self))
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm"
        return f.string(from: d)
    }

    func countdownString() -> String {
        let now = Int(Date().timeIntervalSince1970)
        let diff = self - now
        if diff <= 0 { return "due" }
        if diff < 60 { return "\(diff)s" }
        if diff < 3600 { return "\(diff / 60)m" }
        return "\(diff / 3600)h \((diff % 3600) / 60)m"
    }
}
