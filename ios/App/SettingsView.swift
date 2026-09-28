import CadenceCore
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var confirmDelete = false
    @State private var deleting = false

    var body: some View {
        NavigationStack {
            List {
                if let me = model.me {
                    Section("Account") {
                        LabeledContent("Signed in as", value: me.email ?? me.name)
                        LabeledContent("Plan", value: me.subscription?.status.capitalized ?? "None")
                        LabeledContent("Model use this month", value: "$\(String(format: "%.2f", me.modelUseThisMonthUsd)) of $\(Int(me.modelAllowanceUsd))")
                        Button("Manage subscription on the web") { openURL(model.session.config.server.appending(path: "app/settings")) }
                    }
                    Section {
                        LabeledContent("LinkedIn", value: me.linkedin?.status.capitalized ?? "Not connected")
                        if me.linkedin == nil || me.linkedin?.status != "active" {
                            Button("Connect LinkedIn") { openURL(model.session.config.server.appending(path: "login")) }
                        }
                    } header: { Text("Connection") } footer: { Text("LinkedIn asks apps to reconnect about every 60 days. Cadence reminds you a week before.") }
                    Section("This iPhone") {
                        LabeledContent("Can approve drafts", value: model.canApprove ? "Yes" : "No")
                        Button("Turn on notifications") { Task { await Push.requestIfNeeded() } }
                        Button("Edit your setup on the web") { openURL(model.session.config.server.appending(path: "onboarding").appending(queryItems: [.init(name: "edit", value: "1")])) }
                    }
                }
                Section {
                    Link("Terms", destination: model.session.config.server.appending(path: "terms"))
                    Link("Privacy", destination: model.session.config.server.appending(path: "privacy"))
                    Link("How Cadence works", destination: model.session.config.server.appending(path: "how-it-works"))
                }
                Section {
                    Button("Sign out") { model.signOut() }
                    Button(deleting ? "Deleting…" : "Delete account", role: .destructive) { confirmDelete = true }
                        .disabled(deleting).accessibilityIdentifier("deleteAccount")
                } footer: {
                    Text("Deleting cancels your web subscription immediately and removes your setup, drafts, records and LinkedIn connection. Posts already on LinkedIn stay there.")
                }
            }
            .navigationTitle("Settings")
        }
        .confirmationDialog("Delete your Cadence account?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete account and everything in it", role: .destructive) {
                deleting = true
                Task { if await model.act({ try await model.api.deleteAccount() }) { model.signOut() }; deleting = false }
            }
            Button("Cancel", role: .cancel) {}
        } message: { Text("This can't be undone.") }
    }
}
