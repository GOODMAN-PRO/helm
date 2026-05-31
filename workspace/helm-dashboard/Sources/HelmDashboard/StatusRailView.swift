import SwiftUI

struct StatusRailView: View {
    @ObservedObject var state: HelmState

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                helmStatusSection
                Divider().background(Color.borderColor)
                modeModelSection
                Divider().background(Color.borderColor)
                schedulerSection
                Divider().background(Color.borderColor)
                memorySection
                Divider().background(Color.borderColor)
                thinkSection
                Divider().background(Color.borderColor)
                systemHealthSection
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .frame(width: 200)
        .background(Color.bgSecondary)
    }

    // MARK: - Helm status

    private var helmStatusSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader(text: "HELM")
            HStack(spacing: 6) {
                StatusDotView(serviceStatus: state.overallStatus, size: 8)
                Text(state.uptimeString)
                    .font(HelmFont.dataValue())
                    .foregroundColor(.textPrimary)
            }
            if let err = state.lastError {
                Text(err)
                    .font(HelmFont.timestamp())
                    .foregroundColor(.accentError)
                    .lineLimit(2)
            }
            if let refresh = state.lastRefresh {
                Text(refresh.relativeString())
                    .font(HelmFont.timestamp())
                    .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: - Mode / Model

    private var modeModelSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Mode")
                    .font(HelmFont.dataLabel())
                    .foregroundColor(.textSecondary)
                Spacer()
                Text("copilot")
                    .font(HelmFont.dataValue())
                    .foregroundColor(.accentActive)
            }
            HStack {
                Text("Model")
                    .font(HelmFont.dataLabel())
                    .foregroundColor(.textSecondary)
                Spacer()
                Text("sonnet")
                    .font(HelmFont.dataValue())
                    .foregroundColor(.accentActive)
            }
            if let target = state.apiState?.fleetTarget {
                HStack {
                    Text("Fleet")
                        .font(HelmFont.dataLabel())
                        .foregroundColor(.textSecondary)
                    Spacer()
                    Text(target)
                        .font(HelmFont.dataValue())
                        .foregroundColor(.accentActive)
                }
            }
        }
    }

    // MARK: - Scheduler

    private var schedulerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader(text: "SCHEDULER")
            if let jobs = state.apiState?.jobs, !jobs.isEmpty {
                let enabledJobs = jobs.filter { $0.enabled != 0 }
                if let next = enabledJobs.min(by: {
                    ($0.next_run ?? Int.max) < ($1.next_run ?? Int.max)
                }) {
                    HStack(spacing: 6) {
                        StatusDotView(running: true, size: 6)
                        Text(next.name)
                            .font(HelmFont.dataValue())
                            .foregroundColor(.textPrimary)
                            .lineLimit(1)
                    }
                    if let nr = next.next_run {
                        Text(nr.countdownString())
                            .font(HelmFont.timestamp())
                            .foregroundColor(.accentWarning)
                    }
                } else {
                    HStack(spacing: 6) {
                        StatusDotView(status: .disabled, size: 6)
                        Text("no enabled jobs")
                            .font(HelmFont.dataValue())
                            .foregroundColor(.textSecondary)
                    }
                }
                Text("\(jobs.count) total")
                    .font(HelmFont.timestamp())
                    .foregroundColor(.textSecondary)
            } else {
                Text("—")
                    .font(HelmFont.dataValue())
                    .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: - Memory

    private var memorySection: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader(text: "MEMORY")
            if let mem = state.apiState?.memory {
                DataRow(label: "Facts", value: "\(mem.total)")
                DataRow(label: "Episodes", value: "\(state.episodes.count)")
                // Show kind breakdown
                ForEach(Array(mem.byKind.sorted(by: { $0.key < $1.key }).prefix(3)), id: \.key) { kind, count in
                    DataRow(label: kind, value: "\(count)")
                }
            } else {
                Text("—")
                    .font(HelmFont.dataValue())
                    .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: - Think daemon

    private var thinkSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader(text: "THINK")
            if let services = state.apiState?.services {
                let thinkSvc = services.first { $0.name.contains("think") }
                HStack(spacing: 6) {
                    StatusDotView(running: thinkSvc?.running ?? false, size: 6)
                    Text(thinkSvc?.running == true ? "running" : "stopped")
                        .font(HelmFont.dataValue())
                        .foregroundColor(thinkSvc?.running == true ? .textPrimary : .textSecondary)
                }
                if let journal = state.apiState?.journal, let last = journal.first {
                    Text("last: " + last.file)
                        .font(HelmFont.timestamp())
                        .foregroundColor(.textSecondary)
                        .lineLimit(1)
                }
            } else {
                Text("—")
                    .font(HelmFont.dataValue())
                    .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: - System health

    private var systemHealthSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader(text: "SYSTEM")
            SystemStatsView()
        }
    }
}

