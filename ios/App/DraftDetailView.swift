import CadenceCore
import SwiftUI

/// One draft: the full text, why it reads that way, and Approve / Edit / Skip. Approving always shows
/// the exact text and the slot first.
struct DraftDetailView: View {
    let id: String
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Draft?
    @State private var editing = false
    @State private var confirming = false
    @State private var showWhy = false

    var body: some View {
        ScrollView {
            if let d = draft {
                VStack(alignment: .leading, spacing: 16) {
                    HStack { StatusBadge(status: d.status); Text(d.why.angle).foregroundStyle(.secondary).font(.subheadline) }
                    if d.status == .held {
                        Label(d.why.checks.filter { $0.outcome == .held }.map { "\($0.label): \($0.detail ?? "")" }.joined(separator: "\n"), systemImage: "exclamationmark.triangle.fill")
                            .font(.callout).foregroundStyle(.red).padding().frame(maxWidth: .infinity, alignment: .leading)
                            .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }
                    Text(d.body).font(.body).textSelection(.enabled)
                    Button { showWhy = true } label: { Label("Why this draft", systemImage: "questionmark.circle") }
                        .accessibilityIdentifier("why")
                }
                .padding()
            } else {
                ProgressView().padding(.top, 80)
            }
        }
        .navigationTitle("Draft").navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar) // the Skip / Edit / Approve bar takes its place
        .toolbar {
            if let d = draft, [.draft, .held, .scheduled].contains(d.status) {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Skip", role: .destructive) { Task { if await model.act({ _ = try await model.api.skip(id) }) { dismiss() } } }
                    Spacer()
                    Button("Edit") { editing = true }
                    if d.status != .scheduled {
                        Button("Approve") { confirming = true }.buttonStyle(.borderedProminent).accessibilityIdentifier("approve")
                    }
                }
            }
        }
        .confirmationDialog("Post exactly this at your next slot?", isPresented: $confirming, titleVisibility: .visible) {
            if model.canApprove {
                Button("Approve and schedule") { Task { if await model.act({ draft = try await model.api.approve(id) }) { dismiss() } } }
            } else {
                Button("Allow approving from this iPhone") { model.signOut() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(model.canApprove ? "It goes out once, through LinkedIn's official API, on your schedule. You can still skip it until then." : "When you connected this iPhone, approving wasn't allowed. Sign in again and tick “Approve drafts to post”.")
        }
        .sheet(isPresented: $showWhy) { if let d = draft { WhySheet(draft: d) } }
        .sheet(isPresented: $editing) { if let d = draft { EditDraftView(draft: d) { draft = $0 } } }
        .task { draft = try? await model.api.draft(id) }
    }
}

struct WhySheet: View {
    let draft: Draft
    var body: some View {
        NavigationStack {
            List {
                Section("Angle") { Text(draft.why.why) }
                Section("Checks") {
                    ForEach(draft.why.checks, id: \.id) { c in
                        Label {
                            VStack(alignment: .leading) { Text(c.label).font(.body); if let d = c.detail { Text(d).font(.caption).foregroundStyle(.secondary) } }
                        } icon: { Image(systemName: icon(c.outcome)).foregroundStyle(color(c.outcome)) }
                    }
                }
                if !draft.why.adjustments.isEmpty { Section("What changed") { ForEach(draft.why.adjustments, id: \.self) { Text($0) } } }
                Section { Text("Picked from \(Int(draft.why.variantsConsidered)) variants\(draft.why.rewritten ? ", rewritten once" : "") · \(draft.why.model) · $\(draft.why.costUsd, specifier: "%.4f")").font(.caption).foregroundStyle(.secondary) }
            }
            .navigationTitle("Why this draft").navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }
    func icon(_ o: CheckOutcome) -> String {
        switch o { case .pass: "checkmark.circle.fill"; case .fixed: "wrench.adjustable.fill"; case .rewrite: "arrow.triangle.2.circlepath"; case .held: "exclamationmark.triangle.fill" }
    }
    func color(_ o: CheckOutcome) -> Color {
        switch o { case .pass: .green; case .fixed: .blue; case .rewrite: .orange; case .held: .red }
    }
}

struct EditDraftView: View {
    let draft: Draft
    let saved: (Draft) -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            TextEditor(text: $text).padding(.horizontal).accessibilityIdentifier("editor")
                .navigationTitle("Edit draft").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { Task { if await model.act({ saved(try await model.api.edit(draft.id, body: text)) }) { dismiss() } } }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    Text("Your version is re-checked but never rewritten. It needs approving again.").font(.footnote).foregroundStyle(.secondary).padding()
                }
        }
        .onAppear { text = draft.body }
    }
}
