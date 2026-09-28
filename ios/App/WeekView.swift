import CadenceCore
import SwiftUI

struct WeekView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                Section {
                    WeekSummary()
                }
                if model.drafting {
                    Section { Label("Writing drafts from your check-in…", systemImage: "hourglass").accessibilityIdentifier("drafting") }
                }
                if model.waiting.isEmpty && model.scheduled.isEmpty && !model.drafting {
                    Section {
                        ContentUnavailableView("No drafts waiting", systemImage: "tray", description: Text("Check in with a few notes about your week and drafts appear here in about a minute."))
                    }
                }
                if !model.waiting.isEmpty {
                    Section("Waiting for you") { ForEach(model.waiting, id: \.id) { d in NavigationLink(value: d.id) { DraftRow(draft: d) } } }
                }
                if !model.scheduled.isEmpty {
                    Section("Scheduled") { ForEach(model.scheduled, id: \.id) { d in NavigationLink(value: d.id) { DraftRow(draft: d) } } }
                }
            }
            .navigationTitle("This week")
            .navigationDestination(for: String.self) { id in DraftDetailView(id: id) }
            .refreshable { await model.refresh() }
            .task(id: model.drafting) {
                // While drafts are being written, check every few seconds.
                while model.drafting && !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(3))
                    await model.refresh()
                }
            }
            .task { if !model.waiting.isEmpty { await Push.requestIfNeeded() } }
        }
    }
}

struct WeekSummary: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let w = model.thisWeek
        HStack {
            VStack(alignment: .leading) {
                Text("\(Int(w?.posts ?? 0)) of \(Int(w?.target ?? 0))").font(.title.bold().monospacedDigit())
                Text("posts this week").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Gauge(value: min(w?.posts ?? 0, w?.target ?? 1), in: 0...max(w?.target ?? 1, 1)) { EmptyView() }
                .gaugeStyle(.accessoryCircularCapacity).tint(.accentColor)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Int(w?.posts ?? 0)) of \(Int(w?.target ?? 0)) posts published this week")
    }
}

struct StatusBadge: View {
    let status: Draft.StatusPayload
    var body: some View {
        let (text, color): (String, Color) = switch status {
        case .held: ("Held for you", .red)
        case .draft: ("Ready to review", .secondary)
        case .scheduled: ("Scheduled", .accentColor)
        case .published: ("Published", .green)
        case .skipped: ("Skipped", .secondary)
        case .failed: ("Not posted", .red)
        }
        Text(text).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule()).foregroundStyle(color)
    }
}

struct DraftRow: View {
    let draft: Draft
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                StatusBadge(status: draft.status)
                Text(draft.why.angle).font(.caption).foregroundStyle(.secondary)
            }
            Text(draft.body).lineLimit(3).font(.subheadline)
            if let at = draft.scheduledFor, draft.status == .scheduled {
                Label(at.formatted(date: .abbreviated, time: .shortened), systemImage: "clock").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("draft-\(draft.status.rawValue)")
    }
}
