import Foundation
import Observation

/// The signed-in state. Tokens and the registered client id live in the Keychain; access tokens are
/// refreshed on demand, with one refresh in flight at a time.
@MainActor @Observable
public final class Session {
    public private(set) var tokens: Tokens?
    public var isSignedIn: Bool { tokens != nil }
    public let config: CadenceConfig

    let oauth: OAuthClient
    let store: SecretStore
    private var refreshing: Task<Tokens, Error>?

    var tokensKey: String { "tokens:\(config.server.absoluteString)" }
    var clientKey: String { "client:\(config.server.absoluteString)" }

    public init(config: CadenceConfig, store: SecretStore = KeychainStore(), oauth: OAuthClient? = nil) {
        self.config = config
        self.store = store
        self.oauth = oauth ?? OAuthClient(config: config)
        self.tokens = store.read(tokensKey).flatMap { try? JSONDecoder().decode(Tokens.self, from: $0) }
    }

    func save(_ t: Tokens?) {
        tokens = t
        store.write(tokensKey, t.flatMap { try? JSONEncoder().encode($0) })
    }

    func clientId() async throws -> String {
        if let d = store.read(clientKey), let id = String(data: d, encoding: .utf8) { return id }
        let id = try await oauth.register()
        store.write(clientKey, Data(id.utf8))
        return id
    }

    /// Sign in through Cadence's own web sign-in. `authenticate` shows the URL in a browser session
    /// (ASWebAuthenticationSession in the app) and returns the callback URL.
    public func signIn(authenticate: (URL) async throws -> URL) async throws {
        let pkce = PKCE()
        let state = PKCE.randomVerifier()
        var id = try await clientId()
        let url: URL
        do { url = try await oauth.authorizeURL(clientId: id, pkce: pkce, state: state) } catch {
            // A server reset forgets clients; register again once.
            store.write(clientKey, nil); id = try await clientId()
            url = try await oauth.authorizeURL(clientId: id, pkce: pkce, state: state)
        }
        let callback = try await authenticate(url)
        let code = try OAuthClient.code(from: callback, expectedState: state)
        save(try await oauth.exchange(code: code, clientId: id, pkce: pkce))
    }

    public func signOut() { save(nil) }

    /// A usable access token, refreshing first if it's about to expire.
    public func accessToken(forceRefresh: Bool = false) async throws -> String {
        guard let t = tokens else { throw AuthError.signedOut }
        if !forceRefresh && !t.expiresSoon() { return t.accessToken }
        if let r = refreshing { return try await r.value.accessToken }
        guard let rt = t.refreshToken else { save(nil); throw AuthError.signedOut }
        let task = Task { [oauth] in try await oauth.refresh(rt, clientId: try await self.clientId()) }
        refreshing = task
        defer { refreshing = nil }
        do {
            let fresh = try await task.value
            save(fresh)
            return fresh.accessToken
        } catch {
            save(nil) // refresh token revoked (e.g. disconnected in Settings): sign in again
            throw AuthError.signedOut
        }
    }
}
