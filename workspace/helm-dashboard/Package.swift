// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "HelmDashboard",
    platforms: [
        .macOS(.v12)
    ],
    targets: [
        .executableTarget(
            name: "HelmDashboard",
            path: "Sources/HelmDashboard",
            linkerSettings: [
                .linkedLibrary("sqlite3")
            ]
        )
    ]
)
