import CadenceAPI
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

public typealias Draft = Components.Schemas.Draft
public typealias Me = Components.Schemas.Me
public typealias Publication = Components.Schemas.Publication
public typealias OutreachWeek = Components.Schemas.Outreach.Element
public typealias Impact = Components.Schemas.Impact
public typealias CheckOutcome = Components.Schemas.Why.ChecksPayloadPayload.OutcomePayload

/// A problem the server described (RFC 9457), in words a person can act on.
public struct APIError: Error, LocalizedError, Equatable, Sendable {
    public let status: Int
    public let title: String
    public let detail: String
    public var errorDescription: String? { detail }
    public var needsPlan: Bool { status == 402 }
}

/// Adds the bearer token; on a 401, refreshes once and retries; turns problem+json into APIError.
struct AuthAndProblems: ClientMiddleware {
    let token: @Sendable (_ forceRefresh: Bool) async throws -> String

    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
                   next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        let bodyData: Data? = if let body { try await Data(collecting: body, upTo: 1_000_000) } else { nil }
        func send(_ force: Bool) async throws -> (HTTPResponse, HTTPBody?) {
            var r = request
            r.headerFields[.authorization] = "Bearer \(try await token(force))"
            return try await next(r, bodyData.map { HTTPBody($0) }, baseURL)
        }
        var (resp, respBody) = try await send(false)
        if resp.status.code == 401 { (resp, respBody) = try await send(true) }
        guard resp.status.code >= 400 else { return (resp, respBody) }
        let data = if let respBody { try await Data(collecting: respBody, upTo: 1_000_000) } else { Data() }
        let p = try? JSONDecoder().decode(ProblemBody.self, from: data)
        throw APIError(status: resp.status.code, title: p?.title ?? "Error", detail: p?.detail ?? "Cadence answered \(resp.status.code).")
    }
    struct ProblemBody: Decodable { let title: String?; let detail: String? }
}

/// Everything the app asks the server, with plain Swift signatures. Each call maps to one endpoint in
/// docs/API.md; the rules behind them live in the server's src/services.
public struct CadenceAPIClient: Sendable {
    let client: Client

    @MainActor public init(session: Session) {
        client = Client(
            serverURL: session.config.server,
            // The server's timestamps carry milliseconds (JavaScript's toISOString).
            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: URLSessionTransport(),
            middlewares: [AuthAndProblems(token: { force in try await session.accessToken(forceRefresh: force) })]
        )
    }

    func run<T>(_ call: () async throws -> T) async throws -> T {
        do { return try await call() } catch let e as ClientError {
            if let api = e.underlyingError as? APIError { throw api }
            if let auth = e.underlyingError as? AuthError { throw auth }
            if e.underlyingError is DecodingError {
                throw APIError(status: 0, title: "Update needed", detail: "Cadence sent something this version of the app can't read. Update the app from the App Store.")
            }
            if let url = e.underlyingError as? URLError {
                throw APIError(status: 0, title: "Offline", detail: url.code == .notConnectedToInternet ? "You're offline. Try again when you're connected." : "Couldn't reach Cadence. Try again in a moment.")
            }
            throw e
        }
    }

    public func me() async throws -> Me { try await run { try await client.getMe().ok.body.json } }
    public func drafts(_ status: [Draft.StatusPayload] = [.draft, .held, .scheduled]) async throws -> (drafts: [Draft], drafting: Bool) {
        try await run {
            let r = try await client.listDrafts(query: .init(status: status.map(\.rawValue).joined(separator: ","), limit: 50)).ok.body.json
            return (r.drafts, r.drafting)
        }
    }
    public func draft(_ id: String) async throws -> Draft { try await run { try await client.getDraft(path: .init(id: id)).ok.body.json } }
    public func checkIn(_ notes: String) async throws { _ = try await run { try await client.createCheckin(body: .json(.init(body: notes))).accepted } }
    public func edit(_ id: String, body: String) async throws -> Draft { try await run { try await client.editDraft(path: .init(id: id), body: .json(.init(body: body))).ok.body.json } }
    public func approve(_ id: String) async throws -> Draft { try await run { try await client.approveDraft(path: .init(id: id)).ok.body.json } }
    public func skip(_ id: String) async throws -> Draft { try await run { try await client.skipDraft(path: .init(id: id)).ok.body.json } }
    public func publications() async throws -> [Publication] { try await run { try await client.listPublications().ok.body.json.publications } }
    public func outreach(weeks: Int = 12) async throws -> [OutreachWeek] { try await run { try await client.getOutreach(query: .init(weeks: weeks)).ok.body.json } }
    public func impact() async throws -> Impact { try await run { try await client.getImpact().ok.body.json } }
    public func checkoutLink() async throws -> URL {
        try await run { URL(string: try await client.getCheckoutLink(query: .init(from: .ios)).ok.body.json.url)! }
    }
    public func registerDevice(token: String, sandbox: Bool) async throws {
        _ = try await run { try await client.registerDevice(body: .json(.init(token: token, environment: sandbox ? .sandbox : .production))).created }
    }
    public func deleteAccount() async throws {
        _ = try await run { try await client.deleteAccount(body: .json(.init(confirm: .deleteMyAccount))).ok }
    }
}
