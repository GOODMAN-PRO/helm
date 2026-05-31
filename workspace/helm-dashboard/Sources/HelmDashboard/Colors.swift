import SwiftUI

// MARK: - Design palette

extension Color {
    static let bgMain        = Color(hex: "#0f0f0f")
    static let bgSecondary   = Color(hex: "#1a1a1a")
    static let textPrimary   = Color(hex: "#e8e8e8")
    static let textSecondary = Color(hex: "#888888")
    static let accentActive  = Color(hex: "#4a9eff")
    static let accentWarning = Color(hex: "#ffb84d")
    static let accentError   = Color(hex: "#ff6b6b")
    static let borderColor   = Color(hex: "#2a2a2a")
    static let accentGreen   = Color(hex: "#3dcc6e")
    static let hoverBg       = Color(hex: "#1a1a1a")

    init(hex: String) {
        let clean = hex.trimmingCharacters(in: .init(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8)  & 0xFF) / 255
        let b = Double(rgb & 0xFF)          / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Typography helpers

struct HelmFont {
    // SF Pro
    static func sectionHeader()  -> Font { .system(size: 11, weight: .semibold, design: .default) }
    static func dataLabel()      -> Font { .system(size: 10, weight: .regular,  design: .default) }
    // SF Mono
    static func dataValue()      -> Font { .system(size: 10, weight: .regular,  design: .monospaced) }
    static func timestamp()      -> Font { .system(size: 9,  weight: .regular,  design: .monospaced) }
    static func messagePreview() -> Font { .system(size: 9.5, weight: .regular, design: .monospaced) }
}
