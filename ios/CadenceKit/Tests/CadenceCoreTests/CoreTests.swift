import Foundation
import Testing
@testable import CadenceCore

@Suite struct PKCETests {
    @Test func matchesRFC7636Vector() {
        let p = PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        #expect(p.challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }
    @Test func verifiersAreRandomAndURLSafe() {
        let a = PKCE.randomVerifier(), b = PKCE.randomVerifier()
        #expect(a != b)
        #expect(a.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil)
    }
}

@Suite struct FormEncodingTests {
    @Test func encodesPlusAndSlashesSoTokensSurvive() {
        #expect(OAuthClient.formEncode(["t": "a+b/c=", "r": "http://x/api"]) == "r=http%3A%2F%2Fx%2Fapi&t=a%2Bb%2Fc%3D")
    }
}

@Suite struct CallbackTests {
    @Test func acceptsMatchingState() throws {
        let url = URL(string: "app.cadence.ios:/oauth/callback?code=abc&state=s1&iss=x")!
        #expect(try OAuthClient.code(from: url, expectedState: "s1") == "abc")
    }
    @Test func rejectsWrongState() {
        let url = URL(string: "app.cadence.ios:/oauth/callback?code=abc&state=evil")!
        #expect(throws: AuthError.invalidCallback) { try OAuthClient.code(from: url, expectedState: "s1") }
    }
    @Test func deniedConsentIsCancelled() {
        let url = URL(string: "app.cadence.ios:/oauth/callback?error=access_denied&state=s1")!
        #expect(throws: AuthError.cancelled) { try OAuthClient.code(from: url, expectedState: "s1") }
    }
}

/// A fake authorization server: metadata, registration, and a token endpoint that counts refreshes.
final class FakeServer: @unchecked Sendable {
    var refreshes = 0
    var revoked = false
    let lock = NSLock()
    func handle(_ req: URLRequest) -> (Data, URLResponse) {
        let url = req.url!
        func ok(_ obj: Any, _ status: Int = 200) -> (Data, URLResponse) {
            (try! JSONSerialization.data(withJSONObject: obj), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        switch url.path {
        case let p where p.contains("oauth-authorization-server"):
            return ok(["authorization_endpoint": "http://x/authorize", "token_endpoint": "http://x/token", "registration_endpoint": "http://x/register"])
        case "/register": return ok(["client_id": "client-1"], 201)
        case "/token":
            let form = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
            if form.contains("grant_type=refresh_token") {
                lock.withLock { refreshes += 1 }
                if revoked { return ok(["error": "invalid_grant", "error_description": "revoked"], 400) }
                return ok(["access_token": "fresh", "expires_in": 3600, "scope": "cadence:read"])
            }
            #expect(form.contains("code_verifier="))
            #expect(form.contains("resource=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fv1"))
            return ok(["access_token": "first", "refresh_token": "r1", "expires_in": 1, "scope": "cadence:read cadence:write"])
        default: return ok([:], 404)
        }
    }
}

@MainActor @Suite struct SessionTests {
    func make(_ server: FakeServer) -> Session {
        let config = CadenceConfig(server: URL(string: "http://localhost:3000")!)
        return Session(config: config, store: MemoryStore(), oauth: OAuthClient(config: config, http: { server.handle($0) }))
    }

    @Test func signsInWithPKCEAndRefreshesOnceWhenExpiring() async throws {
        let server = FakeServer()
        let session = make(server)
        try await session.signIn { authorize in
            let state = URLComponents(url: authorize, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "state" }!.value!
            #expect(authorize.absoluteString.contains("code_challenge_method=S256"))
            return URL(string: "app.cadence.ios:/oauth/callback?code=c1&state=\(state)")!
        }
        #expect(session.isSignedIn)
        // The first token expires in 1 s, so two concurrent callers share one refresh.
        async let a = session.accessToken()
        async let b = session.accessToken()
        let (ta, tb) = try await (a, b)
        #expect(ta == "fresh" && tb == "fresh")
        #expect(server.refreshes == 1)
    }

    @Test func aRevokedRefreshTokenSignsOut() async throws {
        let server = FakeServer()
        let session = make(server)
        try await session.signIn { url in
            let state = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "state" }!.value!
            return URL(string: "app.cadence.ios:/oauth/callback?code=c1&state=\(state)")!
        }
        server.revoked = true
        await #expect(throws: AuthError.signedOut) { try await session.accessToken() }
        #expect(!session.isSignedIn)
    }
}

@Suite struct SnapshotTests {
    @Test func roundTrips() throws {
        let d = UserDefaults(suiteName: "test-\(UUID())")!
        WidgetSnapshot.placeholder.save(d)
        #expect(WidgetSnapshot.load(d)?.target == 3)
    }
}
