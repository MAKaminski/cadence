// swift-tools-version: 6.2
// CadenceKit: everything the app and the widget share. CadenceAPI is generated from docs/openapi.json
// (`pnpm ios:gen`); CadenceCore adds sign-in (OAuth 2.1 + PKCE), token storage and the widget snapshot.
// No business rules live here: they're on the server, in src/services.
import PackageDescription

let package = Package(
    name: "CadenceKit",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [
        .library(name: "CadenceAPI", targets: ["CadenceAPI"]),
        .library(name: "CadenceCore", targets: ["CadenceCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.1"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.3.1"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.3.0"),
    ],
    targets: [
        .target(
            name: "CadenceAPI",
            dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
            exclude: ["openapi-generator-config.yaml"]
        ),
        .target(
            name: "CadenceCore",
            dependencies: [
                "CadenceAPI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ]
        ),
        .testTarget(name: "CadenceCoreTests", dependencies: ["CadenceCore"]),
    ]
)
