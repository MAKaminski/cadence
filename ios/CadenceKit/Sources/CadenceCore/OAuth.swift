import Foundation

/// Tokens for the Cadence API (audience = /api/v1).
public struct Tokens: Codable, Sendable, Equatable {
    public var accessToken: String
    public var refreshToken: String?
    public var expiresAt: Date
    public var scope: String

    public var scopes: Set<String> { Set(scope.split(separator: " ").map(String.init)) }
    public var canApprove: Bool { scopes.contains("cadence:approve") }
    func expiresSoon(now: Date = .now) -> Bool { expiresAt.timeIntervalSince(now) < 60 }
}

public enum AuthError: Error, LocalizedError, Equatable {
    case cancelled, invalidCallback, server(String), signedOut

    public var errorDescription: String? {
        switch self {
        case .cancelled: "Sign-in was cancelled."
        case .invalidCallback: "Cadence sent back an unexpected response. Try again."
        case .server(let m): m
        case .signedOut: "You're signed out."
        }
    }
}

/// The OAuth 2.1 conversation with Cadence's authorization server: discovery (RFC 8414), dynamic client
/// registration (RFC 7591; the app registers itself once per server), authorization code + PKCE with a
/// resource indicator (RFC 8707), and refresh. Pure networking; the browser step is injected.
public struct OAuthClient: Sendable {
    public let config: CadenceConfig
    let http: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    public init(config: CadenceConfig, http: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse) = { try await URLSession.shared.data(for: $0) }) {
        self.config = config
        self.http = http
    }

    struct Metadata: Decodable { let authorization_endpoint: URL; let token_endpoint: URL; let registration_endpoint: URL }
    struct Registration: Decodable { let client_id: String }
    struct TokenResponse: Decodable { let access_token: String; let refresh_token: String?; let expires_in: Int?; let scope: String? }
    struct OAuthErrorBody: Decodable { let error: String?; let error_description: String? }

    func json<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, resp) = try await http(req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let e = try? JSONDecoder().decode(OAuthErrorBody.self, from: data)
            throw AuthError.server(e?.error_description ?? e?.error ?? "Cadence answered \(status).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func metadata() async throws -> Metadata { try await json(URLRequest(url: config.metadataURL)) }

    public func register() async throws -> String {
        var req = URLRequest(url: try await metadata().registration_endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "client_name": "Cadence for iOS", "application_type": "native", "token_endpoint_auth_method": "none",
            "redirect_uris": [CadenceConfig.redirectURI], "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        ])
        let r: Registration = try await json(req)
        return r.client_id
    }

    public func authorizeURL(clientId: String, pkce: PKCE, state: String) async throws -> URL {
        var c = URLComponents(url: try await metadata().authorization_endpoint, resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "response_type", value: "code"), .init(name: "client_id", value: clientId),
            .init(name: "redirect_uri", value: CadenceConfig.redirectURI), .init(name: "state", value: state),
            .init(name: "scope", value: "openid offline_access cadence:read cadence:write cadence:approve"),
            .init(name: "resource", value: config.apiURL.absoluteString),
            .init(name: "code_challenge", value: pkce.challenge), .init(name: "code_challenge_method", value: "S256"),
        ]
        return c.url!
    }

    func tokenRequest(_ form: [String: String]) async throws -> Tokens {
        var req = URLRequest(url: try await metadata().token_endpoint)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(Self.formEncode(form).utf8)
        let t: TokenResponse = try await json(req)
        return Tokens(accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: .now.addingTimeInterval(TimeInterval(t.expires_in ?? 3600)), scope: t.scope ?? "")
    }

    /// application/x-www-form-urlencoded with only unreserved characters left as-is. (URLComponents
    /// would leave "+" alone, which a form parser reads as a space and would corrupt a token.)
    static func formEncode(_ form: [String: String]) -> String {
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return form.sorted { $0.key < $1.key }
            .map { "\($0.key.addingPercentEncoding(withAllowedCharacters: unreserved)!)=\($0.value.addingPercentEncoding(withAllowedCharacters: unreserved)!)" }
            .joined(separator: "&")
    }

    public func exchange(code: String, clientId: String, pkce: PKCE) async throws -> Tokens {
        try await tokenRequest(["grant_type": "authorization_code", "code": code, "redirect_uri": CadenceConfig.redirectURI,
                                "client_id": clientId, "code_verifier": pkce.verifier, "resource": config.apiURL.absoluteString])
    }

    public func refresh(_ refreshToken: String, clientId: String) async throws -> Tokens {
        var t = try await tokenRequest(["grant_type": "refresh_token", "refresh_token": refreshToken, "client_id": clientId, "resource": config.apiURL.absoluteString])
        if t.refreshToken == nil { t.refreshToken = refreshToken }
        return t
    }

    /// Pull the code out of `app.cadence.ios:/oauth/callback?code=…&state=…`, checking state.
    public static func code(from callback: URL, expectedState: String) throws -> String {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let err = items.first(where: { $0.name == "error" })?.value {
            throw err == "access_denied" ? AuthError.cancelled : AuthError.server(items.first(where: { $0.name == "error_description" })?.value ?? err)
        }
        guard items.first(where: { $0.name == "state" })?.value == expectedState, let code = items.first(where: { $0.name == "code" })?.value else {
            throw AuthError.invalidCallback
        }
        return code
    }
}
