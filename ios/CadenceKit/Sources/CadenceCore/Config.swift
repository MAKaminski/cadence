import Foundation

/// Where the app talks to. Release builds read `CadenceServerURL` from Info.plist (set per scheme in
/// project.yml); debug builds default to the local demo server (`pnpm demo`), which the simulator
/// reaches at localhost.
public struct CadenceConfig: Sendable, Equatable {
    public var server: URL
    public static let redirectScheme = "app.cadence.ios"
    public static let redirectURI = "app.cadence.ios:/oauth/callback"
    public static let appGroup = "group.app.cadence.ios"

    public init(server: URL) { self.server = server }

    public var apiURL: URL { server.appending(path: "api/v1") }
    public var issuer: URL { server.appending(path: "api/auth") }
    /// RFC 8414 metadata for an issuer with a path: /.well-known/oauth-authorization-server/api/auth
    public var metadataURL: URL { server.appending(path: ".well-known/oauth-authorization-server/api/auth") }

    public static func fromBundle(_ bundle: Bundle = .main) -> CadenceConfig {
        if let s = bundle.object(forInfoDictionaryKey: "CadenceServerURL") as? String, let url = URL(string: s), !s.isEmpty {
            return CadenceConfig(server: url)
        }
        return CadenceConfig(server: URL(string: "http://localhost:3000")!)
    }

    /// The demo server offers a demo sign-in; production never does.
    public var isLocalDemo: Bool { server.host() == "localhost" || server.host() == "127.0.0.1" }
}
