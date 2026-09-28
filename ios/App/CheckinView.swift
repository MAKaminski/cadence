import CadenceCore
import SwiftUI

struct CheckinView: View {
    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router
    @State private var dictation = Dictation()
    @State private var saving = false
    @FocusState private var focused: Bool

    var body: some View {
        @Bindable var dictation = dictation
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("What happened this week? What did you work on, learn or get asked? Rough notes are fine; Cadence only uses what you say here and the facts from your setup.")
                    .font(.callout).foregroundStyle(.secondary)
                TextEditor(text: $dictation.text)
                    .focused($focused)
                    .frame(minHeight: 180)
                    .padding(8)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("checkinText")
                if Dictation.supported {
                    TalkButton(listening: dictation.listening) { down in
                        Task { if down { focused = false; await dictation.start() } else { await dictation.stop() } }
                    }
                }
                if let u = dictation.unavailable { Text(u).font(.footnote).foregroundStyle(.red) }
                if model.session.config.isLocalDemo {
                    Button("Use example notes (demo)") { dictation.text = "This week a founder asked how to model heat-pump subsidies before they're approved. My answer: model the timing, not the amount. Also closed the books for a new client in 5 days, first month." }
                        .font(.footnote)
                }
                Spacer()
                Button {
                    saving = true
                    Task {
                        if await model.act({ try await model.api.checkIn(dictation.text) }) { dictation.text = ""; router.tab = .week }
                        saving = false
                    }
                } label: { Text(saving ? "Saving…" : "Save check-in").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
                .disabled(dictation.text.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 || saving || dictation.listening)
                .accessibilityIdentifier("saveCheckin")
            }
            .padding()
            .navigationTitle("Check in")
        }
    }
}

/// Hold to talk; release to stop. VoiceOver users double-tap to toggle.
struct TalkButton: View {
    let listening: Bool
    let changed: (Bool) -> Void
    @State private var pressed = false

    var body: some View {
        Label(listening ? "Listening… release to stop" : "Hold to talk", systemImage: listening ? "waveform" : "mic.fill")
            .font(.headline)
            .frame(maxWidth: .infinity).padding()
            .background(listening ? Color.accentColor : Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(listening ? .white : .accentColor)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in if !pressed { pressed = true; changed(true) } }
                .onEnded { _ in pressed = false; changed(false) })
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { changed(!listening) }
    }
}
