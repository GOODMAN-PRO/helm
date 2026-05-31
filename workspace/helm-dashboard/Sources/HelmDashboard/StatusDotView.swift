import SwiftUI

struct StatusDotView: View {
    let status: DotStatus
    var size: CGFloat = 8

    enum DotStatus {
        case ok, warning, error, unknown, disabled

        var color: Color {
            switch self {
            case .ok:       return .accentGreen
            case .warning:  return .accentWarning
            case .error:    return .accentError
            case .unknown:  return .textSecondary
            case .disabled: return Color(hex: "#404050")
            }
        }

        var glowing: Bool {
            switch self {
            case .ok: return true
            default:  return false
            }
        }
    }

    var body: some View {
        ZStack {
            if status.glowing {
                Circle()
                    .fill(status.color.opacity(0.25))
                    .frame(width: size + 4, height: size + 4)
            }
            Circle()
                .fill(status.color)
                .frame(width: size, height: size)
        }
        .animation(.easeInOut(duration: 0.2), value: status.color)
    }
}

// Convenience initializer from ServiceStatus
extension StatusDotView {
    init(serviceStatus: ServiceStatus, size: CGFloat = 8) {
        switch serviceStatus {
        case .ok:      self.init(status: .ok,      size: size)
        case .warning: self.init(status: .warning,  size: size)
        case .error:   self.init(status: .error,    size: size)
        case .unknown: self.init(status: .unknown,  size: size)
        }
    }

    init(running: Bool, enabled: Bool = true, size: CGFloat = 8) {
        if !enabled {
            self.init(status: .disabled, size: size)
        } else if running {
            self.init(status: .ok, size: size)
        } else {
            self.init(status: .error, size: size)
        }
    }
}
