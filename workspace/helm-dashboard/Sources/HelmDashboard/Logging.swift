import Foundation

func debugLog(_ msg: String) {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss.SSS"
    let ts = formatter.string(from: Date())
    let fullMsg = "[\(ts)] \(msg)\n"

    // Append to file
    if let data = fullMsg.data(using: .utf8) {
        if let handle = FileHandle(forWritingAtPath: "/tmp/helm-debug.log") {
            handle.seekToEndOfFile()
            handle.write(data)
            handle.closeFile()
        } else {
            try? fullMsg.write(toFile: "/tmp/helm-debug.log", atomically: true, encoding: .utf8)
        }
    }

    // Also write to stderr
    FileHandle.standardError.write((fullMsg).data(using: .utf8) ?? Data())
}
