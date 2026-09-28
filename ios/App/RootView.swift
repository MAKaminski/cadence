import AuthenticationServices
import CadenceCore
import StoreKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        Group {
            if !model.session.isSignedIn {
                WelcomeView()
            } else if model.me == nil {
                ProgressView("Loading your week…").task { await model.refresh() }
            } else if !model.hasPlan {
                NoPlanView()
            } else if model.me?.setupComplete == false {
                SetupNeededView()
            } else {
                TabView(selection: $router.tab) {
                    Tab("This week", systemImage: "calendar", value: .week) { WeekView() }
                    Tab("Check in", systemImage: "mic.fill", value: .checkin) { CheckinView() }
                    Tab("Results", systemImage: "chart.bar.fill", value: .results) { ResultsView() }
                    Tab("Settings", systemImage: "gearshape", value: .settings) { SettingsView() }
                }
            }
        }
        .alert("Something went wrong", isPresented: .init(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.error ?? "") }
    }
}

struct Logo: View {
    var size: CGFloat = 28
    var body: some View {
        HStack(alignment: .bottom, spacing: size * 0.12) {
            ForEach([0.4, 0.6, 0.8, 1.0], id: \.self) { h in
                Capsule().fill(.tint).frame(width: size * 0.2, height: size * h)
            }
        }
        .frame(height: size)
        .accessibilityHidden(true)
    }
}

struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var busy = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Logo(size: 56)
            VStack(spacing: 10) {
                Text("Cadence").font(.largeTitle.bold())
                Text("LinkedIn posts in your own voice, from two minutes a week.")
                    .font(.title3).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 12) {
                Label("Check in by voice or text", systemImage: "mic")
                Label("Drafts in your voice, checked against your facts", systemImage: "checkmark.seal")
                Label("Nothing posts until you approve it", systemImage: "hand.raised")
            }
            .font(.body)
            Spacer()
            Button {
                busy = true
                Task {
                    await model.signIn { url in
                        try await webAuth.authenticate(using: url, callback: .customScheme(CadenceConfig.redirectScheme), preferredBrowserSession: .shared, additionalHeaderFields: [:])
                    }
                    busy = false
                }
            } label: {
                Text(busy ? "Opening…" : "Sign in or create an account").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large).disabled(busy)
            .accessibilityIdentifier("signIn")
            Text("You'll sign in with LinkedIn or Apple on Cadence's secure page.\(model.session.config.isLocalDemo ? " Demo server: choose “Continue as demo user”." : "")")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(24)
    }
}

/// Signed in, no plan. In the US storefront the app links out to web checkout (no purchase in the app).
struct NoPlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var storefront: String?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Logo(size: 44)
            Text("Start your 7-day free trial").font(.title.bold())
            Text("$20 a month after the trial. Cancel any time.").foregroundStyle(.secondary)
            if storefront == "USA" || model.session.config.isLocalDemo {
                Button("Subscribe on the Cadence website") {
                    // Checkout runs in the same secure browser session as sign-in (so you're already
                    // signed in there) and closes itself via app.cadence.ios://subscribed.
                    Task {
                        guard let url = try? await model.api.checkoutLink() else { return }
                        _ = try? await webAuth.authenticate(using: url, callback: .customScheme(CadenceConfig.redirectScheme), preferredBrowserSession: .shared, additionalHeaderFields: [:])
                        await model.refresh()
                    }
                }
                .buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("subscribeOnWeb")
                Text("You'll finish on cadence's website, then come straight back here.").font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("Subscriptions aren't available in the app in your country yet. If you already subscribe, you're all set once your plan is active.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            Button("I've subscribed. Refresh") { Task { await model.refresh() } }
            Spacer()
            Button("Sign out", role: .destructive) { model.signOut() }.font(.footnote)
        }
        .padding(24)
        .task { storefront = await Storefront.current?.countryCode }
    }
}

/// Subscribed but the one-time setup isn't done: it runs on the web (same secure sheet), then returns.
struct SetupNeededView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.webAuthenticationSession) private var webAuth

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Logo(size: 44)
            Text("A few minutes of setup").font(.title.bold())
            Text("Who you are, the facts Cadence may state, three of your posts for your voice, and when to post. You do this once.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Set up Cadence") {
                Task {
                    let url = model.session.config.server.appending(path: "onboarding").appending(queryItems: [.init(name: "from", value: "ios")])
                    _ = try? await webAuth.authenticate(using: url, callback: .customScheme(CadenceConfig.redirectScheme), preferredBrowserSession: .shared, additionalHeaderFields: [:])
                    await model.refresh()
                }
            }
            .buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("setUp")
            Spacer()
        }
        .padding(24)
    }
}
