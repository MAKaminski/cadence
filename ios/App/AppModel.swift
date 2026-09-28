import CadenceCore
import AuthenticationServices
import Foundation
import Observation
import WidgetKit

/// Everything the screens show, loaded from the Cadence API. No business rules here: approving,
/// editing, checks and scheduling all happen on the server.
@MainActor @Observable
final class AppModel {
    let session: Session
    let api: CadenceAPIClient

    var me: Me?
    var drafts: [Draft] = []
    var drafting = false
    var outreach: [OutreachWeek] = []
    var impact: Impact?
    var error: String?
    var loading = false

    init(config: CadenceConfig = .fromBundle()) {
        session = Session(config: config)
        api = CadenceAPIClient(session: session)
        // UI tests start signed out (the simulator's Keychain survives reinstalling the app).
        if ProcessInfo.processInfo.arguments.contains("-uitest") { session.signOut() }
    }

    var hasPlan: Bool { ["trialing", "active"].contains(me?.subscription?.status ?? "") }
    var canApprove: Bool { me?.scopes.contains(.approve) ?? false }
    var waiting: [Draft] { drafts.filter { $0.status == .draft || $0.status == .held } }
    var scheduled: [Draft] { drafts.filter { $0.status == .scheduled }.sorted { ($0.scheduledFor ?? .distantFuture) < ($1.scheduledFor ?? .distantFuture) } }
    var thisWeek: OutreachWeek? { outreach.last }

    func signIn(authenticate: (URL) async throws -> URL) async {
        do { try await session.signIn(authenticate: authenticate); await refresh() }
        catch AuthError.cancelled {}
        catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {} // the user closed the sheet
        catch { self.error = error.localizedDescription }
    }

    func signOut() {
        session.signOut()
        me = nil; drafts = []; outreach = []; impact = nil
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Reload what the app shows, then update the widget's snapshot.
    func refresh() async {
        guard session.isSignedIn else { return }
        loading = true
        defer { loading = false }
        do {
            me = try await api.me()
            guard hasPlan else { return }
            async let d = api.drafts()
            async let o = api.outreach(weeks: 12)
            async let i = api.impact()
            let (list, weeks, imp) = try await (d, o, i)
            drafts = list.drafts; drafting = list.drafting; outreach = weeks; impact = imp
            error = nil
            writeSnapshot()
        } catch AuthError.signedOut {
            signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func writeSnapshot() {
        let next = scheduled.first
        WidgetSnapshot(postsThisWeek: Int(thisWeek?.posts ?? 0), target: Int(thisWeek?.target ?? 0), nextPostAt: next?.scheduledFor,
                       nextPostLine: next?.body.split(separator: "\n").first.map(String.init), waitingForYou: waiting.count).save()
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Run an action that changes a draft, then reload. Returns false (and shows why) on failure.
    @discardableResult
    func act(_ action: () async throws -> Void) async -> Bool {
        do { try await action(); await refresh(); return true } catch { self.error = error.localizedDescription; return false }
    }
}
