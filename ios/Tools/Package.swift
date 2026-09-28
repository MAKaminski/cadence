// swift-tools-version: 6.0
// Build-time tools only (never shipped): Apple's OpenAPI generator, used by `pnpm ios:gen` to turn
// docs/openapi.json into the Swift client in CadenceKit. Generated ahead of time and committed, so
// Xcode and CI build without package-plugin trust prompts.
import PackageDescription

let package = Package(
    name: "Tools",
    platforms: [.macOS(.v15)],
    dependencies: [.package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1")],
    targets: []
)