// MARK: - Sub-components

struct SectionHeader: View {
    let text: String
    var body: some View {
        Text(text)
            .font(HelmFont.sectionHeader())
            .foregroundColor(.textSecondary)
            .tracking(1.2)
    }
}

struct DataRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(HelmFont.dataLabel())
                .foregroundColor(.textSecondary)
            Spacer()
            Text(value)
                .font(HelmFont.dataValue())
                .foregroundColor(.textPrimary)
        }
    }
}

struct SystemStatsView: View {
    @State private var cpu: Double = 0
    @State private var ramUsed: Double = 0
    @State private var ramTotal: Double = 0
    @State private var diskFree: String = "—"

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            DataRow(label: "CPU", value: String(format: "%.1f%%", cpu))
            DataRow(label: "RAM", value: String(format: "%.1f / %.1f GB", ramUsed, ramTotal))
            DataRow(label: "Disk", value: diskFree + " free")
        }
        .onAppear { updateStats() }
    }

    private func updateStats() {
        // CPU via top
        DispatchQueue.global(qos: .utility).async {
            let task = Process()
            task.launchPath = "/usr/bin/top"
            task.arguments = ["-l", "2", "-n", "0", "-s", "1"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()
            try? task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8) ?? ""
            // Parse "CPU usage: X.X% user, X.X% sys"
            if let range = out.range(of: #"CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys"#,
                                     options: .regularExpression) {
                let match = String(out[range])
                let nums = match.components(separatedBy: CharacterSet.decimalDigits.inverted)
                    .compactMap(Double.init)
                if nums.count >= 2 {
                    DispatchQueue.main.async { cpu = nums[0] + nums[1] }
                }
            }
        }

        // RAM via vm_stat + sysctl
        DispatchQueue.global(qos: .utility).async {
            let total: Double
            var size: size_t = MemoryLayout<Int64>.size
            var mem: Int64 = 0
            sysctlbyname("hw.memsize", &mem, &size, nil, 0)
            total = Double(mem) / (1024 * 1024 * 1024)

            let task = Process()
            task.launchPath = "/usr/bin/vm_stat"
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()
            try? task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8) ?? ""

            var freePages: Double = 0
            let lines = out.components(separatedBy: "\n")
            for line in lines {
                if line.contains("Pages free") || line.contains("Pages speculative") {
                    let nums = line.components(separatedBy: CharacterSet.decimalDigits.inverted)
                        .compactMap(Double.init)
                    freePages += nums.first ?? 0
                }
            }
            let pageSize: Double = 4096
            let freeGB = freePages * pageSize / (1024 * 1024 * 1024)
            let usedGB = total - freeGB

            DispatchQueue.main.async {
                ramTotal = total
                ramUsed  = max(0, usedGB)
            }
        }

        // Disk via df
        DispatchQueue.global(qos: .utility).async {
            let task = Process()
            task.launchPath = "/bin/df"
            task.arguments = ["-H", "/"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()
            try? task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8) ?? ""
            let lines = out.components(separatedBy: "\n")
            if lines.count > 1 {
                let parts = lines[1].components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if parts.count >= 4 {
                    DispatchQueue.main.async { diskFree = parts[3] }
                }
            }
        }
    }
}
